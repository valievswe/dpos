# Do'kondor API Reference Guide

> **Renderer Access Point:** `window.api` (exposed via `src/preload/index.ts`)  
> **Last Updated:** 2026-02-13

---

## Type Definitions

```typescript
interface Product {
  id: number
  sku: string
  name: string
  price: number        // in so'm, already divided by 100
  stock: number
  barcode?: string
  unit?: string
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
  quantity: number
  unit_price_cents: number
  line_total_cents: number
}
```

---

## Quick Method Matrix

| Method | IPC Channel | Returns | Notes |
|--------|-------------|---------|-------|
| `getProducts()` | `get-products` | `Promise<Product[]>` | Active products sorted by name. |
| `addProduct(sku, name, price, unit?, qty?)` | `add-product` | `Promise<boolean>` | Price decimal so'm; unit defaults to `dona`; qty defaults to 0. |
| `findProduct(code)` | `find-product` | `Promise<Product | null>` | Looks at `barcode` then `sku`. |
| `setStock(productId, qty)` | `set-stock` | `Promise<boolean>` | Logs adjustment in `stock_movements`. |
| `createSale(payload)` | `create-sale` | `Promise<{ saleId: number; total_cents: number }>` | Full transactional checkout. |
| `getSales()` | `get-sales` | `Promise<SaleSummary[]>` | Latest 50 sales. |
| `getSaleItems(saleId)` | `get-sale-items` | `Promise<SaleItemRow[]>` | Line items for a sale. |
| `payDebt(customerId, amountCents)` | `pay-debt` | `Promise<boolean>` | Records payment and updates debts. |
| `printBarcode(sku, name)` | `trigger-print` | `void` | Legacy, no job ledger. |
| `printReceipt(storeName, items, total)` | `trigger-receipt` | `void` | Legacy, no job ledger. |
| `printBarcodeByProduct(productId, copies?)` | `print-barcode-product` | `Promise<boolean>` | Preferred barcode path, writes `print_jobs`. |
| `printReceiptBySale(saleId, printerName?)` | `print-receipt-sale` | `Promise<{ success: boolean; error?: string }>` | Preferred receipt path. |

---

## Inventory APIs

### `window.api.getProducts()`
- **IPC**: `ipcMain.handle('get-products')`
- **Description**: Returns all active products ordered by `name`. Each row is processed through `mapProductRow` so `price` is already converted from cents.
- **Usage**:
  ```typescript
  const products = await window.api.getProducts()
  setProducts(products)
  ```

### `window.api.addProduct(sku, name, price, unit?, qty?)`
- **IPC**: `ipcMain.handle('add-product')`
- **Parameters**:
  - `sku`: Required unique identifier.
  - `name`: Product label.
  - `price`: Decimal so'm (renderer converts to cents internally).
  - `unit` (optional): `'dona' | 'qadoq' | 'litr' | 'metr'`; defaults to `'dona'`.
  - `qty` (optional): Initial stock integer; defaults to `0`.
- **Returns**: `true` on insert, `false` on any DB error (duplicate SKU, constraint failure, etc.).
- **Notes**: Initial quantity is written to `products.qty` and will be reflected in `stock_movements` only on later adjustments/sales.

### `window.api.findProduct(code)`
- **IPC**: `ipcMain.handle('find-product')`
- **Description**: Attempts to resolve a product via barcode or SKU, returning `null` when not found.
- **Typical Flow**: `SalesPage` fallbacks when barcode scan fails to match already-fetched cache.

### `window.api.setStock(productId, qty)`
- **IPC**: `ipcMain.handle('set-stock')`
- **Behavior**: Runs inside a database transaction. Updates the product quantity and records an `adjustment` row in `stock_movements` capturing delta, previous qty, and pricing context.
- **Returns**: Resolves `true` when transaction succeeds; throws on validation errors (e.g., missing product).

### `window.api.printBarcodeByProduct(productId, copies = 1, printerName?)`
- **IPC**: `ipcMain.handle('print-barcode-product')`
- **Description**: Preferred workflow for barcode labels.
  1. Ensures the product has a unique EAN-8 barcode (auto-generates if missing).
  2. Writes a queued row to `print_jobs` with payload metadata (includes printer name).
  3. Resolves the correct printer binary path in dev/prod; throws early if missing.
  4. Executes `testbarcode.exe` `copies` times.
  5. Updates job status to `done` or `failed`.
- **Returns**: Resolves `true` after printer loop completes; rejects with an error message if the binary fails. Renderer should surface the rejection.

### `window.api.printBarcode(sku, name)` *(legacy)*
- **IPC**: `ipcMain.on('trigger-print')`
- **Notes**: Fire-and-forget helper that bypasses the print queue. Avoid using in new UI; prefer `printBarcodeByProduct` for observability.

---

## Sales & Customer APIs

### `window.api.createSale(payload)`
- **IPC**: `ipcMain.handle('create-sale')`
- **Validation**:
  - `payload.items` must be non-empty.
  - Every product must exist and have sufficient stock.
  - Debt payments require `payload.customer.name`.
- **Side Effects** (all within a single transaction):
  1. Optional customer lookup/creation (by phone if provided).
  2. Subtotal calculation (`price_cents * qty`) per line, discount clamped to subtotal, tax currently zero.
  3. Insert into `sales` and capture new `saleId`.
  4. Insert `sale_items`, decrement product stock, append `stock_movements` with `movement_type = 'sale'`.
  5. Either insert payment rows (`payments`) or, for debt sales, log `debt_transactions`, bump `customers.debt_cents`, and create a `debts` snapshot.
- **Returns**: `{ saleId, total_cents }` for UI messaging and receipt printing.
- **Errors**: Throws with Uzbek messages (e.g., `Stok yetarli emas`). Renderer should present them.

### `window.api.getSales()`
- **IPC**: `ipcMain.handle('get-sales')`
- **Description**: Fetches the latest 50 sales joined with optional customer name. Used by `SalesHistory` to populate the summary table.

### `window.api.getSaleItems(saleId)`
- **IPC**: `ipcMain.handle('get-sale-items')`
- **Description**: Returns detail rows with cached product name, quantity, and pricing data for the specified sale.
- **Usage**: Typically called right after selecting a sale row to display its line items.

### `window.api.printReceiptBySale(saleId, printerName?)`
- **IPC**: `ipcMain.handle('print-receipt-sale')`
- **Steps**:
  1. Loads sale header (`total_cents`).
  2. Loads `sale_items` to build the legacy `name|price` payload (price in cents, rounded to string).
  3. Inserts a queued `print_jobs` row with serialized payload.
  4. Executes `receipt.exe` with `[printerName || 'receipt', storeName, itemsString, total]`.
  5. Updates the job status to `done` or `failed` and returns `{ success: true }` or `{ success: false, error }`.
- **Renderer Handling**: `SalesHistory` stops row click propagation so it can call this method directly. Display any returned error to the operator.

### `window.api.printReceipt(storeName, items, total)` *(legacy)*
- **IPC**: `ipcMain.on('trigger-receipt')`
- **Notes**: Does not interact with `print_jobs` or sale data. Prefer `printReceiptBySale` for auditable reprints.

### `window.api.payDebt(customerId, amountCents)`
- **IPC**: `ipcMain.handle('pay-debt')`
- **Behavior**: Transactionally inserts a `debt_transactions` payment row, decrements `customers.debt_cents`, and walks active `debts` to update `paid_cents` / `is_paid` status.
- **Returns**: `true` on success.
- **Intended Use**: A future UI panel for collections; not yet surfaced in the current renderer, but available to extensions.

---

## Sales Retrieval APIs

These endpoints power dashboards or reporting components.

- **`getSales()`**: Use for paginated tables. Remember totals are cents; divide by 100 before showing.
- **`getSaleItems(saleId)`**: Combine with `Intl.NumberFormat('uz-UZ')` for localized rendering, as done in `SalesHistory`.

---

## Error Handling

- All `ipcRenderer.invoke` calls propagate thrown errors as rejected Promises. Wrap calls in `try/catch` and display human-friendly strings.
- Insert/update handlers (`add-product`, `set-stock`, `create-sale`, `pay-debt`) already catch synchronous DB errors internally. Some return booleans (`addProduct`) while others throw (e.g., `setStock`, `createSale`). Make sure the UI distinguishes between `false` and thrown exceptions.
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

Legacy helpers remain for compatibility but will likely be removed in a future major release. Any new feature should rely on the preferred methods.

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
  const ok = await window.api.addProduct(sku.trim(), name.trim(), parseFloat(price))
  if (!ok) {
    setError('Mahsulot qo\'shilmadi')
    return
  }
  await reload()
}

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

| Channel | Approx. Line | Purpose |
|---------|--------------|---------|
| `get-products` | products section | Inventory listing |
| `add-product` | products section | Insert inventory |
| `find-product` | products section | Lookup from barcode/SKU |
| `set-stock` | inventory adjustments | Manual quantity override |
| `create-sale` | sales transaction block | Checkout |
| `get-sales` | sales ledger block | Summary grid |
| `get-sale-items` | sales ledger block | Drill-down |
| `pay-debt` | debt block | Record payment |
| `trigger-print` | printer block | Legacy barcode |
| `trigger-receipt` | printer block | Legacy receipt |
| `print-barcode-product` | printer block | Job-backed barcode |
| `print-receipt-sale` | printer block | Job-backed receipt |

Use `rg 'ipcMain' src/main/ipc/index.ts` for a quick overview when adding new capabilities.

---

This guide captures the full renderer-facing API surface as of 2026-02-13 so assistants can confidently build features on top of version 2.0.0.
