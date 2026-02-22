#include <windows.h>
#include <gdiplus.h>
#include <iostream>
#include <string>
#include <vector>
#include <algorithm>

// Link against Gdiplus.lib and Winspool.lib
#pragma comment (lib,"Gdiplus.lib")
#pragma comment (lib, "Winspool.lib")
#pragma comment (lib, "Gdi32.lib")

using namespace Gdiplus;
using namespace std;

// --- EAN-8 Logic (Internal Vector Generation) ---
// This ensures we draw mathematical lines, not a fuzzy image.
string getEAN8Binary(string code) {
    // EAN-8 structure: Left Guard (101) + 4 Digits + Center Guard (01010) + 4 Digits + Right Guard (101)
    const string L_PATTERNS[] = {
        "0001101", "0011001", "0010011", "0111101", "0100011",
        "0110001", "0101111", "0111011", "0110111", "0001011"
    };
    const string R_PATTERNS[] = {
        "1110010", "1100110", "1101100", "1000010", "1011100",
        "1001110", "1010000", "1000100", "1001000", "1110100"
    };

    if (code.length() != 8) return "";

    string binary = "101"; // Start Guard

    // Left 4 digits
    for (int i = 0; i < 4; i++) {
        binary += L_PATTERNS[code[i] - '0'];
    }

    binary += "01010"; // Center Guard

    // Right 4 digits
    for (int i = 4; i < 8; i++) {
        binary += R_PATTERNS[code[i] - '0'];
    }

    binary += "101"; // End Guard
    return binary;
}

static bool isValidEAN8(const string& value) {
    return value.length() == 8 &&
        all_of(value.begin(), value.end(), [](unsigned char ch) { return ch >= '0' && ch <= '9'; });
}

// --- Printing Logic ---
bool PrintBarcode(wstring printerName, string barcodeData, wstring productName) {
    // Initialize GDI+
    GdiplusStartupInput gdiplusStartupInput;
    ULONG_PTR gdiplusToken;
    GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, NULL);

    // Create Device Context (DC) for the printer
    HDC hdc = CreateDC(L"WINSPOOL", printerName.c_str(), NULL, NULL);
    if (!hdc) {
        cerr << "Failed to connect to printer." << endl;
        return false;
    }

    DOCINFO docInfo = { sizeof(DOCINFO) };
    docInfo.lpszDocName = L"EAN8 Label";

    // Start Print Job
    if (StartDoc(hdc, &docInfo) > 0) {
        if (StartPage(hdc) > 0) {
            Graphics graphics(hdc);

            // Critical quality settings for sharp thermal barcode output
            graphics.SetPageUnit(UnitPixel);
            graphics.SetSmoothingMode(SmoothingModeNone);
            graphics.SetInterpolationMode(InterpolationModeNearestNeighbor);
            graphics.SetPixelOffsetMode(PixelOffsetModeNone);

            // Assuming 203 DPI (Standard Thermal)
            // 40mm wide = ~320 pixels | 30mm high = ~240 pixels
            int labelWidthPx = 320;

            // Barcode Settings
            int barWidth = 2; // 2 pixels per bar module (clean for 203dpi)
            int barHeight = 100;
            int startX = (labelWidthPx - (67 * barWidth)) / 2;
            int startY = 60;

            // Draw product name
            FontFamily fontFamily(L"Arial");
            Font font(&fontFamily, 14, FontStyleBold, UnitPixel);
            SolidBrush blackBrush(Color(255, 0, 0, 0));
            StringFormat format;
            format.SetAlignment(StringAlignmentCenter);

            RectF textRect(0, 10, (REAL)labelWidthPx, 40);
            graphics.DrawString(productName.c_str(), -1, &font, textRect, &format, &blackBrush);

            // Draw barcode bars
            string binaryCode = getEAN8Binary(barcodeData);
            for (size_t i = 0; i < binaryCode.length(); i++) {
                if (binaryCode[i] == '1') {
                    graphics.FillRectangle(&blackBrush, startX + ((int)i * barWidth), startY, barWidth, barHeight);
                }
            }

            // Draw numbers below barcode
            Font fontSmall(&fontFamily, 16, FontStyleRegular, UnitPixel);
            RectF numRect(0, startY + barHeight + 2, (REAL)labelWidthPx, 30);

            wstring spacedCode;
            for (char c : barcodeData) {
                spacedCode += (wchar_t)c;
                spacedCode += L" ";
            }

            graphics.DrawString(spacedCode.c_str(), -1, &fontSmall, numRect, &format, &blackBrush);

            EndPage(hdc);
        }
        EndDoc(hdc);
    }

    DeleteDC(hdc);
    GdiplusShutdown(gdiplusToken);
    return true;
}

int main(int argc, char* argv[]) {
    if (argc < 4) {
        cout << "Usage: printer_tool.exe <PrinterName> <EAN8> <ProductName>" << endl;
        return 1;
    }

    string pNameStr = argv[1];
    wstring printerName(pNameStr.begin(), pNameStr.end());

    string ean8 = argv[2];
    if (!isValidEAN8(ean8)) {
        cerr << "Invalid EAN8. Must be exactly 8 digits." << endl;
        return 1;
    }

    string prodNameStr = argv[3];
    wstring productName(prodNameStr.begin(), prodNameStr.end());

    cout << "Printing to: " << pNameStr << "..." << endl;

    if (PrintBarcode(printerName, ean8, productName)) {
        cout << "Success" << endl;
        return 0;
    }

    return 1;
}
