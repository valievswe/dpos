import { app, dialog, ipcMain } from 'electron'
import path from 'path'
import * as XLSX from 'xlsx'
import { getDB } from '../db'
import { PrinterService } from '../services/printers'
import { mapProductRow } from '../db'

const allowedUnits = new Set(['dona', 'qadoq', 'litr', 'metr'])
const TASHKENT_SALE_DATE_SQL = "strftime('%Y-%m-%dT%H:%M:%S+05:00', 'now', '+5 hours')"
const BARCODE_MAX_TRIES = 20

const generateEAN8FromId = (id: number): string => {
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

const ensureBarcode = (db: any, productId: number): string => {
  const existingRow = db.prepare('SELECT id, barcode FROM products WHERE id = ?').get(productId) as any
  if (!existingRow) throw new Error('Mahsulot topilmadi')
  if (existingRow.barcode && `${existingRow.barcode}`.trim()) return existingRow.barcode
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
    if (tries > BARCODE_MAX_TRIES) throw new Error("Barkod generatsiya qilib bo'lmadi")
  }
}

const ensureMissingBarcodes = (db: any) => {
  const rows = db.prepare("SELECT id FROM products WHERE barcode IS NULL OR TRIM(barcode) = ''").all() as {
    id: number
  }[]
  rows.forEach((row) => {
    ensureBarcode(db, row.id)
  })
}

export function registerIpcHandlers(): void {
  const db = getDB()

  // --- DATABASE HANDLERS ---

  ipcMain.handle('get-products', () => {
    ensureMissingBarcodes(db)
    const stmt = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name ASC')
    const rows = stmt.all()
    return rows.map(mapProductRow)
  })

  ipcMain.handle('delete-product', (_event, productId: number, force: boolean = false) => {
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId) as any
    if (!product) {
      return { success: false, requiresConfirmation: false, saleCount: 0, movementCount: 0 }
    }

    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM sale_items WHERE product_id = ?) AS saleCount,
           (SELECT COUNT(*) FROM stock_movements WHERE product_id = ?) AS movementCount`
      )
      .get(productId, productId) as { saleCount: number; movementCount: number }

    const requiresConfirmation = (counts?.saleCount ?? 0) > 0 || (counts?.movementCount ?? 0) > 0
    if (requiresConfirmation && !force) {
      return { success: false, requiresConfirmation: true, ...counts }
    }

    const res = db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(productId)
    return { success: res.changes > 0, requiresConfirmation: false, ...counts }
  })

  ipcMain.handle(
    'add-product',
    (_event, sku: string, name: string, price: number, unit = 'dona', qty: number = 0, barcode?: string) => {
      try {
        const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : 'dona'
        const safeUnit = allowedUnits.has(normalizedUnit) ? normalizedUnit : 'dona'
        const initialQty = Number.isFinite(qty) && qty >= 0 ? Math.round(qty) : 0
        const safeSku = typeof sku === 'string' ? sku.trim() : ''
        const safeBarcode = typeof barcode === 'string' && barcode.trim() ? barcode.trim() : null
        const skuValue = safeBarcode || safeSku || `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        const t = db.transaction(() => {
          const stmt = db.prepare(`
          INSERT INTO products (sku, name, price_cents, qty, unit, barcode)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
          const info = stmt.run(skuValue, name.trim(), Math.round(price * 100), initialQty, safeUnit, safeBarcode)
          const productId = Number(info.lastInsertRowid)
          let finalBarcode = safeBarcode
          if (!finalBarcode) {
            finalBarcode = ensureBarcode(db, productId)
            if (!safeSku) {
              db.prepare('UPDATE products SET sku = ? WHERE id = ?').run(finalBarcode, productId)
            }
          }
          return { success: info.changes > 0, productId, barcode: finalBarcode ?? undefined }
        })
        return t()
      } catch (err) {
        console.error('DB Insert Error:', err)
        return { success: false }
      }
    }
  )

  ipcMain.handle('find-product', (_event, code: string) => {
    const stmt = db.prepare(`SELECT * FROM products WHERE barcode = ? LIMIT 1`)
    const row = stmt.get(code)
    if (!row) return null
    return mapProductRow(row)
  })

  ipcMain.handle('set-stock', (_event, productId: number, qty: number) => {
    const t = db.transaction(() => {
      const p = db
        .prepare('SELECT id, qty, cost_cents, price_cents FROM products WHERE id = ?')
        .get(productId) as any
      if (!p) throw new Error('Mahsulot topilmadi')
      db.prepare('UPDATE products SET qty = ? WHERE id = ?').run(qty, productId)
      db.prepare(
        `INSERT INTO stock_movements (product_id, movement_type, quantity_change, old_qty, new_qty, cost_cents, unit_price_cents, reference_id, notes)
         VALUES (?, 'adjustment', ?, ?, ?, ?, ?, NULL, 'Admin yangilash')`
      ).run(productId, qty - p.qty, p.qty, qty, p.cost_cents, p.price_cents)
      return true
    })
    return t()
  })

  ipcMain.handle(
    'create-sale',
    (
      _event,
      payload: {
        items: { productId: number; qty: number }[]
        paymentMethod: 'cash' | 'card' | 'mixed' | 'debt'
        discountCents?: number
        customer?: { name: string; phone?: string }
      }
    ) => {
      const t = db.transaction(() => {
        if (!payload.items || payload.items.length === 0) {
          throw new Error("Savat bo'sh")
        }

        // customer
        let customerId: number | null = null
        if (payload.customer && payload.customer.name) {
          const existing = payload.customer.phone
            ? db
                .prepare('SELECT id FROM customers WHERE phone = ?')
                .get(payload.customer.phone) as any
            : null
          if (existing) {
            customerId = existing.id
          } else {
            const ins = db
              .prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
              .run(payload.customer.name, payload.customer.phone ?? null)
            customerId = Number(ins.lastInsertRowid)
          }
        }

        // compute totals and stock check
        let subtotal = 0
        const itemsDetailed: any[] = []
        for (const it of payload.items) {
          const p = db
            .prepare(
              'SELECT id, name, price_cents, cost_cents, qty, barcode, unit FROM products WHERE id = ?'
            )
            .get(it.productId) as any
          if (!p) throw new Error('Mahsulot topilmadi')
          if (p.qty < it.qty) throw new Error(`Stok yetarli emas: ${p.name}`)
          const lineTotal = p.price_cents * it.qty
          subtotal += lineTotal
          itemsDetailed.push({ ...p, qty: it.qty, qty_before: p.qty, lineTotal })
        }

        const discount = Math.max(0, Math.min(payload.discountCents ?? 0, subtotal))
        const tax = 0
        const total = subtotal - discount + tax

        // sale insert
        const saleIns = db
          .prepare(
            `INSERT INTO sales (sale_date, customer_id, subtotal_cents, discount_cents, tax_cents, total_cents, payment_method, note)
             VALUES (${TASHKENT_SALE_DATE_SQL}, ?, ?, ?, ?, ?, ?, '')`
          )
          .run(customerId, subtotal, discount, tax, total, payload.paymentMethod)
        const saleId = Number(saleIns.lastInsertRowid)

        // items insert + stock movement
        for (const it of itemsDetailed) {
          const oldQty = it.qty_before ?? it.qty_available ?? 0
          const newQty = oldQty - it.qty

          db.prepare(
            `INSERT INTO sale_items 
             (sale_id, product_id, product_name, barcode, quantity, unit_price_cents, cost_cents, line_total_cents, profit_cents)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            saleId,
            it.id,
            it.name,
            it.barcode,
            it.qty,
            it.price_cents,
            it.cost_cents * it.qty,
            it.lineTotal,
            it.lineTotal - it.cost_cents * it.qty
          )

          db.prepare('UPDATE products SET qty = ? WHERE id = ?').run(newQty, it.id)
          db.prepare(
            `INSERT INTO stock_movements (product_id, movement_type, quantity_change, old_qty, new_qty, cost_cents, unit_price_cents, reference_id, notes)
             VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, 'Sotuv')`
          ).run(
            it.id,
            -it.qty,
            oldQty,
            newQty,
            it.cost_cents,
            it.price_cents,
            saleId
          )
        }

        // payments or debt
        if (payload.paymentMethod === 'debt') {
          if (!customerId) throw new Error('Qarz uchun mijoz talab qilinadi')
          db.prepare(
            `INSERT INTO debt_transactions (customer_id, sale_id, type, amount_cents, note)
             VALUES (?, ?, 'debt_added', ?, ?)`,
          ).run(customerId, saleId, total, `Sotuv #${saleId}`)
          db.prepare('UPDATE customers SET debt_cents = debt_cents + ? WHERE id = ?').run(
            total,
            customerId
          )
          db.prepare(
            `INSERT INTO debts (customer_id, description, total_cents, paid_cents, is_paid)
             VALUES (?, ?, ?, 0, 0)`
          ).run(customerId, `Sotuv #${saleId}`, total)
        } else {
          db.prepare(
            `INSERT INTO payments (sale_id, method, amount_cents) VALUES (?, ?, ?)`
          ).run(saleId, payload.paymentMethod, total)
        }

        return { saleId, total_cents: total }
      })

      return t()
    }
  )

  ipcMain.handle('get-sales', () => {
    const rows = db
      .prepare(
        `SELECT s.id, s.sale_date, s.total_cents, s.payment_method, c.name as customer_name
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         ORDER BY datetime(s.sale_date) DESC
         LIMIT 50`
      )
      .all()
    return rows
  })

  ipcMain.handle('get-sale-items', (_event, saleId: number) => {
    return db
      .prepare(
        `SELECT si.product_name, si.barcode, si.quantity, si.unit_price_cents, si.line_total_cents, p.unit
         FROM sale_items si
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = ?`
      )
      .all(saleId)
  })

  ipcMain.handle('pay-debt', (_event, customerId: number, amountCents: number) => {
    const t = db.transaction(() => {
      db.prepare(
        `INSERT INTO debt_transactions (customer_id, type, amount_cents, note)
         VALUES (?, 'payment', ?, 'To''lov')`
      ).run(customerId, amountCents)
      db.prepare('UPDATE customers SET debt_cents = MAX(debt_cents - ?, 0) WHERE id = ?').run(
        amountCents,
        customerId
      )
      db.prepare(
        `UPDATE debts SET paid_cents = MIN(total_cents, paid_cents + ?),
                          is_paid = CASE WHEN paid_cents + ? >= total_cents THEN 1 ELSE 0 END
         WHERE customer_id = ? AND is_paid = 0`
      ).run(amountCents, amountCents, customerId)
      return true
    })
    return t()
  })

  ipcMain.handle(
    'export-sales-excel',
    async (
      _event,
      payload: {
        headers: string[]
        rows: (string | number)[][]
        fileName?: string
        sheetName?: string
      }
    ) => {
      const safeName = payload.fileName && payload.fileName.trim() ? payload.fileName.trim() : 'sales.xlsx'
      const defaultPath = path.join(app.getPath('documents'), safeName)
      const dialogResult = await dialog.showSaveDialog({
        defaultPath,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      })
      if (dialogResult.canceled || !dialogResult.filePath) {
        return { success: false, cancelled: true }
      }

      const targetPath = dialogResult.filePath.endsWith('.xlsx')
        ? dialogResult.filePath
        : `${dialogResult.filePath}.xlsx`
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet([payload.headers, ...payload.rows])
      XLSX.utils.book_append_sheet(workbook, sheet, payload.sheetName?.trim() || 'Sales')
      XLSX.writeFile(workbook, targetPath, { compression: true })

      return { success: true, path: targetPath }
    }
  )

  ipcMain.handle(
    'update-product',
    (
      _event,
      productId: number,
      payload: { sku?: string; name: string; price: number; unit?: string; barcode?: string }
    ) => {
      try {
        const normalizedUnit = typeof payload.unit === 'string' ? payload.unit.trim().toLowerCase() : 'dona'
        const safeUnit = allowedUnits.has(normalizedUnit) ? normalizedUnit : 'dona'
        const current = db.prepare('SELECT sku, barcode FROM products WHERE id = ?').get(productId) as any
        if (!current) throw new Error('Mahsulot topilmadi')
        const safeSku = payload.sku?.trim() || current.sku
        const safeName = payload.name?.trim()
        const safePrice = Number(payload.price)
        if (!safeSku || !safeName || !Number.isFinite(safePrice) || safePrice < 0) {
          throw new Error("Ma'lumotlar noto'g'ri")
        }
        const barcode =
          typeof payload.barcode === 'string' ? (payload.barcode.trim() ? payload.barcode.trim() : null) : current.barcode
        const res = db
          .prepare('UPDATE products SET sku = ?, name = ?, price_cents = ?, unit = ?, barcode = ? WHERE id = ?')
          .run(safeSku, safeName, Math.round(safePrice * 100), safeUnit, barcode, productId)
        if (!barcode) {
          ensureBarcode(db, productId)
        }
        return res.changes > 0
      } catch (err) {
        console.error('DB Update Error:', err)
        throw err
      }
    }
  )

  // --- PRINTER LISTENERS ---

  ipcMain.on('trigger-print', (_event, sku, name) => {
    PrinterService.printLabel(sku, name)
  })

  ipcMain.on('trigger-receipt', (_event, storeName, items, total) => {
    PrinterService.printReceipt(storeName, items, total)
  })

  ipcMain.handle('print-barcode-product', async (_event, productId: number, copies = 1, printerName?: string) => {
    await PrinterService.printLabelByProduct(Number(productId), Number(copies) || 1, printerName || 'label')
    return true
  })

  ipcMain.handle('print-receipt-sale', async (_event, saleId: number, printerName?: string) => {
    try {
      await PrinterService.printReceiptBySale(Number(saleId), "Do'kon", printerName || 'receipt')
      return { success: true }
    } catch (err: any) {
      console.error('Receipt print error', err)
      return { success: false, error: err.message }
    }
  })
}
