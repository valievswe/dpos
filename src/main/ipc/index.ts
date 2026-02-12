import { ipcMain } from 'electron'
import { getDB } from '../db'
import { PrinterService } from '../services/printers'

export function registerIpcHandlers(): void {
  const db = getDB()

  // --- DATABASE HANDLERS ---

  ipcMain.handle('get-products', () => {
    const stmt = db.prepare('SELECT * FROM products')
    return stmt.all()
  })

  ipcMain.handle('add-product', (_event, sku, name, price) => {
    try {
      const stmt = db.prepare('INSERT INTO products (sku, name, price) VALUES (?, ?, ?)')
      const info = stmt.run(sku, name, price)
      return info.changes > 0
    } catch (err) {
      console.error('DB Insert Error:', err)
      return false
    }
  })

  // --- PRINTER LISTENERS ---

  ipcMain.on('trigger-print', (_event, sku, name) => {
    PrinterService.printLabel(sku, name)
  })

  ipcMain.on('trigger-receipt', (_event, storeName, items, total) => {
    PrinterService.printReceipt(storeName, items, total)
  })
}
