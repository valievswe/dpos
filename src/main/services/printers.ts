import { app } from 'electron'
import path from 'path'
import { execFile } from 'child_process'
import fs from 'fs'
import { getDB } from '../db'

const BARCODE_BINARY_CANDIDATES = ['label.exe', 'barcode.exe', 'testbarcode.exe'] as const
const RECEIPT_BINARY_CANDIDATES = ['receipt2.exe', 'receipt.exe'] as const
const EAN8_PATTERN = /^\d{8}$/
const DEFAULT_STORE_NAME = "Do'kondor POS"
const STORE_PHONE = '+998908500507'

// Helper to find the correct path in Dev vs Prod
const getBinaryPaths = (binaryName: string): string[] => {
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, 'bin', binaryName),
      path.join(process.resourcesPath, 'resources', 'bin', binaryName),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', binaryName)
    ]
    return Array.from(new Set(candidates))
  }
  // Dev: try dist-relative then repo root resources/bin
  return [
    path.join(__dirname, '../../resources/bin', binaryName),
    path.join(process.cwd(), 'resources', 'bin', binaryName)
  ]
}

const resolveBarcodeBinaryPath = (): { path: string; tried: string[] } => {
  const tried: string[] = []
  for (const name of BARCODE_BINARY_CANDIDATES) {
    for (const candidate of getBinaryPaths(name)) {
      tried.push(candidate)
      if (fs.existsSync(candidate)) {
        return { path: candidate, tried }
      }
    }
  }
  return { path: tried[0] ?? getBinaryPaths(BARCODE_BINARY_CANDIDATES[0])[0], tried }
}

const resolveReceiptBinaryPath = (): { path: string; tried: string[] } => {
  const tried: string[] = []
  for (const name of RECEIPT_BINARY_CANDIDATES) {
    for (const candidate of getBinaryPaths(name)) {
      tried.push(candidate)
      if (fs.existsSync(candidate)) {
        return { path: candidate, tried }
      }
    }
  }
  return { path: tried[0] ?? getBinaryPaths(RECEIPT_BINARY_CANDIDATES[0])[0], tried }
}

const assertEan8 = (value: string): string => {
  const clean = `${value ?? ''}`.trim()
  if (!EAN8_PATTERN.test(clean)) {
    throw new Error("Barkod 8 raqamdan iborat bo'lishi kerak")
  }
  return clean
}

const sanitizeReceiptField = (value: string): string => {
  return `${value ?? ''}`.replace(/[;|]/g, ' ').trim()
}

const buildReceiptHeading = (storeName?: string): string => {
  const safeStoreName = sanitizeReceiptField(storeName || DEFAULT_STORE_NAME)
  return `${safeStoreName}\n${STORE_PHONE}`
}

const formatSom = (cents: number): string => (Math.round(cents) / 100).toFixed(2)

const formatQty = (qty: number): string => {
  if (!Number.isFinite(qty)) return '0'
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2)
}

export const PrinterService = {
  // Legacy direct barkod chiqarish (job jurnalidan tashqari)
  printLabel: (sku: string, productName: string) => {
    const { path: exePath, tried } = resolveBarcodeBinaryPath()
    const printerName = 'label'
    if (!fs.existsSync(exePath)) {
      console.error(`Label printer binary not found. Tried: ${tried.join(', ')}`)
      return
    }
    let barcode: string
    try {
      barcode = assertEan8(sku)
    } catch (error) {
      console.error('Label Printer Error:', error)
      return
    }
    execFile(exePath, [printerName, barcode, productName], (error) => {
      if (error) console.error('Label Printer Error:', error)
    })
  },

  // Legacy chek chiqarish (job jurnalidan tashqari)
  printReceipt: (storeName: string, items: any[], total: string) => {
    const { path: exePath, tried } = resolveReceiptBinaryPath()
    const printerName = 'receipt'
    const itemsString = items
      .map((item) => {
        const name = sanitizeReceiptField(item?.name)
        const unitPrice = Number(item?.price ?? 0)
        return `${name}|1|${unitPrice.toFixed(2)}|${unitPrice.toFixed(2)}`
      })
      .join(';')
    const totalValue = Number(total)
    const subtotal = Number.isFinite(totalValue) ? totalValue.toFixed(2) : '0.00'
    const discount = '0.00'
    const paymentType = 'cash'
    if (!fs.existsSync(exePath)) {
      console.error(`Receipt printer binary not found. Tried: ${tried.join(', ')}`)
      return
    }
    const receiptHeading = buildReceiptHeading(storeName)
    execFile(exePath, [printerName, receiptHeading, itemsString, subtotal, discount, subtotal, paymentType], (error) => {
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

    const safeBarcode = assertEan8(barcode)
    const payload = { printer: printerName, barcode: safeBarcode, name: product.name, copies }
    const jobId = db
      .prepare(
        `INSERT INTO print_jobs (kind, product_id, copies, status, payload)
         VALUES ('barcode', ?, ?, 'queued', ?)`,
      )
      .run(productId, copies, JSON.stringify(payload)).lastInsertRowid

    const { path: exePath, tried } = resolveBarcodeBinaryPath()
    if (!fs.existsSync(exePath)) {
      throw new Error(`Yorliq printer binari topilmadi. Tekshirildi: ${tried.join(', ')}`)
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
  async printReceiptBySale(saleId: number, storeName = DEFAULT_STORE_NAME, printerName = 'receipt') {
    const db = getDB()
    const sale = db
      .prepare('SELECT id, subtotal_cents, discount_cents, total_cents, payment_method FROM sales WHERE id = ?')
      .get(saleId) as any
    if (!sale) throw new Error('Sotuv topilmadi')

    const items = db
      .prepare(
        `SELECT product_name as name, quantity, unit_price_cents, line_total_cents
         FROM sale_items WHERE sale_id = ?`,
      )
      .all(saleId)

    const itemsString = items
      .map((i: any) => {
        const name = sanitizeReceiptField(i.name)
        const qty = formatQty(Number(i.quantity ?? 0))
        const unitPrice = formatSom(Number(i.unit_price_cents ?? 0))
        const lineTotal = formatSom(Number(i.line_total_cents ?? 0))
        return `${name}|${qty}|${unitPrice}|${lineTotal}`
      })
      .join(';')
    const subtotal = formatSom(Number(sale.subtotal_cents ?? 0))
    const discount = formatSom(Number(sale.discount_cents ?? 0))
    const total = formatSom(Number(sale.total_cents ?? 0))
    const paymentType = `${sale.payment_method ?? 'cash'}`

    const payload = {
      printer: printerName,
      storeName: buildReceiptHeading(storeName),
      itemsString,
      subtotal,
      discount,
      total,
      paymentType
    }
    const jobId = db
      .prepare(
        `INSERT INTO print_jobs (kind, sale_id, status, payload)
         VALUES ('receipt', ?, 'queued', ?)`,
      )
      .run(saleId, JSON.stringify(payload)).lastInsertRowid

    const { path: exePath, tried } = resolveReceiptBinaryPath()
    if (!fs.existsSync(exePath)) {
      throw new Error(`Chek printer binari topilmadi. Tekshirildi: ${tried.join(', ')}`)
    }
    const args = [payload.printer, payload.storeName, payload.itemsString, payload.subtotal, payload.discount, payload.total, payload.paymentType]

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

  async printReturnReceiptById(returnId: number, storeName = DEFAULT_STORE_NAME, printerName = 'receipt') {
    const db = getDB()
    const ret = db
      .prepare(
        `SELECT id, sale_id, total_cents, debt_reduced_cents, refund_cents, refund_method
         FROM sale_returns
         WHERE id = ?`
      )
      .get(returnId) as
      | {
          id: number
          sale_id: number
          total_cents: number
          debt_reduced_cents: number
          refund_cents: number
          refund_method?: string | null
        }
      | undefined
    if (!ret) throw new Error('Qaytish topilmadi')

    const items = db
      .prepare(
        `SELECT si.product_name AS name, sri.quantity, sri.unit_price_cents, sri.line_total_cents
         FROM sale_return_items sri
         LEFT JOIN sale_items si ON si.id = sri.sale_item_id
         WHERE sri.return_id = ?
         ORDER BY sri.id ASC`
      )
      .all(returnId)

    const itemsString = items
      .map((i: any) => {
        const name = sanitizeReceiptField(i.name)
        const qty = formatQty(Number(i.quantity ?? 0))
        const unitPrice = formatSom(Number(i.unit_price_cents ?? 0))
        const lineTotal = formatSom(Number(i.line_total_cents ?? 0))
        return `${name}|${qty}|${unitPrice}|${lineTotal}`
      })
      .join(';')

    const subtotal = formatSom(Number(ret.total_cents ?? 0))
    const discount = formatSom(Number(ret.debt_reduced_cents ?? 0))
    const total = formatSom(Number(ret.refund_cents ?? 0))
    const paymentType =
      ret.refund_method === 'card'
        ? 'refund_card'
        : ret.refund_method === 'cash'
          ? 'refund_cash'
          : 'debt_offset'

    const payload = {
      printer: printerName,
      storeName: buildReceiptHeading(`${storeName} QAYTISH #${ret.id}`),
      itemsString,
      subtotal,
      discount,
      total,
      paymentType
    }
    const jobId = db
      .prepare(
        `INSERT INTO print_jobs (kind, sale_id, status, payload)
         VALUES ('receipt', ?, 'queued', ?)`,
      )
      .run(ret.sale_id, JSON.stringify(payload)).lastInsertRowid

    const { path: exePath, tried } = resolveReceiptBinaryPath()
    if (!fs.existsSync(exePath)) {
      throw new Error(`Chek printer binari topilmadi. Tekshirildi: ${tried.join(', ')}`)
    }
    const args = [
      payload.printer,
      payload.storeName,
      payload.itemsString,
      payload.subtotal,
      payload.discount,
      payload.total,
      payload.paymentType
    ]

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
