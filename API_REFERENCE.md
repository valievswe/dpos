# Do'kondor API Reference Guide

> **Quick Reference for AI Assistants & Developers**

---

## Window API (Renderer Process)

All APIs are accessed via `window.api` in the renderer process.

### Type Definitions

```typescript
interface Product {
  id: number
  sku: string
  name: string
  price: number
  stock: number
}

interface WindowAPI {
  // Printer APIs
  printBarcode: (sku: string, name: string) => void
  printReceipt: (storeName: string, items: Product[], total: string) => void
  
  // Database APIs
  getProducts: () => Promise<Product[]>
  addProduct: (sku: string, name: string, price: number) => Promise<boolean>
}
```

---

## API Methods

### 1. `window.api.getProducts()`

**Purpose**: Fetch all products from the database

**Parameters**: None

**Returns**: `Promise<Product[]>`

**Example**:
```typescript
const products = await window.api.getProducts()
console.log(products)
// [
//   { id: 1, sku: "ABC123", name: "Product 1", price: 9.99, stock: 10 },
//   { id: 2, sku: "XYZ789", name: "Product 2", price: 19.99, stock: 5 }
// ]
```

**IPC Channel**: `get-products`

**Error Handling**: Returns empty array on error (currently)

---

### 2. `window.api.addProduct(sku, name, price)`

**Purpose**: Add a new product to the database

**Parameters**:
- `sku` (string) - Unique stock keeping unit
- `name` (string) - Product name
- `price` (number) - Product price

**Returns**: `Promise<boolean>` - `true` if successful, `false` if failed

**Example**:
```typescript
const success = await window.api.addProduct("ABC123", "New Product", 29.99)
if (success) {
  console.log("Product added successfully")
} else {
  console.error("Failed to add product")
}
```

**IPC Channel**: `add-product`

**Error Handling**: 
- Returns `false` on duplicate SKU
- Returns `false` on database errors
- Logs errors to console

**Notes**:
- SKU must be unique (UNIQUE constraint)
- Stock defaults to 0
- No validation on price (can be negative)

---

### 3. `window.api.printBarcode(sku, name)`

**Purpose**: Print a barcode label for a product

**Parameters**:
- `sku` (string) - Product SKU to encode in barcode
- `name` (string) - Product name to print on label

**Returns**: `void` (fire-and-forget)

**Example**:
```typescript
window.api.printBarcode("ABC123", "Product Name")
// No return value, check console for success/error
```

**IPC Channel**: `trigger-print`

**Backend**: Executes `testbarcode.exe` with arguments:
```
testbarcode.exe "label" "ABC123" "Product Name"
```

**Error Handling**: 
- Errors logged to main process console
- No feedback to renderer (improvement needed)

---

### 4. `window.api.printReceipt(storeName, items, total)`

**Purpose**: Print a customer receipt

**Parameters**:
- `storeName` (string) - Name of the store
- `items` (Product[]) - Array of products purchased
- `total` (string) - Total amount (formatted string, e.g., "29.99")

**Returns**: `void` (fire-and-forget)

**Example**:
```typescript
const items = [
  { id: 1, sku: "ABC123", name: "Apple", price: 1.50, stock: 10 },
  { id: 2, sku: "XYZ789", name: "Banana", price: 0.75, stock: 20 }
]

window.api.printReceipt("My Store", items, "2.25")
// No return value, check console for success/error
```

**IPC Channel**: `trigger-receipt`

**Backend**: Executes `receipt.exe` with arguments:
```
receipt.exe "receipt" "My Store" "Apple|1.50;Banana|0.75" "2.25"
```

**Item Format**: Semicolon-separated `name|price` pairs

**Error Handling**: 
- Errors logged to main process console
- No feedback to renderer (improvement needed)

---

## IPC Channels Reference

### Main → Renderer (Handle/Invoke)

| Channel | Handler Location | Parameters | Returns |
|---------|------------------|------------|---------|
| `get-products` | `main/ipc/index.ts:10` | none | `Product[]` |
| `add-product` | `main/ipc/index.ts:15` | `sku, name, price` | `boolean` |

### Renderer → Main (Send/On)

| Channel | Handler Location | Parameters | Returns |
|---------|------------------|------------|---------|
| `trigger-print` | `main/ipc/index.ts:28` | `sku, name` | void |
| `trigger-receipt` | `main/ipc/index.ts:32` | `storeName, items, total` | void |

---

## Database Operations

### Direct Database Access (Main Process Only)

```typescript
import { getDB } from './db'

const db = getDB()

// SELECT
const products = db.prepare('SELECT * FROM products').all()

// INSERT
const info = db.prepare('INSERT INTO products (sku, name, price) VALUES (?, ?, ?)').run(sku, name, price)

// UPDATE
db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, productId)

// DELETE
db.prepare('DELETE FROM products WHERE id = ?').run(productId)
```

### Schema

```sql
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE,
  name TEXT,
  price REAL,
  stock INTEGER DEFAULT 0
);
```

---

## Common Code Patterns

### 1. Fetching and Displaying Products

```typescript
import React, { useEffect, useState } from 'react'

function ProductList() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProducts() {
      try {
        const data = await window.api.getProducts()
        setProducts(data)
      } catch (error) {
        console.error('Failed to fetch products:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchProducts()
  }, [])

  if (loading) return <div>Loading...</div>

  return (
    <ul>
      {products.map(p => (
        <li key={p.id}>{p.name} - ${p.price}</li>
      ))}
    </ul>
  )
}
```

### 2. Adding a Product with Form

```typescript
import React, { useState } from 'react'

function AddProductForm() {
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const success = await window.api.addProduct(sku, name, parseFloat(price))
    
    if (success) {
      alert('Product added successfully!')
      setSku('')
      setName('')
      setPrice('')
    } else {
      alert('Failed to add product. SKU might already exist.')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input 
        value={sku} 
        onChange={e => setSku(e.target.value)} 
        placeholder="SKU" 
        required 
      />
      <input 
        value={name} 
        onChange={e => setName(e.target.value)} 
        placeholder="Name" 
        required 
      />
      <input 
        type="number" 
        step="0.01"
        value={price} 
        onChange={e => setPrice(e.target.value)} 
        placeholder="Price" 
        required 
      />
      <button type="submit">Add Product</button>
    </form>
  )
}
```

### 3. Printing Barcode for Product

```typescript
function ProductCard({ product }: { product: Product }) {
  const handlePrint = () => {
    window.api.printBarcode(product.sku, product.name)
    // Note: No feedback, consider adding a toast notification
  }

  return (
    <div>
      <h3>{product.name}</h3>
      <p>SKU: {product.sku}</p>
      <p>Price: ${product.price}</p>
      <button onClick={handlePrint}>Print Barcode</button>
    </div>
  )
}
```

### 4. Printing Receipt for Cart

```typescript
function Checkout({ cartItems }: { cartItems: Product[] }) {
  const total = cartItems.reduce((sum, item) => sum + item.price, 0)

  const handlePrintReceipt = () => {
    window.api.printReceipt(
      "My Store",
      cartItems,
      total.toFixed(2)
    )
    // Note: No feedback, consider adding a toast notification
  }

  return (
    <div>
      <h2>Cart</h2>
      <ul>
        {cartItems.map(item => (
          <li key={item.id}>{item.name} - ${item.price}</li>
        ))}
      </ul>
      <p>Total: ${total.toFixed(2)}</p>
      <button onClick={handlePrintReceipt}>Print Receipt</button>
    </div>
  )
}
```

---

## Adding New IPC Channels

### Step 1: Register Handler (Main Process)

**File**: `src/main/ipc/index.ts`

```typescript
export function registerIpcHandlers(): void {
  const db = getDB()

  // Add your new handler
  ipcMain.handle('your-channel-name', async (_event, arg1, arg2) => {
    // Your logic here
    return result
  })
}
```

### Step 2: Expose API (Preload)

**File**: `src/preload/index.ts`

```typescript
const api = {
  // Existing methods...
  
  yourNewMethod: (arg1: string, arg2: number): Promise<YourType> => {
    return ipcRenderer.invoke('your-channel-name', arg1, arg2)
  }
}
```

### Step 3: Add Type Definitions

**File**: `src/preload/index.d.ts`

```typescript
declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // Existing methods...
      yourNewMethod: (arg1: string, arg2: number) => Promise<YourType>
    }
  }
}
```

### Step 4: Use in Renderer

```typescript
const result = await window.api.yourNewMethod("test", 123)
```

---

## Error Handling Best Practices

### Current State
- Errors logged to console only
- No user-facing error messages
- No retry logic

### Recommended Improvements

```typescript
// 1. Add error returns to IPC handlers
ipcMain.handle('add-product', async (_event, sku, name, price) => {
  try {
    const stmt = db.prepare('INSERT INTO products (sku, name, price) VALUES (?, ?, ?)')
    const info = stmt.run(sku, name, price)
    return { success: true, id: info.lastInsertRowid }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 2. Handle errors in renderer
const result = await window.api.addProduct(sku, name, price)
if (result.success) {
  showSuccessToast("Product added!")
} else {
  showErrorToast(`Failed: ${result.error}`)
}

// 3. Add loading states
const [loading, setLoading] = useState(false)
const handleAdd = async () => {
  setLoading(true)
  try {
    await window.api.addProduct(...)
  } finally {
    setLoading(false)
  }
}
```

---

## TypeScript Tips

### Accessing Window API

```typescript
// ✅ Correct - TypeScript knows about window.api
const products = await window.api.getProducts()

// ❌ Wrong - Will cause TypeScript error
const products = await (window as any).api.getProducts()
```

### Type Imports

```typescript
// Import Product type from preload definitions
import type { Product } from '@electron-toolkit/preload'

// Or define locally if needed
interface Product {
  id: number
  sku: string
  name: string
  price: number
  stock: number
}
```

---

## Debugging

### Main Process Logs

```typescript
// In main process
console.log('Database initialized')
console.log('IPC handlers registered')
```

**View**: Electron main process console (terminal where `npm run dev` runs)

### Renderer Process Logs

```typescript
// In renderer process
console.log('Products:', await window.api.getProducts())
```

**View**: DevTools console (F12 in Electron window)

### Database Inspection

```typescript
// Add to main/index.ts for debugging
import { getDB } from './db'

app.whenReady().then(() => {
  const db = getDB()
  console.log('All products:', db.prepare('SELECT * FROM products').all())
})
```

---

## Performance Considerations

### Database Queries

```typescript
// ❌ Bad - N+1 queries
for (const product of products) {
  const details = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id)
}

// ✅ Good - Single query
const products = db.prepare('SELECT * FROM products').all()
```

### React Rendering

```typescript
// ❌ Bad - Fetches on every render
function ProductList() {
  const products = await window.api.getProducts() // Wrong!
}

// ✅ Good - Fetches once on mount
function ProductList() {
  const [products, setProducts] = useState([])
  useEffect(() => {
    window.api.getProducts().then(setProducts)
  }, [])
}
```

---

## Security Notes

1. **Sandbox Disabled**: `sandbox: false` in BrowserWindow config
   - Required for Node.js integration
   - Reduces security isolation

2. **Context Isolation**: Enabled via `contextBridge`
   - Prevents direct Node.js access from renderer
   - Only exposed APIs are available

3. **CSP**: Content Security Policy configured in `index.html`
   - Restricts script sources
   - Prevents inline scripts (except unsafe-inline for styles)

4. **External Executables**: C++ binaries executed with user data
   - Potential command injection risk
   - Validate inputs before passing to `execFile()`

---

## Quick Command Reference

```bash
# Development
npm run dev                    # Start dev server

# Database location (dev)
%APPDATA%/owner/pos_system.db  # Windows
~/Library/Application Support/owner/pos_system.db  # macOS

# View database
sqlite3 %APPDATA%/owner/pos_system.db
> SELECT * FROM products;

# Clear database
rm %APPDATA%/owner/pos_system.db  # Then restart app
```

---

## Summary

This API provides:
- ✅ Product database CRUD operations
- ✅ Barcode label printing
- ✅ Receipt printing
- ✅ Type-safe TypeScript interfaces
- ⚠️ Limited error handling
- ⚠️ No update/delete operations (yet)
- ⚠️ No pagination for large datasets

**For AI Assistants**: Use this reference when implementing features. All renderer code should use `window.api` methods. All main process code should use `getDB()` for database access.
