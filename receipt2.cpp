
#include <windows.h>
#include <gdiplus.h>
#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <ctime>
#include <algorithm>
#include <cwctype>

#pragma comment (lib,"Gdiplus.lib")
#pragma comment (lib, "Winspool.lib")
#pragma comment (lib, "Gdi32.lib")

using namespace Gdiplus;
using namespace std;

struct ReceiptItem {
    wstring name;
    wstring qty;
    wstring unitPrice;
    wstring lineTotal;
};

struct PaymentInfo {
    wstring label;
    bool debtStamp;
    bool isReturnFlow;
};

static wstring toLower(const wstring& s) {
    wstring out = s;
    transform(out.begin(), out.end(), out.begin(), towlower);
    return out;
}

static wstring trimWide(const wstring& s) {
    size_t start = 0;
    while (start < s.size() && iswspace(s[start])) start++;
    size_t end = s.size();
    while (end > start && iswspace(s[end - 1])) end--;
    return s.substr(start, end - start);
}

static bool startsWith(const wstring& text, const wstring& prefix) {
    return text.size() >= prefix.size() && equal(prefix.begin(), prefix.end(), text.begin());
}

static PaymentInfo parsePaymentInfo(const wstring& raw) {
    wstring v = toLower(raw);
    if (v.find(L"refund_cash") != wstring::npos) return { L"Qaytarish (Naqd)", false, true };
    if (v.find(L"refund_card") != wstring::npos) return { L"Qaytarish (Karta)", false, true };
    if (v.find(L"debt_offset") != wstring::npos) return { L"Qarzdan yechildi", false, true };
    if (v.find(L"mixed") != wstring::npos || v.find(L"aralash") != wstring::npos) return { L"Aralash", false, false };
    if (v.find(L"naqd") != wstring::npos || v.find(L"cash") != wstring::npos) return { L"Naqd", false, false };
    if (v.find(L"karta") != wstring::npos || v.find(L"card") != wstring::npos) return { L"Karta", false, false };
    if (v.find(L"qarz") != wstring::npos || v.find(L"debt") != wstring::npos) return { L"Qarz", true, false };
    return { raw.empty() ? L"Naqd" : raw, false, false };
}

static vector<wstring> splitWide(const wstring& s, wchar_t delim) {
    vector<wstring> parts;
    wstring cur;
    for (wchar_t c : s) {
        if (c == delim) {
            parts.push_back(cur);
            cur.clear();
        }
        else {
            cur.push_back(c);
        }
    }
    parts.push_back(cur);
    return parts;
}

// ItemsData format: "Name|Qty|UnitPrice|LineTotal;Name|Qty|UnitPrice|LineTotal"
static vector<ReceiptItem> parseItems(const wstring& data) {
    vector<ReceiptItem> items;
    if (data.empty()) return items;

    vector<wstring> rows = splitWide(data, L';');
    for (const auto& row : rows) {
        if (row.empty()) continue;
        vector<wstring> parts = splitWide(row, L'|');
        ReceiptItem item;
        item.name = parts.size() > 0 ? parts[0] : L"";
        item.qty = parts.size() > 1 ? parts[1] : L"";
        item.unitPrice = parts.size() > 2 ? parts[2] : L"";
        item.lineTotal = parts.size() > 3 ? parts[3] : L"";
        items.push_back(item);
    }
    return items;
}

static void drawHeadingLines(Graphics& graphics, const wstring& rawHeading, Font* headerFont, int width, float& y, SolidBrush* brush, StringFormat* centerFormat) {
    vector<wstring> lines = splitWide(rawHeading, L'\n');
    if (lines.empty()) lines.push_back(rawHeading);

    bool printed = false;
    for (const auto& lineRaw : lines) {
        wstring line = trimWide(lineRaw);
        if (line.empty()) continue;

        if (startsWith(line, L"CENTER ")) {
            line = trimWide(line.substr(7));
        }

        if (line.empty()) continue;
        graphics.DrawString(line.c_str(), -1, headerFont, RectF(0, y, (REAL)width, 50), centerFormat, brush);
        y += 46;
        printed = true;
    }

    if (!printed) {
        graphics.DrawString(L"Do'kondor POS", -1, headerFont, RectF(0, y, (REAL)width, 50), centerFormat, brush);
        y += 46;
    }
}

bool PrintReceipt(const wstring& printerName,
    const wstring& storeName,
    const wstring& itemsData,
    const wstring& subtotal,
    const wstring& discount,
    const wstring& total,
    const wstring& paymentTypeRaw) {
    GdiplusStartupInput gdiplusStartupInput;
    ULONG_PTR gdiplusToken;
    GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, NULL);

    HDC hdc = CreateDC(L"WINSPOOL", printerName.c_str(), NULL, NULL);
    if (!hdc) return false;

    DOCINFO docInfo = { sizeof(DOCINFO) };
    docInfo.lpszDocName = L"POS Receipt (UZ)";

    if (StartDoc(hdc, &docInfo) > 0) {
        if (StartPage(hdc) > 0) {
            Graphics graphics(hdc);

            graphics.SetTextRenderingHint(TextRenderingHintSingleBitPerPixelGridFit);
            graphics.SetSmoothingMode(SmoothingModeNone);
            graphics.SetInterpolationMode(InterpolationModeNearestNeighbor);
            graphics.SetPageUnit(UnitPixel);

            int width = 540;   // 80mm printer (safe width)
            int margin = 8;
            float y = 10;

            SolidBrush blackBrush(Color(255, 0, 0, 0));
            Pen linePen(&blackBrush, 3);

            FontFamily monoFont(L"Lucida Console");
            Font fontHeader(&monoFont, 36, FontStyleBold, UnitPixel);
            Font fontSubHeader(&monoFont, 22, FontStyleBold, UnitPixel);
            Font fontBody(&monoFont, 20, FontStyleRegular, UnitPixel);
            Font fontTotal(&monoFont, 28, FontStyleBold, UnitPixel);
            Font fontStamp(&monoFont, 26, FontStyleBold, UnitPixel);

            StringFormat centerFormat;
            centerFormat.SetAlignment(StringAlignmentCenter);
            StringFormat rightFormat;
            rightFormat.SetAlignment(StringAlignmentFar);

            PaymentInfo payment = parsePaymentInfo(paymentTypeRaw);
            bool isDebt = payment.debtStamp;

            // Heading lines (supports multi-line and optional "CENTER " prefix)
            drawHeadingLines(graphics, storeName, &fontHeader, width, y, &blackBrush, &centerFormat);
            y += 8;

            // QARZ mark
            if (isDebt) {
                graphics.DrawString(L"QARZ", -1, &fontStamp, RectF(0, y - 40, (REAL)width - margin, 30), &rightFormat,
                    &blackBrush);
            }

            // Date/time
            time_t now = time(0);
            tm ltm;
            localtime_s(&ltm, &now);
            wchar_t dateStr[120];
            swprintf(dateStr, 120, L"Sana: %02d/%02d/%d %02d:%02d",
                ltm.tm_mday, ltm.tm_mon + 1, ltm.tm_year + 1900, ltm.tm_hour, ltm.tm_min);
            graphics.DrawString(dateStr, -1, &fontBody, PointF((REAL)margin, y), &blackBrush);
            y += 28;

            // Payment type
            wstring payLine = L"To'lov turi: " + payment.label;
            graphics.DrawString(payLine.c_str(), -1, &fontBody, PointF((REAL)margin, y), &blackBrush);
            y += 30;

            // Top line
            graphics.DrawLine(&linePen, (REAL)margin, (REAL)y, (REAL)(width - margin), (REAL)y);
            y += 12;

            // Headers
            float colName = 260;
            float colQty = 70;
            float colPrice = 90;
            float colTotal = width - margin * 2 - colName - colQty - colPrice;

            graphics.DrawString(L"MAHSULOT", -1, &fontSubHeader, RectF((REAL)margin, y, colName, 30), nullptr, &blackBrush);
            graphics.DrawString(L"MIQ", -1, &fontSubHeader, RectF((REAL)margin + colName, y, colQty, 30), nullptr, &blackBrush);
            graphics.DrawString(L"NARX", -1, &fontSubHeader, RectF((REAL)margin + colName + colQty, y, colPrice, 30), &rightFormat,
                &blackBrush);
            graphics.DrawString(L"JAMI", -1, &fontSubHeader, RectF((REAL)margin + colName + colQty + colPrice, y, colTotal, 30),
                &rightFormat, &blackBrush);
            y += 30;

            // Items
            vector<ReceiptItem> items = parseItems(itemsData);
            for (const auto& item : items) {
                graphics.DrawString(item.name.c_str(), -1, &fontBody, RectF((REAL)margin, y, colName, 28), nullptr, &blackBrush);
                graphics.DrawString(item.qty.c_str(), -1, &fontBody, RectF((REAL)margin + colName, y, colQty, 28), &rightFormat,
                    &blackBrush);
                graphics.DrawString(item.unitPrice.c_str(), -1, &fontBody, RectF((REAL)margin + colName + colQty, y, colPrice, 28),
                    &rightFormat, &blackBrush);
                graphics.DrawString(item.lineTotal.c_str(), -1, &fontBody, RectF((REAL)margin + colName + colQty + colPrice, y,
                    colTotal, 28), &rightFormat, &blackBrush);
                y += 26;
            }

            // Bottom line
            y += 10;
            graphics.DrawLine(&linePen, (REAL)margin, (REAL)y, (REAL)(width - margin), (REAL)y);
            y += 12;

            // Totals
            wstring subLine;
            wstring discLine;
            wstring totalLine;
            if (payment.isReturnFlow) {
                subLine = L"Qaytgan: " + subtotal + L" so'm";
                discLine = L"Qarzdan yechildi: " + discount + L" so'm";
                totalLine = L"Refund: " + total + L" so'm";
            }
            else {
                subLine = L"Jami: " + subtotal + L" so'm";
                discLine = L"Chegirma: " + discount + L" so'm";
                totalLine = L"Umumiy : " + total + L" so'm";
            }

            graphics.DrawString(subLine.c_str(), -1, &fontBody, RectF((REAL)margin, y, (REAL)width - margin, 28), &rightFormat,
                &blackBrush);
            y += 26;
            graphics.DrawString(discLine.c_str(), -1, &fontBody, RectF((REAL)margin, y, (REAL)width - margin, 28), &rightFormat,
                &blackBrush);
            y += 26;
            graphics.DrawString(totalLine.c_str(), -1, &fontTotal, RectF((REAL)margin, y, (REAL)width - margin, 36), &rightFormat,
                &blackBrush);
            y += 50;

            // Footer
            graphics.DrawString(L"Xaridingiz uchun rahmat!", -1, &fontBody, RectF(0, y, (REAL)width, 30), &centerFormat,
                &blackBrush);
            y += 40;

            EndPage(hdc);
        }
        EndDoc(hdc);
    }

    DeleteDC(hdc);
    GdiplusShutdown(gdiplusToken);
    return true;
}

// Usage:
// receipt.exe PrinterName StoreName ItemsData Subtotal Discount Total PaymentType
int wmain(int argc, wchar_t* argv[]) {
    if (argc < 8) {
        wcout << L"Error: Not enough arguments." << endl;
        return 1;
    }

    wstring printerName = argv[1];
    wstring storeName = argv[2];
    wstring itemsData = argv[3];
    wstring subtotal = argv[4];
    wstring discount = argv[5];
    wstring total = argv[6];
    wstring paymentType = argv[7];

    if (PrintReceipt(printerName, storeName, itemsData, subtotal, discount, total, paymentType)) {
        wcout << L"Success" << endl;
        return 0;
    }
    return 1;
}
