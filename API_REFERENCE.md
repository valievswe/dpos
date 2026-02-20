# Do'kondor API Reference Guide

> **Renderer Access Point:** `window.api` (exposed via `src/preload/index.ts`)
> **Last Updated:** 2026-02-20

---

## Type Definitions

```typescript
interface Product {
  id: number
  sku: string
  name: string
  price: number        // so'm, already divided by 100
  costPrice: number    // tan narxi (so'm), from cost_cents / 100
  stock: number        // stored as REAL in DB (can be fractional)
  barcode?: string
  unit?: string
  min_stock?: number   // returned by main (mapProductRow), not typed in preload d.ts
}

interface SalePayload {
  items: { productId: number; qty: number }[]
  paymentMethod: 'cash' | 'card' | 'mixed' | 'debt'
  discountCents?: number
  customer?: { name: string; phone?: string }
  paidCents?: number           // required for mixed, in cents
  paidMethod?: 'cash' | 'card' // required for mixed
}

interface SaleSummary {
  id: number
  sale_date: string
  total_cents: number
  paid_cents: number
  debt_added_cents: number
  debt_reduced_cents: number
  debt_cents: number
  returned_cents: number
  refund_cents: number
  payment_method: string
  customer_name?: string
  customer_phone?: string
}

interface SaleItemRow {
  sale_item_id: number
  product_name: string
  barcode?: string
  unit?: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  returned_qty?: number
  returnable_qty?: number
}

interface CreateSaleReturnPayload {
  saleId: number
  items: { saleItemId: number; qty: number }[]
  refundMethod?: 'cash' | 'card'
  note?: string
}

interface CreateSaleReturnResult {
  success: boolean
  returnId: number
  totalReturnedCents: number
  debtReducedCents: number
  refundCents: number
  refundMethod?: 'cash' | 'card'
}

interface SaleReturnItem {
  productName: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
}

interface SaleReturnRecord {
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
  items: SaleReturnItem[]
}

interface DeleteProductResult {
  success: boolean
  requiresConfirmation?: boolean
  saleCount?: number
  movementCount?: number
}

interface AddProductResult {
  success: boolean
  productId?: number
  barcode?: string
}

interface UpdateProductPayload {
  sku?: string
  name: string
  price: number
  costPrice?: number
  unit?: string
  barcode?: string
}

interface ExportSalesExcelPayload {
  headers: string[]
  rows: (string | number)[][]
  fileName?: string
  sheetName?: string
}

interface ExportSalesExcelResult {
  success: boolean
  cancelled?: boolean
  path?: string
}

interface AuthStatus {
  hasOwner: boolean
  authenticated: boolean
  username: string | null
}

interface DebtItem {
  productName: string
  unitPriceCents: number
  quantity: number
  lineTotalCents: number
}

interface DebtRecord {
  id: number
  customerId: number
  customerName: string
  saleId?: number
  saleTotalCents?: number
  salePaidCents?: number
  description: string
  debtDate: string
  paymentDate?: string
  status: 'paid' | 'unpaid'
  totalCents: number
  paidCents: number
  remainingCents: number
  items: DebtItem[]
}

interface PayDebtRecordResult {
  success: boolean
  appliedCents: number
  fullyPaid: boolean
}

interface AnalyticsPaymentRow {
  method: string
  salesCount: number
  totalCents: number
}

interface AnalyticsDailyRow {
  day: string
  salesCount: number
  totalCents: number
}

interface AnalyticsTopProductRow {
  productId: number
  productName: string
  qty: number
  revenueCents: number
  avgPriceCents: number
}

interface AnalyticsInventoryRow {
  productId: number
  barcode: string
  name: string
  unit: string
  stock: number
  minStock: number
  priceCents: number
  stockValueCents: number
  soldQty: number
  soldCents: number
}

interface AnalyticsReport {
  period: { from?: string; to?: string }
  summary: {
    salesCount: number
    totalCents: number
    returnedCents: number
    netSalesCents: number
    discountCents: number
    debtCents: number
    refundCents: number
    debtReducedByReturnsCents: number
    grossProfitCents: number
    netProfitCents: number
    avgCheckCents: number
  }
  previousSummary: null | {
    salesCount: number
    totalCents: number
    discountCents: number
    debtCents: number
    avgCheckCents: number
  }
  comparison: null | {
    totalPct: number | null
    salesCountPct: number | null
    avgCheckPct: number | null
  }
  payments: AnalyticsPaymentRow[]
  daily: AnalyticsDailyRow[]
  topProducts: AnalyticsTopProductRow[]
  inventory: AnalyticsInventoryRow[]
}
```

---

## Quick Method Matrix

| Method | IPC Channel | Returns | Notes |
|--------|-------------|---------|-------|
| `getAuthStatus()` | `auth-status` | `Promise<AuthStatus>` | Session is in-memory; on app restart, user must log in again. |
| `setupOwner(username, password)` | `auth-setup-owner` | `Promise<boolean>` | One-time owner creation (`app_users`). Throws if owner exists. |
| `login(username, password)` | `auth-login` | `Promise<boolean>` | Verifies password and sets session. |
| `logout()` | `auth-logout` | `Promise<boolean>` | Clears in-memory session. |
| `changePassword(current, next)` | `auth-change-password` | `Promise<boolean>` | Requires active session. |
| `getProducts()` | `get-products` | `Promise<Product[]>` | Ensures missing barcodes are generated; returns active products sorted by name. |
| `deleteProduct(productId, force?)` | `delete-product` | `Promise<DeleteProductResult>` | Soft delete with confirmation when history exists. |
| `addProduct(sku, name, price, unit?, qty?, barcode?, costPrice?)` | `add-product` | `Promise<AddProductResult>` | Supports both `price` (sotuv narxi) and optional `costPrice` (tan narxi). |
| `updateProduct(productId, payload)` | `update-product` | `Promise<boolean>` | Updates SKU/name/price/costPrice/unit/barcode; auto-generates barcode when blank. |
| `findProduct(code)` | `find-product` | `Promise<Product | null>` | **Barcode-only** lookup (no SKU fallback). Does not filter on `active`. |
| `setStock(productId, qty)` | `set-stock` | `Promise<boolean>` | Logs an `adjustment` in `stock_movements`. |
| `createSale(payload)` | `create-sale` | `Promise<{ saleId: number; total_cents: number }>` | Transactional checkout with cash/card/debt/mixed support. |
| `getSales()` | `get-sales` | `Promise<SaleSummary[]>` | Latest 50 sales with paid/debt/return/refund splits. |
| `getSalesAll()` | `get-sales-all` | `Promise<SaleSummary[]>` | Full sales list (no limit) with the same financial split fields. |
| `getSaleItems(saleId)` | `get-sale-items` | `Promise<SaleItemRow[]>` | Includes `sale_item_id`, `barcode`, `unit`, and returnability fields. |
| `createSaleReturn(payload)` | `create-sale-return` | `Promise<CreateSaleReturnResult>` | Validated return flow: updates stock, debt, and refund ledger atomically. |
| `getSaleReturns()` | `get-sale-returns` | `Promise<SaleReturnRecord[]>` | Returns grouped return rows with line items. |
| `clearSalesRecords()` | `clear-sales-records` | `Promise<boolean>` | Deletes sales + sale-linked debts, recalculates customer debt. |
| `getAnalyticsReport(filter?)` | `get-analytics-report` | `Promise<AnalyticsReport>` | Summary now includes returns/refunds and gross/net profit; also returns payments/daily/top/inventory. |
| `payDebt(customerId, amountCents)` | `pay-debt` | `Promise<boolean>` | Applies payment to oldest open debts. |
| `getDebts()` | `get-debts` | `Promise<DebtRecord[]>` | Aggregated debt rows with items. |
| `payDebtRecord(debtId, amountCents)` | `pay-debt-record` | `Promise<PayDebtRecordResult>` | Pays a specific debt row. |
| `deleteDebtRecord(debtId)` | `delete-debt-record` | `Promise<boolean>` | Deletes a single debt entry. |
| `clearDebtsRecords()` | `clear-debts-records` | `Promise<boolean>` | Clears all debt + debt_transactions rows. |
| `exportSalesExcel(payload)` | `export-sales-excel` | `Promise<ExportSalesExcelResult>` | Opens save dialog and writes `.xlsx`. |
| `printBarcode(sku, name)` | `trigger-print` | `void` | Legacy, no job ledger. |
| `printReceipt(storeName, items, total)` | `trigger-receipt` | `void` | Legacy, no job ledger. |
| `printBarcodeByProduct(productId, copies?, printerName?)` | `print-barcode-product` | `Promise<boolean>` | Preferred barcode path, writes `print_jobs`. |
| `printReceiptBySale(saleId, printerName?)` | `print-receipt-sale` | `Promise<{ success: boolean; error?: string }>` | Preferred receipt path. |
| `printReturnReceiptById(returnId, printerName?)` | `print-return-receipt` | `Promise<{ success: boolean; error?: string }>` | Prints a return/refund receipt from persisted return data. |

---

## Auth APIs

> **Auth enforcement note:** Only `auth-change-password` validates an active session in main. Most business IPC methods do not perform session checks and rely on renderer gating (`AuthGate`).

### `window.api.getAuthStatus()`
- **IPC**: `ipcMain.handle('auth-status')`
- **Returns**: `{ hasOwner, authenticated, username }`.
- **Note**: Authentication is stored in memory (`authSessionUserId`); on app restart the user must log in again.

### `window.api.setupOwner(username, password)`
- **IPC**: `ipcMain.handle('auth-setup-owner')`
- **Description**: Creates the first (and only) owner row in `app_users` with role `Do'kondor`.
- **Validation**: `username.length >= 3`, `password.length >= 4`.
- **Returns**: `true` on success; throws if owner already exists.

### `window.api.login(username, password)`
- **IPC**: `ipcMain.handle('auth-login')`
- **Description**: Verifies credentials and sets the in-memory session.
- **Returns**: `true` on success; throws on invalid credentials.

### `window.api.logout()`
- **IPC**: `ipcMain.handle('auth-logout')`
- **Description**: Clears the in-memory session.
- **Returns**: `true`.

### `window.api.changePassword(currentPassword, newPassword)`
- **IPC**: `ipcMain.handle('auth-change-password')`
- **Description**: Updates the owner password (requires active session).
- **Returns**: `true` on success; throws on invalid current password.

---

## Inventory APIs

### `window.api.getProducts()`
- **IPC**: `ipcMain.handle('get-products')`
- **Description**: Returns all active products ordered by `name`. Runs an auto-fix step that generates missing barcodes for any product with an empty barcode field.
- **Returns**: Products with `price` (sotuv narxi) and `costPrice` (tan narxi) already converted from cents, `stock` from `qty`.
- **Side Effects**: May update `products.barcode` and `updated_at`.

### `window.api.deleteProduct(productId, force = false)`
- **IPC**: `ipcMain.handle('delete-product')`
- **Behavior**: Soft-deletes a product by setting `active = 0`.
- **Safety checks**: Counts prior usage in `sale_items` and `stock_movements`; if found and `force` is false, returns `{ success: false, requiresConfirmation: true, saleCount, movementCount }`.
- **Returns**: `DeleteProductResult` and always echoes historical counts.

### `window.api.addProduct(sku, name, price, unit?, qty?, barcode?, costPrice?)`
- **IPC**: `ipcMain.handle('add-product')`
- **Parameters**:
  - `sku`: Optional; if omitted, a fallback like `P-<timestamp>-<rand>` is generated.
  - `name`: Product label.
  - `price`: Sotuv narxi, decimal so'm (renderer sends so'm, main stores cents).
  - `costPrice` (optional): Tan narxi, decimal so'm (`>= 0`), default `0`.
  - `unit` (optional): `'dona' | 'qadoq' | 'litr' | 'metr' | 'kg'`; anything else coerces to `'dona'`.
  - `qty` (optional): Initial stock; rounded to an integer and clamped to `>= 0`.
  - `barcode` (optional): If provided, is stored and also used as SKU when SKU is empty.
- **Behavior**:
  1. Inserts the product row.
  2. If barcode is missing, generates a unique EAN-8 barcode.
  3. If SKU was empty, updates SKU to the generated barcode.
- **Returns**: `{ success, productId?, barcode? }`.

### `window.api.updateProduct(productId, payload)`
- **IPC**: `ipcMain.handle('update-product')`
- **Validation**: Ensures `name` is non-empty, `price` is finite non-negative, and `costPrice` (if sent) is finite non-negative.
- **Unit Handling**: Same whitelist as `addProduct`.
- **Barcode Handling**: If barcode is blank/undefined, the handler auto-generates one after update.
- **Returns**: `true` on success; throws for invalid data.

### `window.api.findProduct(code)`
- **IPC**: `ipcMain.handle('find-product')`
- **Description**: Resolves a product by **barcode only**. Returns `null` if not found.
- **Important**: Query is `SELECT ... WHERE barcode = ? LIMIT 1` with no `active = 1` condition, so inactive products may still resolve.
- **Note**: There is no SKU fallback in the main process.

### `window.api.setStock(productId, qty)`
- **IPC**: `ipcMain.handle('set-stock')`
- **Behavior**: Updates `products.qty` exactly to the provided numeric value and records an `adjustment` row in `stock_movements` with `old_qty`, `new_qty`, and pricing context.
- **Returns**: Resolves `true` on success; throws if the product is missing.

---

## Sales & Customer APIs

### `window.api.createSale(payload)`
- **IPC**: `ipcMain.handle('create-sale')`
- **Validation**:
  - `payload.items` must be non-empty.
  - Every product must exist and have sufficient stock.
  - Debt and mixed payments require `payload.customer.name`.
  - Mixed payments require `payload.paidCents` where `0 < paidCents < total`.
- **Side Effects** (single transaction):
  1. Optional customer lookup/creation (deduplicates by phone when provided).
  2. Subtotal calculation (price * qty), discount clamped to subtotal, tax = 0.
  3. Insert into `sales` (date stored as Tashkent time string).
  4. Insert `sale_items`, decrement product stock, append `stock_movements` with `movement_type = 'sale'`.
  5. If `paymentMethod === 'debt'`: insert `debt_transactions`, increment `customers.debt_cents`, create `debts` row.
  6. If `paymentMethod === 'mixed'`: insert a `payments` row for the paid portion (`paidMethod`, `paidCents`) and create debt rows for the remainder.
  7. Otherwise (`cash`/`card`): insert full amount into `payments`.
- **Returns**: `{ saleId, total_cents }`.

### `window.api.getSales()`
- **IPC**: `ipcMain.handle('get-sales')`
- **Description**: Fetches the latest 50 sales joined with optional customer name + phone.
- **Includes**:
  - `paid_cents`: total payment rows recorded for the sale.
  - `debt_added_cents`: sale paytida qarzga yozilgan dastlabki summa.
  - `debt_reduced_cents`: qaytishlarda qarzdan kamaygan summa.
  - `returned_cents`: sum of linked return rows.
  - `refund_cents`: customerga real qaytarilgan summa (kassa chiqimi).
  - `debt_cents`: current outstanding debt for this sale (uses debt ledger if present, otherwise computes fallback from sale/payment/returns).
- **Order**: `datetime(sale_date) DESC`.

### `window.api.getSalesAll()`
- **IPC**: `ipcMain.handle('get-sales-all')`
- **Description**: Same shape as `getSales()`, but without limit (includes debt/refund split fields).

### `window.api.getSaleItems(saleId)`
- **IPC**: `ipcMain.handle('get-sale-items')`
- **Description**: Returns sale items with return metadata.
- **Includes**:
  - `sale_item_id`
  - `returned_qty`
  - `returnable_qty`
  - `barcode`, `unit`, `quantity`, and pricing fields.

### `window.api.createSaleReturn(payload)`
- **IPC**: `ipcMain.handle('create-sale-return')`
- **Payload**: `{ saleId, items: [{ saleItemId, qty }], refundMethod?, note? }`
- **Validation**:
  - Sale must exist.
  - At least one return item with positive qty.
  - Cannot return more than remaining returnable qty per sale item.
- **Atomic behavior**:
  1. Insert `sale_returns` header row.
  2. Insert `sale_return_items` detail rows.
  3. Increase stock for each returned product.
  4. Log stock movements with `movement_type = 'return'`.
  5. Reduce debt first (if sale has open debt), then mark remaining amount as refund (`cash`/`card`).
- **Returns**: `{ success, returnId, totalReturnedCents, debtReducedCents, refundCents, refundMethod? }`.

### `window.api.getSaleReturns()`
- **IPC**: `ipcMain.handle('get-sale-returns')`
- **Description**: Returns grouped return records with customer info and line items.
- **Includes**: `totalCents`, `debtReducedCents`, `refundCents`, `refundMethod`, `note`, and item list.

### `window.api.clearSalesRecords()`
- **IPC**: `ipcMain.handle('clear-sales-records')`
- **Behavior**: Deletes all `sales` rows and any debt rows linked to a sale, then recalculates `customers.debt_cents` from remaining open debts.
- **Returns**: `true` on success.

### `window.api.payDebt(customerId, amountCents)`
- **IPC**: `ipcMain.handle('pay-debt')`
- **Behavior**: Applies the amount to the oldest open debts for the customer, inserts a `debt_transactions` payment, and reduces `customers.debt_cents`.
- **Returns**: `true` on success; throws if no open debt or amount is invalid.

---

## Debt Record APIs

### `window.api.getDebts()`
- **IPC**: `ipcMain.handle('get-debts')`
- **Description**: Returns grouped debt rows with items from `sale_items`.
- **Includes**:
  - status + totals (`totalCents`, `paidCents`, `remainingCents`)
  - `saleTotalCents` and `salePaidCents` when linked to a sale
  - last payment timestamp.

### `window.api.payDebtRecord(debtId, amountCents)`
- **IPC**: `ipcMain.handle('pay-debt-record')`
- **Behavior**: Applies a payment to a single debt row and updates `paid_cents`, `is_paid`, and `paid_at`.
- **Returns**: `{ success, appliedCents, fullyPaid }`.

### `window.api.deleteDebtRecord(debtId)`
- **IPC**: `ipcMain.handle('delete-debt-record')`
- **Behavior**: Deletes the debt row, removes the matching `debt_added` transaction (when sale-linked), and reduces customer debt by the outstanding amount.
- **Returns**: `true` if deleted.

### `window.api.clearDebtsRecords()`
- **IPC**: `ipcMain.handle('clear-debts-records')`
- **Behavior**: Clears all `debts` and `debt_transactions` rows and resets `customers.debt_cents` to 0.
- **Returns**: `true` on success.

---

## Analytics API

### `window.api.getAnalyticsReport(filter?)`
- **IPC**: `ipcMain.handle('get-analytics-report')`
- **Filter**: `{ from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }`. Invalid dates are ignored.
- **Description**:
  - Provides period summary + payment split + daily totals + top products + inventory performance.
  - Summary includes: `returnedCents`, `netSalesCents`, `refundCents`, `debtReducedByReturnsCents`, `grossProfitCents`, `netProfitCents`.
  - When both `from` and `to` are set, computes a previous-period comparison of equal length.
  - Inventory rows include stock, min stock, and sales totals within the selected period.
- **Returns**: `AnalyticsReport`.

---

## Export API

### `window.api.exportSalesExcel(payload)`
- **IPC**: `ipcMain.handle('export-sales-excel')`
- **Description**: Opens a save dialog, writes an `.xlsx` file using the provided headers + rows.
- **Defaults**:
  - `fileName`: `sales.xlsx` when omitted.
  - `sheetName`: `Sales` when omitted.
- **Returns**:
  - `{ success: true, path }` on write.
  - `{ success: false, cancelled: true }` when the user cancels the dialog.

---

## Printer APIs

### `window.api.printBarcodeByProduct(productId, copies = 1, printerName?)`
- **IPC**: `ipcMain.handle('print-barcode-product')`
- **Description**: Preferred workflow for barcode labels.
  1. Ensures the product has a unique EAN-8 barcode (auto-generates if missing).
  2. Validates that the barcode is exactly 8 digits (EAN-8).
  3. Writes a queued row to `print_jobs` with payload metadata (includes printer name).
  4. Resolves the correct printer binary path in dev/prod; throws early if missing.
  5. Executes the barcode binary `copies` times.
  6. Updates job status to `done` or `failed`.
- **Returns**: Resolves `true` after printer loop completes; rejects with an error message if the binary fails.

### `window.api.printBarcode(sku, name)` *(legacy)*
- **IPC**: `ipcMain.on('trigger-print')`
- **Notes**: Fire-and-forget helper that bypasses the print queue. Avoid in new UI.

### `window.api.printReceiptBySale(saleId, printerName?)`
- **IPC**: `ipcMain.handle('print-receipt-sale')`
- **Steps**:
  1. Loads sale header (`total_cents`).
  2. Loads `sale_items` and formats `name|qty|unit_price|line_total` string (values in so'm).
  3. Includes `subtotal`, `discount`, `total`, and `payment_method` in the payload.
  4. Inserts a queued `print_jobs` row with serialized payload.
  5. Executes `receipt2.exe` with `[printerName || 'receipt', "Do'kondor POS", itemsString, subtotal, discount, total, paymentMethod]` (fallback: `receipt.exe`).
  6. Updates the job status to `done` or `failed`.
- **Returns**: `{ success: true }` or `{ success: false, error }`.

### `window.api.printReturnReceiptById(returnId, printerName?)`
- **IPC**: `ipcMain.handle('print-return-receipt')`
- **Steps**:
  1. Loads return header from `sale_returns`.
  2. Loads return items from `sale_return_items`.
  3. Formats return receipt payload and writes `print_jobs` queue row.
  4. Executes receipt binary and updates job status to `done` or `failed`.
- **Returns**: `{ success: true }` or `{ success: false, error }`.

### `window.api.printReceipt(storeName, items, total)` *(legacy)*
- **IPC**: `ipcMain.on('trigger-receipt')`
- **Notes**: Does not interact with `print_jobs` or sale data. Prefer `printReceiptBySale`.

---

## Error Handling

- All `ipcRenderer.invoke` calls propagate thrown errors as rejected Promises. Wrap calls in `try/catch` and display human-friendly strings.
- `addProduct` returns `{ success: false }` on DB errors (no throw). `updateProduct`, `setStock`, `createSale`, `createSaleReturn`, and auth/debt handlers throw on validation/DB errors.
- `deleteProduct` never throws; it returns `{ success: false }` when the product is missing.
- Printer APIs return structured responses only for the job-based methods. Legacy `printBarcode` and `printReceipt` have no completion signal beyond main-process logs.
- `printBarcodeByProduct` rejects on failure. `printReceiptBySale` and `printReturnReceiptById` catch failures and return `{ success: false, error }` instead of rejecting in normal error paths.

---

## Extending The API Surface

1. **Main Process**: Add a new `ipcMain.handle` (or `on`) block in `src/main/ipc/index.ts`.
2. **Preload**: Mirror the method in the `api` object inside `src/preload/index.ts`.
3. **Types**: Update `src/preload/index.d.ts` so renderer TypeScript picks up the new method signature.
4. **Renderer**: Use `window.api.yourMethod()` only; avoid importing `ipcRenderer` directly to keep context isolation intact.

When returning data to the renderer, prefer serializable POJOs (no `Database` objects) and express monetary values in cents so rounding stays consistent.

---

## Legacy vs Preferred Methods

| Concern | Preferred | Legacy | Why |
|---------|-----------|--------|-----|
| Barcode printing | `printBarcodeByProduct` | `printBarcode` | Adds DB queue + retry info. |
| Receipt printing | `printReceiptBySale` | `printReceipt` | Uses stored sale data; returns success flag. |
| Return receipt printing | `printReturnReceiptById` | *(none)* | Uses persisted return/debt/refund data. |

---

## Sample Usage Patterns

```typescript
// Load products when ProductManager mounts
useEffect(() => {
  let mounted = true
  window.api.getProducts().then((rows) => mounted && setProducts(rows))
  return () => {
    mounted = false
  }
}, [])

// Add product form submission
const submit = async () => {
  const res = await window.api.addProduct(
    '',
    name.trim(),
    parseFloat(sellPrice),
    unit,
    qty,
    barcode || undefined,
    parseFloat(costPrice || '0')
  )
  if (!res.success) {
    setError('Mahsulot qo\'shilmadi')
    return
  }
  await reload()
}

// Update product
await window.api.updateProduct(productId, {
  name: editName.trim(),
  price: parseFloat(editSellPrice),
  costPrice: parseFloat(editCostPrice || '0'),
  unit: editUnit,
  barcode: editBarcode || undefined
})

// Checkout flow with error surfacing
try {
  const result = await window.api.createSale({
    items: cart.map((line) => ({ productId: line.product.id, qty: line.qty })),
    paymentMethod,
    discountCents: Math.round(discount * 100),
    customer: paymentMethod === 'debt' || paymentMethod === 'mixed' ? { name: custName, phone: custPhone || undefined } : undefined,
    paidCents: paymentMethod === 'mixed' ? Math.round(partialPaidSom * 100) : undefined,
    paidMethod: paymentMethod === 'mixed' ? 'cash' : undefined
  })
  setNotice(`Sotuv #${result.saleId} yakunlandi`)
} catch (err: any) {
  setError(err.message)
}

// Analytics report
const report = await window.api.getAnalyticsReport({ from: '2026-02-01', to: '2026-02-15' })
console.log(report.summary.netSalesCents, report.summary.netProfitCents)
```

---

## IPC Channel Locations

All handlers live in `src/main/ipc/index.ts`. Search for the channel string to inspect precise SQL.

| Channel | Purpose |
|---------|---------|
| `auth-status` | Session status (has owner, authenticated, username) |
| `auth-setup-owner` | First owner creation |
| `auth-login` | Login flow |
| `auth-logout` | Clear session |
| `auth-change-password` | Update owner password |
| `get-products` | Inventory listing + barcode auto-fill |
| `add-product` | Insert inventory (auto barcode/SKU) |
| `update-product` | Update inventory fields |
| `delete-product` | Soft delete with confirmation counts |
| `find-product` | Barcode lookup |
| `set-stock` | Manual quantity override |
| `create-sale` | Checkout transaction |
| `get-sales` | Sales summary (latest 50) |
| `get-sales-all` | Sales summary (all) |
| `get-sale-items` | Sale line items |
| `create-sale-return` | Sale-linked return/refund transaction |
| `get-sale-returns` | Return/refund history list |
| `clear-sales-records` | Clears sales + sale-linked debts |
| `get-analytics-report` | Summary (returns/refunds/profit) + payments/daily/top/inventory analytics |
| `pay-debt` | Apply payment to oldest debts |
| `get-debts` | Debt list with items |
| `pay-debt-record` | Pay specific debt row |
| `delete-debt-record` | Remove debt row |
| `clear-debts-records` | Clear all debt history |
| `export-sales-excel` | Excel export dialog + write |
| `trigger-print` | Legacy barcode |
| `trigger-receipt` | Legacy receipt |
| `print-barcode-product` | Job-backed barcode |
| `print-receipt-sale` | Job-backed receipt |
| `print-return-receipt` | Job-backed return receipt |

---

This guide captures the full renderer-facing API surface as of 2026-02-20.
