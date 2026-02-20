import { app, dialog, ipcMain } from 'electron'
import path from 'path'
import * as XLSX from 'xlsx'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDB } from '../db'
import { PrinterService } from '../services/printers'
import { mapProductRow } from '../db'

const allowedUnits = new Set(['dona', 'qadoq', 'litr', 'metr', 'kg'])
const TASHKENT_SALE_DATE_SQL = "strftime('%Y-%m-%dT%H:%M:%S+05:00', 'now', '+5 hours')"
const BARCODE_MAX_TRIES = 20
let authSessionUserId: number | null = null

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

const isValidYmd = (value?: string): value is string => {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

const addDays = (ymd: string, days: number): string => {
  const date = new Date(`${ymd}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const diffDaysInclusive = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  return Math.max(1, Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1)
}

const hashPassword = (password: string, saltHex?: string): { saltHex: string; hashHex: string } => {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return { saltHex: salt.toString('hex'), hashHex: hash.toString('hex') }
}

const verifyPassword = (password: string, saltHex: string, expectedHashHex: string): boolean => {
  const salt = Buffer.from(saltHex, 'hex')
  const computed = scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHashHex, 'hex')
  if (computed.length !== expected.length) return false
  return timingSafeEqual(computed, expected)
}

export function registerIpcHandlers(): void {
  const db = getDB()

  // Normalize legacy role value for existing installs.
  db.prepare("UPDATE app_users SET role = 'Do''kondor' WHERE role = 'owner'").run()

  const getOwner = () => {
    return db
      .prepare(
        `SELECT id, username, role, password_salt, password_hash
         FROM app_users
         WHERE role IN ('Do''kondor','owner')
         LIMIT 1`
      )
      .get() as
      | { id: number; username: string; role: "Do'kondor" | 'owner'; password_salt: string; password_hash: string }
      | undefined
  }

  // --- DATABASE HANDLERS ---

  ipcMain.handle('auth-status', () => {
    const owner = getOwner()
    return {
      hasOwner: !!owner,
      authenticated: !!owner && authSessionUserId === owner.id,
      username: owner?.username ?? null
    }
  })

  ipcMain.handle('auth-setup-owner', (_event, payload: { username: string; password: string }) => {
    const owner = getOwner()
    if (owner) throw new Error("Do'kondor foydalanuvchi allaqachon yaratilgan")

    const username = (payload?.username ?? '').trim()
    const password = payload?.password ?? ''
    if (username.length < 3) throw new Error('Login kamida 3 belgidan iborat bo\'lsin')
    if (password.length < 4) throw new Error('Parol kamida 4 belgidan iborat bo\'lsin')

    const { saltHex, hashHex } = hashPassword(password)
    const result = db
      .prepare(
        `INSERT INTO app_users (username, role, password_salt, password_hash)
         VALUES (?, 'Do''kondor', ?, ?)`
      )
      .run(username, saltHex, hashHex)
    authSessionUserId = Number(result.lastInsertRowid)
    return true
  })

  ipcMain.handle('auth-login', (_event, payload: { username: string; password: string }) => {
    const username = (payload?.username ?? '').trim()
    const password = payload?.password ?? ''
    if (!username || !password) throw new Error('Login va parolni kiriting')

    const user = db
      .prepare(
        `SELECT id, username, password_salt, password_hash
         FROM app_users
         WHERE role IN ('Do''kondor','owner') AND username = ?
         LIMIT 1`
      )
      .get(username) as
      | { id: number; username: string; password_salt: string; password_hash: string }
      | undefined
    if (!user) throw new Error('Login yoki parol noto\'g\'ri')

    const ok = verifyPassword(password, user.password_salt, user.password_hash)
    if (!ok) throw new Error('Login yoki parol noto\'g\'ri')

    authSessionUserId = user.id
    return true
  })

  ipcMain.handle('auth-logout', () => {
    authSessionUserId = null
    return true
  })

  ipcMain.handle(
    'auth-change-password',
    (_event, payload: { currentPassword: string; newPassword: string }) => {
      if (!authSessionUserId) throw new Error('Avval tizimga kiring')
      const currentPassword = payload?.currentPassword ?? ''
      const newPassword = payload?.newPassword ?? ''
      if (newPassword.length < 4) throw new Error('Yangi parol kamida 4 belgidan iborat bo\'lsin')

      const user = db
        .prepare(
          `SELECT id, password_salt, password_hash
           FROM app_users
           WHERE id = ? AND role IN ('Do''kondor','owner')
           LIMIT 1`
        )
        .get(authSessionUserId) as
        | { id: number; password_salt: string; password_hash: string }
        | undefined
      if (!user) throw new Error("Do'kondor foydalanuvchi topilmadi")

      const ok = verifyPassword(currentPassword, user.password_salt, user.password_hash)
      if (!ok) throw new Error('Joriy parol noto\'g\'ri')

      const { saltHex, hashHex } = hashPassword(newPassword)
      db.prepare('UPDATE app_users SET password_salt = ?, password_hash = ? WHERE id = ?').run(
        saltHex,
        hashHex,
        user.id
      )
      return true
    }
  )

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
    (
      _event,
      sku: string,
      name: string,
      price: number,
      unit = 'dona',
      qty: number = 0,
      barcode?: string,
      costPrice: number = 0
    ) => {
      try {
        const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : 'dona'
        const safeUnit = allowedUnits.has(normalizedUnit) ? normalizedUnit : 'dona'
        const initialQty = Number.isFinite(qty) && qty >= 0 ? Math.round(qty) : 0
        const safeCostPrice = Number.isFinite(costPrice) && costPrice >= 0 ? Number(costPrice) : 0
        const safeSku = typeof sku === 'string' ? sku.trim() : ''
        const safeBarcode = typeof barcode === 'string' && barcode.trim() ? barcode.trim() : null
        const skuValue = safeBarcode || safeSku || `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        const t = db.transaction(() => {
          const stmt = db.prepare(`
          INSERT INTO products (sku, name, cost_cents, price_cents, qty, unit, barcode)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
          const info = stmt.run(
            skuValue,
            name.trim(),
            Math.round(safeCostPrice * 100),
            Math.round(price * 100),
            initialQty,
            safeUnit,
            safeBarcode
          )
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
        paidCents?: number
        paidMethod?: 'cash' | 'card'
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
        const isDebtSale = payload.paymentMethod === 'debt'
        const isMixedSale = payload.paymentMethod === 'mixed'
        const paymentMethodForMixed = payload.paidMethod === 'card' ? 'card' : 'cash'

        if ((isDebtSale || isMixedSale) && !customerId) {
          throw new Error('Qarz uchun mijoz talab qilinadi')
        }

        let paidCents = 0
        let debtAddedCents = 0
        if (isMixedSale) {
          if (!Number.isFinite(payload.paidCents)) {
            throw new Error("Qisman to'lov summasi noto'g'ri")
          }
          const mixedPaidCents = Math.round(Number(payload.paidCents))
          if (mixedPaidCents <= 0 || mixedPaidCents >= total) {
            throw new Error("Qisman to'lov jami summadan kichik va 0 dan katta bo'lishi kerak")
          }
          paidCents = mixedPaidCents
          debtAddedCents = total - mixedPaidCents
        } else if (isDebtSale) {
          debtAddedCents = total
        } else {
          paidCents = total
        }

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

        // debt ledger for debt and mixed sales
        if (debtAddedCents > 0) {
          db.prepare(
            `INSERT INTO debt_transactions (customer_id, sale_id, type, amount_cents, note)
             VALUES (?, ?, 'debt_added', ?, ?)`,
          ).run(customerId, saleId, debtAddedCents, `Sotuv #${saleId}`)
          db.prepare('UPDATE customers SET debt_cents = debt_cents + ? WHERE id = ?').run(
            debtAddedCents,
            customerId
          )
          db.prepare(
            `INSERT INTO debts (customer_id, sale_id, description, total_cents, paid_cents, is_paid, paid_at)
             VALUES (?, ?, ?, ?, 0, 0, NULL)`
          ).run(customerId, saleId, `Sotuv #${saleId}`, debtAddedCents)
        }

        // payment ledger for cash/card and mixed paid portion
        if (paidCents > 0) {
          const paymentMethod = isMixedSale ? paymentMethodForMixed : payload.paymentMethod
          db.prepare(
            `INSERT INTO payments (sale_id, method, amount_cents) VALUES (?, ?, ?)`
          ).run(saleId, paymentMethod, paidCents)
        }

        return { saleId, total_cents: total }
      })

      return t()
    }
  )

  ipcMain.handle('get-sales', () => {
    const rows = db
      .prepare(
        `SELECT
           s.id,
           s.sale_date,
           s.total_cents,
           s.payment_method,
           c.name as customer_name,
           c.phone as customer_phone,
           COALESCE(pay.paid_cents, 0) AS paid_cents,
           COALESCE(ret.returned_cents, 0) AS returned_cents,
           COALESCE(ret.refund_cents, 0) AS refund_cents,
           COALESCE(ret.debt_reduced_cents, 0) AS debt_reduced_cents,
           COALESCE(
             debt_added.debt_added_cents,
             CASE
               WHEN s.payment_method = 'debt' THEN s.total_cents
               WHEN s.payment_method = 'mixed' THEN MAX(s.total_cents - COALESCE(pay.paid_cents, 0), 0)
               ELSE 0
             END
           ) AS debt_added_cents,
           COALESCE(
             debt.outstanding_cents,
             CASE
               WHEN s.payment_method = 'debt' THEN MAX(s.total_cents - COALESCE(ret.returned_cents, 0), 0)
               WHEN s.payment_method = 'mixed' THEN MAX(
                 s.total_cents - COALESCE(pay.paid_cents, 0) - COALESCE(ret.returned_cents, 0),
                 0
               )
               ELSE 0
             END
           ) AS debt_cents
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN (
           SELECT sale_id, SUM(amount_cents) AS paid_cents
           FROM payments
           GROUP BY sale_id
         ) pay ON pay.sale_id = s.id
         LEFT JOIN (
           SELECT sale_id, SUM(total_cents) AS returned_cents
                , SUM(refund_cents) AS refund_cents
                , SUM(debt_reduced_cents) AS debt_reduced_cents
           FROM sale_returns
           GROUP BY sale_id
         ) ret ON ret.sale_id = s.id
         LEFT JOIN (
           SELECT sale_id, SUM(amount_cents) AS debt_added_cents
           FROM debt_transactions
           WHERE type = 'debt_added'
           GROUP BY sale_id
         ) debt_added ON debt_added.sale_id = s.id
         LEFT JOIN (
           SELECT sale_id, SUM(MAX(total_cents - paid_cents, 0)) AS outstanding_cents
           FROM debts
           GROUP BY sale_id
         ) debt ON debt.sale_id = s.id
         ORDER BY datetime(s.sale_date) DESC
         LIMIT 50`
      )
      .all()
    return rows
  })

  ipcMain.handle('get-sales-all', () => {
    const rows = db
      .prepare(
        `SELECT
           s.id,
           s.sale_date,
           s.total_cents,
           s.payment_method,
           c.name as customer_name,
           c.phone as customer_phone,
           COALESCE(pay.paid_cents, 0) AS paid_cents,
           COALESCE(ret.returned_cents, 0) AS returned_cents,
           COALESCE(ret.refund_cents, 0) AS refund_cents,
           COALESCE(ret.debt_reduced_cents, 0) AS debt_reduced_cents,
           COALESCE(
             debt_added.debt_added_cents,
             CASE
               WHEN s.payment_method = 'debt' THEN s.total_cents
               WHEN s.payment_method = 'mixed' THEN MAX(s.total_cents - COALESCE(pay.paid_cents, 0), 0)
               ELSE 0
             END
           ) AS debt_added_cents,
           COALESCE(
             debt.outstanding_cents,
             CASE
               WHEN s.payment_method = 'debt' THEN MAX(s.total_cents - COALESCE(ret.returned_cents, 0), 0)
               WHEN s.payment_method = 'mixed' THEN MAX(
                 s.total_cents - COALESCE(pay.paid_cents, 0) - COALESCE(ret.returned_cents, 0),
                 0
               )
               ELSE 0
             END
           ) AS debt_cents
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN (
           SELECT sale_id, SUM(amount_cents) AS paid_cents
           FROM payments
           GROUP BY sale_id
         ) pay ON pay.sale_id = s.id
         LEFT JOIN (
           SELECT sale_id, SUM(total_cents) AS returned_cents
                , SUM(refund_cents) AS refund_cents
                , SUM(debt_reduced_cents) AS debt_reduced_cents
           FROM sale_returns
           GROUP BY sale_id
         ) ret ON ret.sale_id = s.id
         LEFT JOIN (
           SELECT sale_id, SUM(amount_cents) AS debt_added_cents
           FROM debt_transactions
           WHERE type = 'debt_added'
           GROUP BY sale_id
         ) debt_added ON debt_added.sale_id = s.id
         LEFT JOIN (
           SELECT sale_id, SUM(MAX(total_cents - paid_cents, 0)) AS outstanding_cents
           FROM debts
           GROUP BY sale_id
         ) debt ON debt.sale_id = s.id
         ORDER BY datetime(s.sale_date) DESC`
      )
      .all()
    return rows
  })

  ipcMain.handle(
    'get-analytics-report',
    (
      _event,
      filter?: {
        from?: string
        to?: string
      }
    ) => {
      const from = isValidYmd(filter?.from) ? filter?.from : undefined
      const to = isValidYmd(filter?.to) ? filter?.to : undefined
      const hasRange = !!(from && to)

      const named: Record<string, string> = {}
      const salesWhere: string[] = []
      const returnsWhere: string[] = []
      if (from) {
        named.from = from
        salesWhere.push('date(s.sale_date) >= date(@from)')
        returnsWhere.push('date(sr.created_at) >= date(@from)')
      }
      if (to) {
        named.to = to
        salesWhere.push('date(s.sale_date) <= date(@to)')
        returnsWhere.push('date(sr.created_at) <= date(@to)')
      }
      const salesWhereSql = salesWhere.length > 0 ? `WHERE ${salesWhere.join(' AND ')}` : ''
      const returnsWhereSql = returnsWhere.length > 0 ? `WHERE ${returnsWhere.join(' AND ')}` : ''

      const summary = db
        .prepare(
          `SELECT
             COUNT(*) AS sales_count,
             COALESCE(SUM(s.total_cents), 0) AS total_cents,
             COALESCE(SUM(s.discount_cents), 0) AS discount_cents,
             COALESCE(SUM(
               CASE
                 WHEN s.payment_method = 'debt' THEN s.total_cents
                 WHEN s.payment_method = 'mixed' THEN COALESCE((
                   SELECT SUM(dt.amount_cents)
                   FROM debt_transactions dt
                   WHERE dt.sale_id = s.id AND dt.type = 'debt_added'
                 ), 0)
                 ELSE 0
               END
             ), 0) AS debt_cents
           FROM sales s
           ${salesWhereSql}`
        )
        .get(named) as {
        sales_count: number
        total_cents: number
        discount_cents: number
        debt_cents: number
      }

      const returnsSummary = db
        .prepare(
          `SELECT
             COALESCE(SUM(sr.total_cents), 0) AS returned_cents,
             COALESCE(SUM(sr.refund_cents), 0) AS refund_cents,
             COALESCE(SUM(sr.debt_reduced_cents), 0) AS debt_reduced_cents
           FROM sale_returns sr
           ${returnsWhereSql}`
        )
        .get(named) as {
        returned_cents: number
        refund_cents: number
        debt_reduced_cents: number
      }

      const profitSummary = db
        .prepare(
          `SELECT
             COALESCE(SUM(si.profit_cents), 0) AS gross_profit_cents
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           ${salesWhereSql}`
        )
        .get(named) as { gross_profit_cents: number }

      const returnedProfitSummary = db
        .prepare(
          `SELECT
             COALESCE(SUM(
               CASE
                 WHEN si.quantity IS NULL OR si.quantity = 0 THEN 0
                 ELSE ROUND((si.profit_cents * sri.quantity) / si.quantity)
               END
             ), 0) AS returned_profit_cents
           FROM sale_return_items sri
           JOIN sale_returns sr ON sr.id = sri.return_id
           JOIN sale_items si ON si.id = sri.sale_item_id
           ${returnsWhereSql}`
        )
        .get(named) as { returned_profit_cents: number }

      const payments = db
        .prepare(
          `SELECT
             s.payment_method AS method,
             COUNT(*) AS sales_count,
             COALESCE(SUM(s.total_cents), 0) AS total_cents
           FROM sales s
           ${salesWhereSql}
           GROUP BY s.payment_method
           ORDER BY total_cents DESC`
        )
        .all(named)

      const daily = db
        .prepare(
          `SELECT
             date(s.sale_date) AS day,
             COUNT(*) AS sales_count,
             COALESCE(SUM(s.total_cents), 0) AS total_cents
           FROM sales s
           ${salesWhereSql}
           GROUP BY date(s.sale_date)
           ORDER BY day ASC`
        )
        .all(named)

      const topProducts = db
        .prepare(
          `SELECT
             si.product_id AS product_id,
             si.product_name AS product_name,
             COALESCE(SUM(si.quantity), 0) AS qty,
             COALESCE(SUM(si.line_total_cents), 0) AS revenue_cents
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           ${salesWhereSql}
           GROUP BY si.product_id, si.product_name
           ORDER BY revenue_cents DESC
           LIMIT 10`
        )
        .all(named)

      const inventoryWhere = salesWhere
        .map((clause) => clause.replace(/s\./g, 's2.'))
        .join(' AND ')
      const inventoryWhereSql = inventoryWhere ? `AND ${inventoryWhere}` : ''
      const inventory = db
        .prepare(
          `SELECT
             p.id AS product_id,
             p.barcode,
             p.name,
             p.unit,
             p.qty AS stock,
             p.min_stock,
             p.price_cents,
             COALESCE((
               SELECT SUM(si.quantity)
               FROM sale_items si
               JOIN sales s2 ON s2.id = si.sale_id
               WHERE si.product_id = p.id
               ${inventoryWhereSql}
             ), 0) AS sold_qty,
             COALESCE((
               SELECT SUM(si.line_total_cents)
               FROM sale_items si
               JOIN sales s2 ON s2.id = si.sale_id
               WHERE si.product_id = p.id
               ${inventoryWhereSql}
             ), 0) AS sold_cents
           FROM products p
           WHERE p.active = 1
           ORDER BY p.name ASC`
        )
        .all(named)

      let previousSummary: null | {
        sales_count: number
        total_cents: number
        discount_cents: number
        debt_cents: number
      } = null

      if (hasRange && from && to) {
        const len = diffDaysInclusive(from, to)
        const prevTo = addDays(from, -1)
        const prevFrom = addDays(prevTo, -(len - 1))

        previousSummary = db
          .prepare(
            `SELECT
               COUNT(*) AS sales_count,
               COALESCE(SUM(s.total_cents), 0) AS total_cents,
               COALESCE(SUM(s.discount_cents), 0) AS discount_cents,
               COALESCE(SUM(
                 CASE
                   WHEN s.payment_method = 'debt' THEN s.total_cents
                   WHEN s.payment_method = 'mixed' THEN COALESCE((
                     SELECT SUM(dt.amount_cents)
                     FROM debt_transactions dt
                     WHERE dt.sale_id = s.id AND dt.type = 'debt_added'
                   ), 0)
                   ELSE 0
                 END
               ), 0) AS debt_cents
             FROM sales s
             WHERE date(s.sale_date) >= date(@prevFrom)
               AND date(s.sale_date) <= date(@prevTo)`
          )
          .get({ prevFrom, prevTo }) as {
          sales_count: number
          total_cents: number
          discount_cents: number
          debt_cents: number
        }
      }

      const currentAvg = summary.sales_count > 0 ? Math.round(summary.total_cents / summary.sales_count) : 0
      const previousAvg =
        previousSummary && previousSummary.sales_count > 0
          ? Math.round(previousSummary.total_cents / previousSummary.sales_count)
          : 0

      const pct = (current: number, previous: number): number | null => {
        if (previous === 0) return current === 0 ? 0 : null
        return Number((((current - previous) / previous) * 100).toFixed(2))
      }

      const returnedCents = Number(returnsSummary.returned_cents ?? 0)
      const refundCents = Number(returnsSummary.refund_cents ?? 0)
      const debtReducedByReturnsCents = Number(returnsSummary.debt_reduced_cents ?? 0)
      const grossProfitCents = Number(profitSummary.gross_profit_cents ?? 0)
      const returnedProfitCents = Number(returnedProfitSummary.returned_profit_cents ?? 0)
      const netSalesCents = Math.max(0, Number(summary.total_cents ?? 0) - returnedCents)
      const netProfitCents = grossProfitCents - returnedProfitCents

      return {
        period: { from, to },
        summary: {
          salesCount: Number(summary.sales_count ?? 0),
          totalCents: Number(summary.total_cents ?? 0),
          returnedCents,
          netSalesCents,
          discountCents: Number(summary.discount_cents ?? 0),
          debtCents: Number(summary.debt_cents ?? 0),
          refundCents,
          debtReducedByReturnsCents,
          grossProfitCents,
          netProfitCents,
          avgCheckCents: currentAvg
        },
        previousSummary: previousSummary
          ? {
              salesCount: Number(previousSummary.sales_count ?? 0),
              totalCents: Number(previousSummary.total_cents ?? 0),
              discountCents: Number(previousSummary.discount_cents ?? 0),
              debtCents: Number(previousSummary.debt_cents ?? 0),
              avgCheckCents: previousAvg
            }
          : null,
        comparison: previousSummary
          ? {
              totalPct: pct(Number(summary.total_cents ?? 0), Number(previousSummary.total_cents ?? 0)),
              salesCountPct: pct(Number(summary.sales_count ?? 0), Number(previousSummary.sales_count ?? 0)),
              avgCheckPct: pct(currentAvg, previousAvg)
            }
          : null,
        payments: payments.map((p: any) => ({
          method: String(p.method),
          salesCount: Number(p.sales_count ?? 0),
          totalCents: Number(p.total_cents ?? 0)
        })),
        daily: daily.map((d: any) => ({
          day: String(d.day),
          salesCount: Number(d.sales_count ?? 0),
          totalCents: Number(d.total_cents ?? 0)
        })),
        topProducts: topProducts.map((r: any) => ({
          productId: Number(r.product_id),
          productName: String(r.product_name),
          qty: Number(r.qty ?? 0),
          revenueCents: Number(r.revenue_cents ?? 0),
          avgPriceCents: Number(r.qty ?? 0) > 0 ? Math.round(Number(r.revenue_cents ?? 0) / Number(r.qty ?? 1)) : 0
        })),
        inventory: inventory.map((r: any) => ({
          productId: Number(r.product_id),
          barcode: r.barcode ? String(r.barcode) : '',
          name: String(r.name),
          unit: r.unit ? String(r.unit) : '',
          stock: Number(r.stock ?? 0),
          minStock: Number(r.min_stock ?? 0),
          priceCents: Number(r.price_cents ?? 0),
          stockValueCents: Math.round(Number(r.stock ?? 0) * Number(r.price_cents ?? 0)),
          soldQty: Number(r.sold_qty ?? 0),
          soldCents: Number(r.sold_cents ?? 0)
        }))
      }
    }
  )

  ipcMain.handle('get-sale-items', (_event, saleId: number) => {
    return db
      .prepare(
        `SELECT
           si.id AS sale_item_id,
           si.product_name,
           si.barcode,
           si.quantity,
           si.unit_price_cents,
           si.line_total_cents,
           p.unit,
           COALESCE(ret.returned_qty, 0) AS returned_qty,
           MAX(si.quantity - COALESCE(ret.returned_qty, 0), 0) AS returnable_qty
         FROM sale_items si
         LEFT JOIN (
           SELECT sri.sale_item_id, SUM(sri.quantity) AS returned_qty
           FROM sale_return_items sri
           JOIN sale_returns sr ON sr.id = sri.return_id
           WHERE sr.sale_id = ?
           GROUP BY sri.sale_item_id
         ) ret ON ret.sale_item_id = si.id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = ?`
      )
      .all(saleId, saleId)
  })

  ipcMain.handle(
    'create-sale-return',
    (
      _event,
      payload: {
        saleId: number
        items: { saleItemId: number; qty: number }[]
        refundMethod?: 'cash' | 'card'
        note?: string
      }
    ) => {
      const t = db.transaction(() => {
        const saleId = Math.round(Number(payload?.saleId))
        if (!Number.isFinite(saleId) || saleId <= 0) {
          throw new Error("Sotuv ID noto'g'ri")
        }

        const rawItems = Array.isArray(payload?.items) ? payload.items : []
        if (rawItems.length === 0) {
          throw new Error("Qaytish uchun mahsulot tanlanmagan")
        }

        const sale = db
          .prepare('SELECT id, customer_id FROM sales WHERE id = ?')
          .get(saleId) as { id: number; customer_id?: number | null } | undefined
        if (!sale) throw new Error('Sotuv topilmadi')

        const saleItems = db
          .prepare(
            `SELECT id, product_id, quantity, unit_price_cents
             FROM sale_items
             WHERE sale_id = ?`
          )
          .all(saleId) as { id: number; product_id: number; quantity: number; unit_price_cents: number }[]
        const saleItemsById = new Map(saleItems.map((it) => [Number(it.id), it]))
        if (saleItemsById.size === 0) throw new Error("Sotuvda mahsulot topilmadi")

        const alreadyReturnedRows = db
          .prepare(
            `SELECT sri.sale_item_id, COALESCE(SUM(sri.quantity), 0) AS returned_qty
             FROM sale_return_items sri
             JOIN sale_returns sr ON sr.id = sri.return_id
             WHERE sr.sale_id = ?
             GROUP BY sri.sale_item_id`
          )
          .all(saleId) as { sale_item_id: number; returned_qty: number }[]
        const alreadyReturned = new Map(
          alreadyReturnedRows.map((r) => [Number(r.sale_item_id), Number(r.returned_qty ?? 0)])
        )

        const requestedBySaleItemId = new Map<number, number>()
        for (const item of rawItems) {
          const saleItemId = Math.round(Number(item.saleItemId))
          const qty = Number(item.qty)
          if (!Number.isFinite(saleItemId) || saleItemId <= 0) continue
          if (!Number.isFinite(qty) || qty <= 0) continue
          requestedBySaleItemId.set(saleItemId, (requestedBySaleItemId.get(saleItemId) ?? 0) + qty)
        }
        if (requestedBySaleItemId.size === 0) {
          throw new Error("Qaytarish miqdori noto'g'ri")
        }

        const epsilon = 1e-9
        const returnItems: {
          saleItemId: number
          productId: number
          qty: number
          unitPriceCents: number
          lineTotalCents: number
        }[] = []
        let totalReturnCents = 0
        for (const [saleItemId, qty] of requestedBySaleItemId.entries()) {
          const saleItem = saleItemsById.get(saleItemId)
          if (!saleItem) throw new Error(`Sotuv mahsuloti topilmadi: #${saleItemId}`)
          const soldQty = Number(saleItem.quantity ?? 0)
          const returnedQty = Number(alreadyReturned.get(saleItemId) ?? 0)
          const availableQty = Math.max(0, soldQty - returnedQty)
          if (qty > availableQty + epsilon) {
            throw new Error(`Qaytarish miqdori oshib ketdi (ID: ${saleItemId})`)
          }

          const lineTotalCents = Math.round(Number(saleItem.unit_price_cents ?? 0) * qty)
          if (lineTotalCents <= 0) continue
          totalReturnCents += lineTotalCents
          returnItems.push({
            saleItemId,
            productId: Number(saleItem.product_id),
            qty,
            unitPriceCents: Number(saleItem.unit_price_cents ?? 0),
            lineTotalCents
          })
        }
        if (returnItems.length === 0 || totalReturnCents <= 0) {
          throw new Error("Qaytarish summasi noto'g'ri")
        }

        const debt = db
          .prepare(
            `SELECT id, customer_id, total_cents, paid_cents, paid_at
             FROM debts
             WHERE sale_id = ?
             ORDER BY id DESC
             LIMIT 1`
          )
          .get(saleId) as
          | {
              id: number
              customer_id: number
              total_cents: number
              paid_cents: number
              paid_at?: string | null
            }
          | undefined

        const outstandingDebtCents = debt
          ? Math.max(0, Number(debt.total_cents ?? 0) - Number(debt.paid_cents ?? 0))
          : 0
        const debtReducedCents = Math.min(totalReturnCents, outstandingDebtCents)
        const refundCents = totalReturnCents - debtReducedCents
        const refundMethod = refundCents > 0 ? (payload.refundMethod === 'card' ? 'card' : 'cash') : null
        const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 500) : ''

        if (debtReducedCents > 0 && debt) {
          const newTotalCents = Math.max(0, Number(debt.total_cents ?? 0) - debtReducedCents)
          const newPaidCents = Math.min(Number(debt.paid_cents ?? 0), newTotalCents)
          const newIsPaid = newPaidCents >= newTotalCents ? 1 : 0
          db.prepare(
            `UPDATE debts
             SET total_cents = ?,
                 paid_cents = ?,
                 is_paid = ?,
                 paid_at = CASE
                   WHEN ? = 1 THEN COALESCE(paid_at, CURRENT_TIMESTAMP)
                   ELSE NULL
                 END
             WHERE id = ?`
          ).run(newTotalCents, newPaidCents, newIsPaid, newIsPaid, debt.id)

          db.prepare('UPDATE customers SET debt_cents = MAX(debt_cents - ?, 0) WHERE id = ?').run(
            debtReducedCents,
            debt.customer_id
          )
        }

        const retIns = db
          .prepare(
            `INSERT INTO sale_returns
             (sale_id, customer_id, total_cents, debt_reduced_cents, refund_method, refund_cents, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ${TASHKENT_SALE_DATE_SQL})`
          )
          .run(
            saleId,
            sale.customer_id ?? debt?.customer_id ?? null,
            totalReturnCents,
            debtReducedCents,
            refundMethod,
            refundCents,
            note || null
          )
        const returnId = Number(retIns.lastInsertRowid)

        const stockRowStmt = db.prepare(
          'SELECT id, qty, cost_cents FROM products WHERE id = ?'
        )
        const stockUpdateStmt = db.prepare('UPDATE products SET qty = ? WHERE id = ?')
        const returnItemInsertStmt = db.prepare(
          `INSERT INTO sale_return_items
           (return_id, sale_item_id, product_id, quantity, unit_price_cents, line_total_cents)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        const stockMovementInsertStmt = db.prepare(
          `INSERT INTO stock_movements
           (product_id, movement_type, quantity_change, old_qty, new_qty, cost_cents, unit_price_cents, reference_id, notes)
           VALUES (?, 'return', ?, ?, ?, ?, ?, ?, ?)`
        )

        for (const item of returnItems) {
          returnItemInsertStmt.run(
            returnId,
            item.saleItemId,
            item.productId,
            item.qty,
            item.unitPriceCents,
            item.lineTotalCents
          )

          const stock = stockRowStmt.get(item.productId) as
            | { id: number; qty: number; cost_cents: number }
            | undefined
          if (!stock) throw new Error('Mahsulot topilmadi')
          const oldQty = Number(stock.qty ?? 0)
          const newQty = oldQty + item.qty
          stockUpdateStmt.run(newQty, item.productId)
          stockMovementInsertStmt.run(
            item.productId,
            item.qty,
            oldQty,
            newQty,
            Number(stock.cost_cents ?? 0),
            item.unitPriceCents,
            returnId,
            `Qaytish #${returnId} (Sotuv #${saleId})`
          )
        }

        return {
          success: true,
          returnId,
          totalReturnedCents: totalReturnCents,
          debtReducedCents,
          refundCents,
          refundMethod: refundMethod ?? undefined
        }
      })

      return t()
    }
  )

  ipcMain.handle('get-sale-returns', () => {
    const rows = db
      .prepare(
        `SELECT
           sr.id AS return_id,
           sr.sale_id,
           sr.customer_id,
           c.name AS customer_name,
           sr.total_cents,
           sr.debt_reduced_cents,
           sr.refund_cents,
           sr.refund_method,
           sr.note,
           sr.created_at AS return_date,
           sri.id AS return_item_id,
           si.product_name,
           sri.quantity,
           sri.unit_price_cents,
           sri.line_total_cents
         FROM sale_returns sr
         LEFT JOIN customers c ON c.id = sr.customer_id
         LEFT JOIN sale_return_items sri ON sri.return_id = sr.id
         LEFT JOIN sale_items si ON si.id = sri.sale_item_id
         ORDER BY datetime(sr.created_at) DESC, sr.id DESC, sri.id ASC`
      )
      .all() as any[]

    const grouped = new Map<
      number,
      {
        id: number
        saleId: number
        customerId?: number
        customerName: string
        returnDate: string
        totalCents: number
        debtReducedCents: number
        refundCents: number
        refundMethod?: 'cash' | 'card'
        note?: string
        items: {
          productName: string
          quantity: number
          unitPriceCents: number
          lineTotalCents: number
        }[]
      }
    >()

    for (const row of rows) {
      const id = Number(row.return_id)
      if (!grouped.has(id)) {
        grouped.set(id, {
          id,
          saleId: Number(row.sale_id),
          customerId: row.customer_id != null ? Number(row.customer_id) : undefined,
          customerName: row.customer_name ? String(row.customer_name) : '-',
          returnDate: String(row.return_date),
          totalCents: Number(row.total_cents ?? 0),
          debtReducedCents: Number(row.debt_reduced_cents ?? 0),
          refundCents: Number(row.refund_cents ?? 0),
          refundMethod:
            row.refund_method === 'cash' || row.refund_method === 'card' ? row.refund_method : undefined,
          note: row.note ? String(row.note) : undefined,
          items: []
        })
      }

      if (row.return_item_id != null) {
        grouped.get(id)!.items.push({
          productName: row.product_name ? String(row.product_name) : '-',
          quantity: Number(row.quantity ?? 0),
          unitPriceCents: Number(row.unit_price_cents ?? 0),
          lineTotalCents: Number(row.line_total_cents ?? 0)
        })
      }
    }

    return Array.from(grouped.values())
  })

  ipcMain.handle('clear-sales-records', () => {
    const t = db.transaction(() => {
      db.prepare('DELETE FROM debt_transactions WHERE sale_id IS NOT NULL').run()
      db.prepare('DELETE FROM debts WHERE sale_id IS NOT NULL').run()
      db.prepare('DELETE FROM sales').run()

      db.prepare(
        `UPDATE customers
         SET debt_cents = COALESCE((
           SELECT SUM(MAX(d.total_cents - d.paid_cents, 0))
           FROM debts d
           WHERE d.customer_id = customers.id
             AND d.is_paid = 0
         ), 0)`
      ).run()

      return true
    })

    return t()
  })

  ipcMain.handle('pay-debt', (_event, customerId: number, amountCents: number) => {
    const t = db.transaction(() => {
      const safeAmount = Math.max(0, Math.round(Number(amountCents)))
      if (safeAmount <= 0) {
        throw new Error("To'lov summasi noto'g'ri")
      }

      const openDebts = db
        .prepare(
          `SELECT id, total_cents, paid_cents
           FROM debts
           WHERE customer_id = ? AND is_paid = 0
           ORDER BY datetime(created_at) ASC, id ASC`
        )
        .all(customerId) as { id: number; total_cents: number; paid_cents: number }[]

      let remaining = safeAmount
      let appliedTotal = 0
      for (const debt of openDebts) {
        if (remaining <= 0) break
        const outstanding = Math.max(0, debt.total_cents - debt.paid_cents)
        if (outstanding <= 0) continue
        const applied = Math.min(outstanding, remaining)
        db.prepare(
          `UPDATE debts
           SET paid_cents = paid_cents + ?,
               is_paid = CASE WHEN paid_cents + ? >= total_cents THEN 1 ELSE 0 END,
               paid_at = CASE
                 WHEN paid_cents + ? >= total_cents THEN CURRENT_TIMESTAMP
                 ELSE paid_at
               END
           WHERE id = ?`
        ).run(applied, applied, applied, debt.id)
        remaining -= applied
        appliedTotal += applied
      }

      if (appliedTotal <= 0) {
        throw new Error('Mijoz uchun ochiq qarz topilmadi')
      }

      db.prepare(
        `INSERT INTO debt_transactions (customer_id, type, amount_cents, note)
         VALUES (?, 'payment', ?, 'To''lov')`
      ).run(customerId, appliedTotal)
      db.prepare('UPDATE customers SET debt_cents = MAX(debt_cents - ?, 0) WHERE id = ?').run(
        appliedTotal,
        customerId
      )
      return true
    })
    return t()
  })

  ipcMain.handle('get-debts', () => {
    const rows = db
      .prepare(
        `SELECT
           d.id AS debt_id,
           d.customer_id,
           c.name AS customer_name,
           d.sale_id,
           s.total_cents AS sale_total_cents,
           COALESCE((
             SELECT SUM(p.amount_cents)
             FROM payments p
             WHERE p.sale_id = d.sale_id
           ), 0) AS sale_paid_cents,
           d.description,
           d.total_cents,
           d.paid_cents,
           d.is_paid,
           d.created_at AS debt_date,
           d.paid_at,
           si.product_name,
           si.unit_price_cents,
           si.quantity,
           si.line_total_cents,
           (
             SELECT MAX(dt.created_at)
             FROM debt_transactions dt
             WHERE dt.type = 'payment'
               AND dt.customer_id = d.customer_id
               AND (
                 (d.sale_id IS NOT NULL AND dt.sale_id = d.sale_id)
                 OR (d.sale_id IS NULL AND dt.note LIKE '%' || d.id || '%')
               )
           ) AS last_payment_at
         FROM debts d
         LEFT JOIN customers c ON c.id = d.customer_id
         LEFT JOIN sales s ON s.id = d.sale_id
         LEFT JOIN sale_items si ON si.sale_id = d.sale_id
         ORDER BY datetime(d.created_at) DESC, d.id DESC, si.id ASC`
      )
      .all() as any[]

    const grouped = new Map<
      number,
      {
        id: number
        customerId: number
        customerName: string
        saleId?: number
        description: string
        debtDate: string
        paymentDate?: string
        status: 'paid' | 'unpaid'
        totalCents: number
        paidCents: number
        remainingCents: number
        saleTotalCents?: number
        salePaidCents?: number
        items: {
          productName: string
          unitPriceCents: number
          quantity: number
          lineTotalCents: number
        }[]
      }
    >()

    for (const row of rows) {
      const id = Number(row.debt_id)
      if (!grouped.has(id)) {
        const totalCents = Number(row.total_cents ?? 0)
        const paidCents = Number(row.paid_cents ?? 0)
        grouped.set(id, {
          id,
          customerId: Number(row.customer_id),
          customerName: row.customer_name ?? '-',
          saleId: row.sale_id ?? undefined,
          description: row.description ?? '',
          debtDate: row.debt_date,
          paymentDate: row.paid_at ?? row.last_payment_at ?? undefined,
          status: Number(row.is_paid) === 1 ? 'paid' : 'unpaid',
          totalCents,
          paidCents,
          remainingCents: Math.max(0, totalCents - paidCents),
          saleTotalCents: row.sale_total_cents != null ? Number(row.sale_total_cents) : undefined,
          salePaidCents: row.sale_paid_cents != null ? Number(row.sale_paid_cents) : undefined,
          items: []
        })
      }

      if (row.product_name) {
        grouped.get(id)!.items.push({
          productName: row.product_name,
          unitPriceCents: Number(row.unit_price_cents ?? 0),
          quantity: Number(row.quantity ?? 0),
          lineTotalCents: Number(row.line_total_cents ?? 0)
        })
      }
    }

    return Array.from(grouped.values())
  })

  ipcMain.handle('pay-debt-record', (_event, debtId: number, amountCents: number) => {
    const t = db.transaction(() => {
      const debt = db
        .prepare(
          `SELECT id, customer_id, sale_id, total_cents, paid_cents, is_paid
           FROM debts
           WHERE id = ?`
        )
        .get(debtId) as
        | {
            id: number
            customer_id: number
            sale_id?: number | null
            total_cents: number
            paid_cents: number
            is_paid: number
          }
        | undefined

      if (!debt) throw new Error('Qarz yozuvi topilmadi')
      if (debt.is_paid === 1) throw new Error("Qarz allaqachon to'langan")

      const safeAmount = Math.max(0, Math.round(Number(amountCents)))
      if (!safeAmount) throw new Error("To'lov summasi noto'g'ri")

      const outstanding = Math.max(0, debt.total_cents - debt.paid_cents)
      if (outstanding <= 0) throw new Error("Qarz qoldig'i yo'q")
      const applied = Math.min(safeAmount, outstanding)

      db.prepare(
        `INSERT INTO debt_transactions (customer_id, sale_id, type, amount_cents, note)
         VALUES (?, ?, 'payment', ?, ?)`
      ).run(debt.customer_id, debt.sale_id ?? null, applied, `Qarz #${debt.id} to'lov`)

      db.prepare(
        `UPDATE debts
         SET paid_cents = paid_cents + ?,
             is_paid = CASE WHEN paid_cents + ? >= total_cents THEN 1 ELSE 0 END,
             paid_at = CASE
               WHEN paid_cents + ? >= total_cents THEN CURRENT_TIMESTAMP
               ELSE paid_at
             END
         WHERE id = ?`
      ).run(applied, applied, applied, debt.id)

      db.prepare('UPDATE customers SET debt_cents = MAX(debt_cents - ?, 0) WHERE id = ?').run(
        applied,
        debt.customer_id
      )

      return { success: true, appliedCents: applied, fullyPaid: applied >= outstanding }
    })

    return t()
  })

  ipcMain.handle('delete-debt-record', (_event, debtId: number) => {
    const t = db.transaction(() => {
      const debt = db
        .prepare(
          `SELECT id, customer_id, sale_id, total_cents, paid_cents
           FROM debts
           WHERE id = ?`
        )
        .get(debtId) as
        | {
            id: number
            customer_id: number
            sale_id?: number | null
            total_cents: number
            paid_cents: number
          }
        | undefined
      if (!debt) return false

      const outstanding = Math.max(0, Number(debt.total_cents) - Number(debt.paid_cents))
      db.prepare('DELETE FROM debts WHERE id = ?').run(debt.id)

      if (debt.sale_id) {
        db.prepare(
          `DELETE FROM debt_transactions
           WHERE type = 'debt_added' AND customer_id = ? AND sale_id = ?`
        ).run(debt.customer_id, debt.sale_id)
      }

      if (outstanding > 0) {
        db.prepare('UPDATE customers SET debt_cents = MAX(debt_cents - ?, 0) WHERE id = ?').run(
          outstanding,
          debt.customer_id
        )
      }

      return true
    })

    return t()
  })

  ipcMain.handle('clear-debts-records', () => {
    const t = db.transaction(() => {
      db.prepare('UPDATE customers SET debt_cents = 0 WHERE debt_cents > 0').run()
      db.prepare('DELETE FROM debts').run()
      db.prepare('DELETE FROM debt_transactions').run()
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
      payload: {
        sku?: string
        name: string
        price: number
        costPrice?: number
        unit?: string
        barcode?: string
      }
    ) => {
      try {
        const normalizedUnit = typeof payload.unit === 'string' ? payload.unit.trim().toLowerCase() : 'dona'
        const safeUnit = allowedUnits.has(normalizedUnit) ? normalizedUnit : 'dona'
        const current = db.prepare('SELECT sku, barcode, cost_cents FROM products WHERE id = ?').get(productId) as any
        if (!current) throw new Error('Mahsulot topilmadi')
        const safeSku = payload.sku?.trim() || current.sku
        const safeName = payload.name?.trim()
        const safePrice = Number(payload.price)
        const safeCostPrice =
          payload.costPrice == null
            ? Number(current.cost_cents ?? 0) / 100
            : Number(payload.costPrice)
        if (
          !safeSku ||
          !safeName ||
          !Number.isFinite(safePrice) ||
          safePrice < 0 ||
          !Number.isFinite(safeCostPrice) ||
          safeCostPrice < 0
        ) {
          throw new Error("Ma'lumotlar noto'g'ri")
        }
        const barcode =
          typeof payload.barcode === 'string' ? (payload.barcode.trim() ? payload.barcode.trim() : null) : current.barcode
        const res = db
          .prepare(
            'UPDATE products SET sku = ?, name = ?, cost_cents = ?, price_cents = ?, unit = ?, barcode = ? WHERE id = ?'
          )
          .run(
            safeSku,
            safeName,
            Math.round(safeCostPrice * 100),
            Math.round(safePrice * 100),
            safeUnit,
            barcode,
            productId
          )
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
      await PrinterService.printReceiptBySale(Number(saleId), "Do'kondor POS", printerName || 'receipt')
      return { success: true }
    } catch (err: any) {
      console.error('Receipt print error', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('print-return-receipt', async (_event, returnId: number, printerName?: string) => {
    try {
      await PrinterService.printReturnReceiptById(Number(returnId), "Do'kondor POS", printerName || 'receipt')
      return { success: true }
    } catch (err: any) {
      console.error('Return receipt print error', err)
      return { success: false, error: err.message }
    }
  })
}
