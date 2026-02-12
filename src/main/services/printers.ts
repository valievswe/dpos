import { app } from 'electron'
import path from 'path'
import { execFile } from 'child_process'

// Helper to find the correct path in Dev vs Prod
const getBinaryPath = (binaryName: string): string => {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', binaryName)
    : path.join(__dirname, '../../resources/bin', binaryName)
}

export const PrinterService = {
  printLabel: (sku: string, productName: string) => {
    const exePath = getBinaryPath('testbarcode.exe')
    const printerName = 'label'

    console.log(`Printing Label via: ${exePath}`)

    execFile(exePath, [printerName, sku, productName], (error, stdout) => {
      if (error) console.error('Label Printer Error:', error)
      else console.log('Label Printer Success:', stdout)
    })
  },

  printReceipt: (storeName: string, items: any[], total: string) => {
    const exePath = getBinaryPath('receipt.exe')
    const printerName = 'receipt'

    // Format: "Item|1.00;Item|2.00"
    const itemsString = items
      .map((item) => `${item.name}|${Number(item.price).toFixed(2)}`)
      .join(';')

    console.log(`Printing Receipt via: ${exePath}`)

    execFile(exePath, [printerName, storeName, itemsString, total], (error, stdout) => {
      if (error) console.error('Receipt Printer Error:', error)
      else console.log('Receipt Printer Success:', stdout)
    })
  }
}
