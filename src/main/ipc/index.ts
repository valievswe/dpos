import { ipcMain } from 'electron'
import { getDB } from '../db'
import { PrinterService } from '../services/printers'
import { mapProductRow } from '../db'

const allowedUnits = new Set(['dona', 'qadoq', 'litr', 'metr'])

export function registerIpcHandlers(): void {
  const db = getDB()

  // --- DATABASE HANDLERS ---

  ipcMain.handle('get-products', () => {
    const stmt = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name ASC')
    const rows = stmt.all()
    return rows.map(mapProductRow)
  })

  ipcMain.handle(
    'add-product',
    (_event, sku: string, name: string, price: number, unit = 'dona', qty: number = 0) => {
      try {
        const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : 'dona'
        const safeUnit = allowedUnits.has(normalizedUnit) ? normalizedUnit : 'dona'
        const initialQty = Number.isFinite(qty) && qty >= 0 ? Math.round(qty) : 0
        const stmt = db.prepare(`
        INSERT INTO products (sku, name, price_cents, qty, unit)
        VALUES (?, ?, ?, ?, ?)
      `)
        const info = stmt.run(sku.trim(), name.trim(), Math.round(price * 100), initialQty, safeUnit)
        return info.changes > 0
      } catch (err) {
        console.error('DB Insert Error:', err)
        return false
      }
    }
  )

  ipcMain.handle('find-product', (_event, code: string) => {
    const stmt = db.prepare(
      `SELECT * FROM products WHERE barcode = ? OR sku = ? LIMIT 1`
    )
    const row = stmt.get(code, code)
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
            `INSERT INTO sales (customer_id, subtotal_cents, discount_cents, tax_cents, total_cents, payment_method, note)
             VALUES (?, ?, ?, ?, ?, ?, '')`
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
         ORDER BY s.sale_date DESC
         LIMIT 50`
      )
      .all()
    return rows
  })

  ipcMain.handle('get-sale-items', (_event, saleId: number) => {
    return db
      .prepare(
        `SELECT product_name, quantity, unit_price_cents, line_total_cents 
         FROM sale_items WHERE sale_id = ?`
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
