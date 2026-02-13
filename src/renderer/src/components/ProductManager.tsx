import React, { useEffect, useState } from 'react'

type Product = {
  id: number
  sku: string
  name: string
  price: number
  stock: number
  barcode?: string
  unit?: string
}

export function ProductManager(): React.ReactElement {
  const [products, setProducts] = useState<Product[]>([])
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stockEdit, setStockEdit] = useState<Record<number, string>>({})

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await window.api.getProducts()
      setProducts(rows)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const ok = await window.api.addProduct(sku.trim(), name.trim(), parseFloat(price))
      if (!ok) throw new Error("Qo'shilmadi")
      setSku('')
      setName('')
      setPrice('')
      load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const printBarcode = async (id: number) => {
    try {
      await window.api.printBarcodeByProduct(id)
      load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const updateStock = async (id: number) => {
    const val = stockEdit[id]
    if (val === undefined) return
    const qty = Number(val)
    if (Number.isNaN(qty)) return
    try {
      await window.api.setStock(id, qty)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div style={{ padding: '12px', border: '1px solid #ddd', marginTop: '12px' }}>
      <h3>Mahsulotlar</h3>
      <form onSubmit={submit} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          placeholder="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          required
          style={{ flex: 1 }}
        />
        <input
          placeholder="Nomi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ flex: 2 }}
        />
        <input
          type="number"
          step="0.01"
          placeholder="Narx (so'm)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          style={{ width: '140px' }}
        />
        <button type="submit">Qo'shish</button>
      </form>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {loading ? (
        <div>Yuklanmoqda...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th>SKU</th>
              <th>Nomi</th>
              <th>Narx</th>
              <th>Qoldiq</th>
              <th>Yangilash</th>
              <th>Barkod</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td>{p.sku}</td>
                <td>{p.name}</td>
                <td>{p.price.toLocaleString('uz-UZ')} so'm</td>
                <td>{p.stock}</td>
                <td>
                  <input
                    type="number"
                    style={{ width: '80px' }}
                    value={stockEdit[p.id] ?? ''}
                    placeholder="qty"
                    onChange={(e) =>
                      setStockEdit((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                  />
                  <button onClick={() => updateStock(p.id)}>Saqlash</button>
                </td>
                <td>{p.barcode ?? '-'}</td>
                <td>
                  <button onClick={() => printBarcode(p.id)}>Barkod chiqarish</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
