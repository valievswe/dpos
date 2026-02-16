import { app } from 'electron'
import path from 'path'
import { execFile } from 'child_process'
import fs from 'fs'
import { getDB } from '../db'

// Helper to find the correct path in Dev vs Prod
const getBinaryPath = (binaryName: string): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', binaryName)
  }
  // Dev: try dist-relative then repo root resources/bin
  const candidate = path.join(__dirname, '../../resources/bin', binaryName)
  if (fs.existsSync(candidate)) return candidate
  return path.join(process.cwd(), 'resources', 'bin', binaryName)
}

export const PrinterService = {
  // Legacy direct barkod chiqarish (job jurnalidan tashqari)
  printLabel: (sku: string, productName: string) => {
    const exePath = getBinaryPath('testbarcode.exe')
    const printerName = 'label'
    execFile(exePath, [printerName, sku, productName], (error) => {
      if (error) console.error('Label Printer Error:', error)
    })
  },

  // Legacy chek chiqarish (job jurnalidan tashqari)
  printReceipt: (storeName: string, items: any[], total: string) => {
    const exePath = getBinaryPath('receipt.exe')
    const printerName = 'receipt'
    const itemsString = items
      .map((item) => `${item.name}|${Number(item.price).toFixed(2)}`)
      .join(';')
    execFile(exePath, [printerName, storeName, itemsString, total], (error) => {
      if (error) console.error('Receipt Printer Error:', error)
    })
  },

  // Barkod: productId dan oladi, print_jobs jurnalga yozadi
  async printLabelByProduct(productId: number, copies = 1, printerName = 'label') {
    const db = getDB()
    const product = db.prepare('SELECT id, name, barcode FROM products WHERE id = ?').get(productId) as any
    if (!product) throw new Error('Mahsulot topilmadi')
    // barkod yo'q bo'lsa, generatsiya qilamiz
    let barcode = product.barcode
    if (!barcode) {
      barcode = ensureBarcode(db, product.id)
    }

    const payload = { printer: printerName, barcode, name: product.name, copies }
    const jobId = db
      .prepare(
        `INSERT INTO print_jobs (kind, product_id, copies, status, payload)
         VALUES ('barcode', ?, ?, 'queued', ?)`,
      )
      .run(productId, copies, JSON.stringify(payload)).lastInsertRowid

    const exePath = getBinaryPath('testbarcode.exe')
    if (!fs.existsSync(exePath)) {
      throw new Error(`Yorliq printer binari topilmadi: ${exePath}`)
    }
    const args = [payload.printer, payload.barcode, payload.name]

    try {
      for (let i = 0; i < copies; i++) {
        await runExec(exePath, args)
      }
      db.prepare('UPDATE print_jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        'done',
        jobId,
      )
    } catch (err: any) {
      db.prepare(
        'UPDATE print_jobs SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).run('failed', err.message, jobId)
      throw err
    }
  },

  // Chek: saleId dan oladi, so‘m formatida
  async printReceiptBySale(saleId: number, storeName = "Do'kon", printerName = 'receipt') {
    const db = getDB()
    const sale = db.prepare('SELECT id, total_cents FROM sales WHERE id = ?').get(saleId) as any
    if (!sale) throw new Error('Sotuv topilmadi')

    const items = db
      .prepare(
        `SELECT product_name as name, quantity, unit_price_cents 
         FROM sale_items WHERE sale_id = ?`,
      )
      .all(saleId)

    const formatSom = (cents: number) => (Math.round(cents) / 100).toFixed(2)
    const itemsString = items.map((i: any) => `${i.name}|${formatSom(i.unit_price_cents)}`).join(';')
    const total = formatSom(sale.total_cents)

    const payload = { printer: printerName, storeName, itemsString, total }
    const jobId = db
      .prepare(
        `INSERT INTO print_jobs (kind, sale_id, status, payload)
         VALUES ('receipt', ?, 'queued', ?)`,
      )
      .run(saleId, JSON.stringify(payload)).lastInsertRowid

    const exePath = getBinaryPath('receipt.exe')
    const args = [payload.printer, storeName, itemsString, total]

    try {
      await runExec(exePath, args)
      db.prepare('UPDATE print_jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        'done',
        jobId,
      )
    } catch (err: any) {
      db.prepare(
        'UPDATE print_jobs SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).run('failed', err.message, jobId)
      throw err
    }
  },
}

function runExec(exePath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(exePath, args, (error) => {
      if (error) return reject(error)
      resolve()
    })
  })
}

// EAN8 generator (productId -> 7 raqam + checksum)
function generateEAN8FromId(id: number): string {
  const padded = id.toString().padStart(7, '0')
  let sum = 0
  for (let i = 0; i < padded.length; i++) {
    const digit = parseInt(padded[i], 10)
    const weight = i % 2 === 0 ? 3 : 1
    sum += digit * weight
  }
  const check = (10 - (sum % 10)) % 10
  return padded + check.toString()
}

// Ensure unique barcode; tries base, then increments id tail until free
function ensureBarcode(db: any, productId: number): string {
  let attempt = generateEAN8FromId(productId)
  let tries = 0
  while (true) {
    const existing = db.prepare('SELECT id FROM products WHERE barcode = ?').get(attempt) as any
    if (!existing || existing.id === productId) {
      db.prepare('UPDATE products SET barcode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        attempt,
        productId
      )
      return attempt
    }
    tries += 1
    attempt = generateEAN8FromId(productId + tries)
    if (tries > 20) throw new Error('Barkod generatsiya qilib bo‘lmadi')
  }
}
