
// receipt2.cpp — ESC/POS raw receipt printer for 80mm thermal (XPrinter XP-80T)
// Usage: receipt2.exe PrinterName StoreName ItemsData Subtotal Discount Total PayType
// ItemsData: "Name|Qty|UnitPrice|LineTotal;Name|Qty|..."
// PayType:   cash | card | mixed | debt | refund_cash | refund_card | debt_offset

#include <windows.h>
#include <shellapi.h>
#include <iostream>
#include <string>
#include <vector>
#include <ctime>
#include <algorithm>
#include <cwctype>

#pragma comment(lib, "Winspool.lib")
#pragma comment(lib, "Shell32.lib")

// 80mm paper @ 203 DPI = 576 dots wide
// Standard 12-dot font = 48 chars per line
static const int COLS = 48;

// ── byte buffer ──────────────────────────────────────────────────────────────

typedef std::vector<uint8_t> Buf;

static void raw(Buf& b, std::initializer_list<uint8_t> v) {
    for (uint8_t x : v) b.push_back(x);
}
static void str(Buf& b, const char* s) {
    while (*s) b.push_back((uint8_t)*s++);
}
static void nl(Buf& b) { b.push_back(0x0A); }

// ── ESC/POS commands ─────────────────────────────────────────────────────────

static void cmdInit(Buf& b)          { raw(b, {0x1B, 0x40}); }           // ESC @
static void cmdLeft(Buf& b)          { raw(b, {0x1B, 0x61, 0x00}); }    // ESC a 0
static void cmdCenter(Buf& b)        { raw(b, {0x1B, 0x61, 0x01}); }    // ESC a 1
static void cmdRight(Buf& b)         { raw(b, {0x1B, 0x61, 0x02}); }    // ESC a 2
static void cmdBold(Buf& b, bool on) { raw(b, {0x1B, 0x45, (uint8_t)(on ? 1 : 0)}); } // ESC E
static void cmdDouble(Buf& b)        { raw(b, {0x1B, 0x21, 0x30}); }    // ESC ! 0x30 double W+H
static void cmdNormal(Buf& b)        { raw(b, {0x1B, 0x21, 0x00}); }    // ESC ! 0 normal
static void cmdCut(Buf& b)           { raw(b, {0x1D, 0x56, 0x41, 0x05}); } // GS V A 5

// ── string helpers ───────────────────────────────────────────────────────────

static std::string narrow(const std::wstring& s) {
    if (s.empty()) return {};
    int n = WideCharToMultiByte(CP_ACP, 0, s.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (n <= 1) return {};
    std::string out(n - 1, '\0');
    WideCharToMultiByte(CP_ACP, 0, s.c_str(), -1, &out[0], n, nullptr, nullptr);
    return out;
}

static void wstr(Buf& b, const std::wstring& s) {
    std::string a = narrow(s);
    for (uint8_t c : a) b.push_back(c);
}

static std::wstring wtrim(const std::wstring& s) {
    size_t l = 0, r = s.size();
    while (l < r && iswspace(s[l])) ++l;
    while (r > l && iswspace(s[r - 1])) --r;
    return s.substr(l, r - l);
}

static std::vector<std::wstring> wsplit(const std::wstring& s, wchar_t d) {
    std::vector<std::wstring> v;
    std::wstring cur;
    for (wchar_t c : s) {
        if (c == d) { v.push_back(cur); cur.clear(); }
        else cur.push_back(c);
    }
    v.push_back(cur);
    return v;
}

static std::wstring wlower(const std::wstring& s) {
    std::wstring o = s;
    std::transform(o.begin(), o.end(), o.begin(), towlower);
    return o;
}

// fixed-width string helpers
static std::string rpad(const std::string& s, int w) {
    if ((int)s.size() >= w) return s.substr(0, w);
    return s + std::string(w - (int)s.size(), ' ');
}
static std::string lpad(const std::string& s, int w) {
    if ((int)s.size() >= w) return s.substr(0, w);
    return std::string(w - (int)s.size(), ' ') + s;
}
static std::string divider(char c = '-') { return std::string(COLS, c); }

static bool isPositive(const std::wstring& s) {
    try { return std::stod(narrow(s)) > 0.001; }
    catch (...) { return false; }
}

// ── data types ───────────────────────────────────────────────────────────────

struct Item { std::wstring name, qty, price, total; };

struct PayInfo {
    std::wstring label;
    bool isReturn;
    bool isDebt;
};

static PayInfo parsePayment(const std::wstring& raw) {
    std::wstring v = wlower(raw);
    if (v.find(L"refund_cash")  != std::wstring::npos) return {L"Qaytarish (Naqd)",  true,  false};
    if (v.find(L"refund_card")  != std::wstring::npos) return {L"Qaytarish (Karta)", true,  false};
    if (v.find(L"debt_offset")  != std::wstring::npos) return {L"Qarzdan yechildi",  true,  false};
    if (v.find(L"mixed")        != std::wstring::npos ||
        v.find(L"aralash")      != std::wstring::npos)  return {L"Aralash",           false, false};
    if (v.find(L"cash")         != std::wstring::npos ||
        v.find(L"naqd")         != std::wstring::npos)  return {L"Naqd",              false, false};
    if (v.find(L"card")         != std::wstring::npos ||
        v.find(L"karta")        != std::wstring::npos)  return {L"Karta",             false, false};
    if (v.find(L"debt")         != std::wstring::npos ||
        v.find(L"qarz")         != std::wstring::npos)  return {L"Qarz",              false, true};
    return {raw.empty() ? L"Naqd" : raw, false, false};
}

static std::vector<Item> parseItems(const std::wstring& data) {
    std::vector<Item> items;
    for (auto& row : wsplit(data, L';')) {
        if (wtrim(row).empty()) continue;
        auto p = wsplit(row, L'|');
        Item it;
        it.name  = p.size() > 0 ? wtrim(p[0]) : L"";
        it.qty   = p.size() > 1 ? wtrim(p[1]) : L"";
        it.price = p.size() > 2 ? wtrim(p[2]) : L"";
        it.total = p.size() > 3 ? wtrim(p[3]) : L"";
        items.push_back(it);
    }
    return items;
}

// ── item row layout ──────────────────────────────────────────────────────────
// COLS = 48:  Name[24]  Qty[4]  UnitPrice[10]  LineTotal[10]

static void appendItem(Buf& b, const Item& item) {
    static const int NC = 24, QC = 4, PC = 10, TC = 10;

    std::string name  = narrow(item.name);
    std::string qty   = narrow(item.qty);
    std::string price = narrow(item.price);
    std::string total = narrow(item.total);

    // first line: all columns
    str(b, (rpad(name.substr(0, NC), NC)
          + lpad(qty, QC)
          + lpad(price, PC)
          + lpad(total, TC)).c_str());
    nl(b);

    // wrap remaining name characters onto continuation lines
    size_t pos = NC;
    while (pos < name.size()) {
        str(b, rpad(name.substr(pos, NC), NC).c_str());
        nl(b);
        pos += NC;
    }
}

// ── Windows RAW print ────────────────────────────────────────────────────────

static bool printRaw(const std::wstring& printer, const Buf& data) {
    HANDLE h = nullptr;
    if (!OpenPrinterW((LPWSTR)printer.c_str(), &h, nullptr)) {
        std::wcerr << L"OpenPrinter failed: " << printer
                   << L" (error " << GetLastError() << L")\n";
        return false;
    }

    DOC_INFO_1W di = {};
    di.pDocName  = (LPWSTR)L"Receipt";
    di.pDatatype = (LPWSTR)L"RAW";

    if (!StartDocPrinterW(h, 1, (LPBYTE)&di)) {
        ClosePrinter(h);
        return false;
    }
    if (!StartPagePrinter(h)) {
        EndDocPrinter(h); ClosePrinter(h);
        return false;
    }

    DWORD written = 0;
    WritePrinter(h, (LPVOID)data.data(), (DWORD)data.size(), &written);

    EndPagePrinter(h);
    EndDocPrinter(h);
    ClosePrinter(h);
    return true;
}

// ── entry point ──────────────────────────────────────────────────────────────
// Use CommandLineToArgvW so wide char args work with both MinGW and MSVC.

int main() {
    int argc = 0;
    wchar_t** argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv) { std::cerr << "CommandLineToArgvW failed\n"; return 1; }

    if (argc < 8) {
        std::wcerr
            << L"Usage: receipt2.exe Printer Store Items Subtotal Discount Total PayType\n";
        LocalFree(argv);
        return 1;
    }

    std::wstring printer  = argv[1];
    std::wstring store    = argv[2]; // "StoreName\nPhone"
    std::wstring itemsRaw = argv[3];
    std::wstring sub      = argv[4];
    std::wstring disc     = argv[5];
    std::wstring tot      = argv[6];
    std::wstring payRaw   = argv[7];

    auto payment    = parsePayment(payRaw);
    auto items      = parseItems(itemsRaw);
    auto storeLines = wsplit(store, L'\n');

    Buf b;
    cmdInit(b);

    // ── header ───────────────────────────────────────────────────────────────
    cmdCenter(b);
    cmdBold(b, true);
    cmdDouble(b);
    wstr(b, wtrim(!storeLines.empty() ? storeLines[0] : store));
    nl(b);
    cmdNormal(b);
    cmdBold(b, false);

    if (storeLines.size() > 1 && !wtrim(storeLines[1]).empty()) {
        wstr(b, wtrim(storeLines[1]));
        nl(b);
    }
    nl(b);

    // ── date + payment type ──────────────────────────────────────────────────
    cmdLeft(b);
    time_t now = time(nullptr);
    tm lt = *localtime(&now);
    char ds[64];
    snprintf(ds, sizeof(ds), "Sana: %02d/%02d/%d  %02d:%02d",
             lt.tm_mday, lt.tm_mon + 1, lt.tm_year + 1900,
             lt.tm_hour, lt.tm_min);
    str(b, ds); nl(b);

    str(b, "To'lov: "); wstr(b, payment.label);
    if (payment.isDebt) str(b, " [QARZ]");
    nl(b);

    // ── column header ────────────────────────────────────────────────────────
    // NC=24  QC=4  PC=10  TC=10  → 48 total
    str(b, divider().c_str()); nl(b);
    str(b, (rpad("MAHSULOT", 24) + lpad("MIQ", 4)
          + lpad("NARX", 10)     + lpad("JAMI", 10)).c_str());
    nl(b);
    str(b, divider().c_str()); nl(b);

    // ── items ────────────────────────────────────────────────────────────────
    for (const auto& it : items) appendItem(b, it);
    str(b, divider().c_str()); nl(b);

    // ── totals ───────────────────────────────────────────────────────────────
    cmdRight(b);
    if (payment.isReturn) {
        str(b, "Qaytgan: "); wstr(b, sub); str(b, " so'm"); nl(b);
        if (isPositive(disc)) {
            str(b, "Qarzdan yechildi: "); wstr(b, disc); str(b, " so'm"); nl(b);
        }
        cmdBold(b, true);
        str(b, "Refund: "); wstr(b, tot); str(b, " so'm"); nl(b);
        cmdBold(b, false);
    } else {
        str(b, "Jami: "); wstr(b, sub); str(b, " so'm"); nl(b);
        if (isPositive(disc)) {
            str(b, "Chegirma: "); wstr(b, disc); str(b, " so'm"); nl(b);
        }
        cmdBold(b, true);
        str(b, "UMUMIY: "); wstr(b, tot); str(b, " so'm"); nl(b);
        cmdBold(b, false);
    }

    // ── footer + cut ─────────────────────────────────────────────────────────
    nl(b);
    cmdCenter(b);
    str(b, "Xaridingiz uchun rahmat!"); nl(b);
    nl(b); nl(b); nl(b);
    cmdCut(b);

    LocalFree(argv);

    if (!printRaw(printer, b)) {
        std::wcerr << L"Print failed for printer: " << printer << L"\n";
        return 1;
    }

    std::wcout << L"Success\n";
    return 0;
}
