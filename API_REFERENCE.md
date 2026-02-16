# Do'kondor API Reference Guide

> **Renderer Access Point:** `window.api` (exposed via `src/preload/index.ts`)
> **Last Updated:** 2026-02-15

---

## Type Definitions

```typescript
interface Product {
  id: number
  sku: string
  name: string
  price: number        // so'm, already divided by 100
  stock: number        // stored as REAL in DB (can be fractional)
  barcode?: string
  unit?: string
  // NOTE: DB also returns min_stock, but it is not typed in preload d.ts
}

interface SalePayload {
  items: { productId: number; qty: number }[]
  paymentMethod: 'cash' | 'card' | 'mixed' | 'debt'
  discountCents?: number
  customer?: { name: string; phone?: string }
}

interface SaleSummary {
  id: number
  sale_date: string
  total_cents: number
  payment_method: string
  customer_name?: string
}

interface SaleItemRow {
  product_name: string
  barcode?: string
  unit?: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
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
```

---

## Quick Method Matrix

| Method | IPC Channel | Returns | Notes |
|--------|-------------|---------|-------|
| `getProducts()` | `get-products` | `Promise<Product[]>` | Ensures missing barcodes are generated; returns active products sorted by name. |
| `deleteProduct(productId, force?)` | `delete-product` | `Promise<DeleteProductResult>` | Soft delete with confirmation when history exists. |
| `addProduct(sku, name, price, unit?, qty?, barcode?)` | `add-product` | `Promise<AddProductResult>` | Auto-generates barcode if missing; may overwrite empty SKU. |
| `updateProduct(productId, payload)` | `update-product` | `Promise<boolean>` | Updates SKU/name/price/unit/barcode; auto-generates barcode when blank. |
| `findProduct(code)` | `find-product` | `Promise<Product | null>` | **Barcode-only** lookup (no SKU fallback). |
| `setStock(productId, qty)` | `set-stock` | `Promise<boolean>` | Logs an `adjustment` in `stock_movements`. |
| `createSale(payload)` | `create-sale` | `Promise<{ saleId: number; total_cents: number }>` | Full transactional checkout. |
| `getSales()` | `get-sales` | `Promise<SaleSummary[]>` | Latest 50 sales (Tashkent time ordering). |
| `getSaleItems(saleId)` | `get-sale-items` | `Promise<SaleItemRow[]>` | Includes `barcode` + `unit` when available. |
| `payDebt(customerId, amountCents)` | `pay-debt` | `Promise<boolean>` | Records payment and updates debts. |
| `exportSalesExcel(payload)` | `export-sales-excel` | `Promise<ExportSalesExcelResult>` | Opens save dialog and writes `.xlsx`. |
| `printBarcode(sku, name)` | `trigger-print` | `void` | Legacy, no job ledger. |
| `printReceipt(storeName, items, total)` | `trigger-receipt` | `void` | Legacy, no job ledger. |
| `printBarcodeByProduct(productId, copies?, printerName?)` | `print-barcode-product` | `Promise<boolean>` | Preferred barcode path, writes `print_jobs`. |
| `printReceiptBySale(saleId, printerName?)` | `print-receipt-sale` | `Promise<{ success: boolean; error?: string }>` | Preferred receipt path. |

---

## Inventory APIs

### `window.api.getProducts()`
- **IPC**: `ipcMain.handle('get-products')`
- **Description**: Returns all active products ordered by `name`. Runs an auto-fix step that generates missing barcodes for any product with an empty barcode field.
- **Returns**: Products with `price` already converted from cents, `stock` from `qty`.
- **Side Effects**: May update `products.barcode` and `updated_at`.

### `window.api.deleteProduct(productId, force = false)`
- **IPC**: `ipcMain.handle('delete-product')`
- **Behavior**: Soft-deletes a product by setting `active = 0`.
- **Safety checks**: Counts prior usage in `sale_items` and `stock_movements`; if found and `force` is false, returns `{ success: false, requiresConfirmation: true, saleCount, movementCount }`.
- **Returns**: `DeleteProductResult` and always echoes historical counts.

### `window.api.addProduct(sku, name, price, unit?, qty?, barcode?)`
- **IPC**: `ipcMain.handle('add-product')`
- **Parameters**:
  - `sku`: Optional; if omitted and barcode is also omitted, a random SKU is generated and later replaced by the auto-barcode.
  - `name`: Product label.
  - `price`: Decimal so'm (renderer sends so'm, main stores cents).
  - `unit` (optional): `'dona' | 'qadoq' | 'litr' | 'metr'`; anything else coerces to `'dona'`.
  - `qty` (optional): Initial stock; rounded to an integer and clamped to `>= 0`.
  - `barcode` (optional): If provided, is stored and also used as SKU when SKU is empty.
- **Behavior**:
  1. Inserts the product row.
  2. If barcode is missing, generates a unique EAN-8 barcode.
  3. If SKU was empty, updates SKU to the generated barcode.
- **Returns**: `{ success, productId?, barcode? }`.

### `window.api.updateProduct(productId, payload)`
- **IPC**: `ipcMain.handle('update-product')`
- **Validation**: Ensures `name` is non-empty and `price` is a finite non-negative number.
- **Unit Handling**: Same whitelist as `addProduct`.
- **Barcode Handling**: If barcode is blank/undefined, the handler auto-generates one after update.
- **Returns**: `true` on success; throws for invalid data.

### `window.api.findProduct(code)`
- **IPC**: `ipcMain.handle('find-product')`
- **Description**: Resolves a product by **barcode only**. Returns `null` if not found.
- **Note**: There is no SKU fallback in the main process.

### `window.api.setStock(productId, qty)`
- **IPC**: `ipcMain.handle('set-stock')`
- **Behavior**: Updates `products.qty` and records an `adjustment` row in `stock_movements` with `old_qty`, `new_qty`, and pricing context.
- **Returns**: Resolves `true` on success; throws if the product is missing.

---

## Sales & Customer APIs

### `window.api.createSale(payload)`
- **IPC**: `ipcMain.handle('create-sale')`
- **Validation**:
  - `payload.items` must be non-empty.
  - Every product must exist and have sufficient stock.
  - Debt payments require `payload.customer.name`.
- **Side Effects** (single transaction):
  1. Optional customer lookup/creation (deduplicates by phone when provided).
  2. Subtotal calculation (price * qty), discount clamped to subtotal, tax = 0.
  3. Insert into `sales` (date stored as Tashkent time string).
  4. Insert `sale_items`, decrement product stock, append `stock_movements` with `movement_type = 'sale'`.
  5. If `paymentMethod === 'debt'`: insert `debt_transactions`, increment `customers.debt_cents`, create `debts` row.
  6. Otherwise: insert into `payments`.
- **Returns**: `{ saleId, total_cents }`.
- **Important**: The `payments.method` column only accepts `cash` or `card`. Passing `paymentMethod: 'mixed'` will violate the DB constraint and throw.

### `window.api.getSales()`
- **IPC**: `ipcMain.handle('get-sales')`
- **Description**: Fetches the latest 50 sales joined with optional customer name. Ordered by `datetime(sale_date)`.

### `window.api.getSaleItems(saleId)`
- **IPC**: `ipcMain.handle('get-sale-items')`
- **Description**: Returns items with `barcode`, `unit`, `quantity`, and pricing data for the specified sale.

### `window.api.payDebt(customerId, amountCents)`
- **IPC**: `ipcMain.handle('pay-debt')`
- **Behavior**: Inserts a `payment` row in `debt_transactions`, decrements `customers.debt_cents`, and updates open `debts` rows to mark paid balances.
- **Returns**: `true` on success.

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
  2. Writes a queued row to `print_jobs` with payload metadata (includes printer name).
  3. Resolves the correct printer binary path in dev/prod; throws early if missing.
  4. Executes `testbarcode.exe` `copies` times.
  5. Updates job status to `done` or `failed`.
- **Returns**: Resolves `true` after printer loop completes; rejects with an error message if the binary fails.

### `window.api.printBarcode(sku, name)` *(legacy)*
- **IPC**: `ipcMain.on('trigger-print')`
- **Notes**: Fire-and-forget helper that bypasses the print queue. Avoid in new UI.

### `window.api.printReceiptBySale(saleId, printerName?)`
- **IPC**: `ipcMain.handle('print-receipt-sale')`
- **Steps**:
  1. Loads sale header (`total_cents`).
  2. Loads `sale_items` and formats `name|unit_price` string (unit price in so'm).
  3. Inserts a queued `print_jobs` row with serialized payload.
  4. Executes `receipt.exe` with `[printerName || 'receipt', storeName, itemsString, total]`.
  5. Updates the job status to `done` or `failed`.
- **Returns**: `{ success: true }` or `{ success: false, error }`.
- **Note**: `storeName` is currently hardcoded to `"Do'kon"` in the IPC handler.

### `window.api.printReceipt(storeName, items, total)` *(legacy)*
- **IPC**: `ipcMain.on('trigger-receipt')`
- **Notes**: Does not interact with `print_jobs` or sale data. Prefer `printReceiptBySale`.

---

## Error Handling

- All `ipcRenderer.invoke` calls propagate thrown errors as rejected Promises. Wrap calls in `try/catch` and display human-friendly strings.
- `addProduct` returns `{ success: false }` on DB errors (no throw). `updateProduct`, `setStock`, and `createSale` throw on validation/DB errors.
- Printer APIs return structured responses only for the job-based methods. Legacy `printBarcode` and `printReceipt` have no completion signal beyond main-process logs.

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
  const res = await window.api.addProduct('', name.trim(), parseFloat(price), unit, qty, barcode || undefined)
  if (!res.success) {
    setError('Mahsulot qo\'shilmadi')
    return
  }
  await reload()
}

// Update product
await window.api.updateProduct(productId, {
  name: editName.trim(),
  price: parseFloat(editPrice),
  unit: editUnit,
  barcode: editBarcode || undefined
})

// Checkout flow with error surfacing
try {
  const result = await window.api.createSale({
    items: cart.map((line) => ({ productId: line.product.id, qty: line.qty })),
    paymentMethod,
    discountCents: Math.round(discount * 100),
    customer: paymentMethod === 'debt' ? { name: custName, phone: custPhone || undefined } : undefined
  })
  setNotice(`Sotuv #${result.saleId} yakunlandi`)
} catch (err: any) {
  setError(err.message)
}
```

---

## IPC Channel Locations

All handlers live in `src/main/ipc/index.ts`. Search for the channel string to inspect precise SQL.

| Channel | Purpose |
|---------|---------|
| `get-products` | Inventory listing + barcode auto-fill |
| `add-product` | Insert inventory (auto barcode/SKU) |
| `update-product` | Update inventory fields |
| `delete-product` | Soft delete with confirmation counts |
| `find-product` | Barcode lookup |
| `set-stock` | Manual quantity override |
| `create-sale` | Checkout transaction |
| `get-sales` | Sales summary |
| `get-sale-items` | Sale line items |
| `pay-debt` | Record debt payment |
| `export-sales-excel` | Excel export dialog + write |
| `trigger-print` | Legacy barcode |
| `trigger-receipt` | Legacy receipt |
| `print-barcode-product` | Job-backed barcode |
| `print-receipt-sale` | Job-backed receipt |

---

This guide captures the full renderer-facing API surface as of 2026-02-15.
