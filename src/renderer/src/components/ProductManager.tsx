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
  const [unit, setUnit] = useState('dona')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stockEdit, setStockEdit] = useState<Record<number, string>>({})

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await window.api.getProducts()
      setProducts(rows)
    } catch {
      setError("Ma'lumotlarni yuklab bo'lmadi")
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
      const numericPrice = Number(price)
      if (Number.isNaN(numericPrice) || numericPrice < 0) {
        setError("Narx noto'g'ri kiritildi")
        return
      }
      const ok = await window.api.addProduct(sku.trim(), name.trim(), numericPrice, unit)
      if (!ok) throw new Error("Mahsulot qo'shilmadi")
      setSku('')
      setName('')
      setPrice('')
      setUnit('dona')
      await load()
    } catch (err: any) {
      setError(`Xato: ${err?.message ?? 'noma'}`)
    }
  }

  const printBarcode = async (product: Product) => {
    setError(null)
    const copiesInput = window.prompt('Nechta yorliq chiqarilsin?', '1')
    if (!copiesInput) return
    const copies = Number(copiesInput)
    if (!Number.isInteger(copies) || copies <= 0) {
      setError("Yorliq soni noto'g'ri")
      return
    }
    const same = window.confirm("Ushbu mahsulotning barcha yorliqlari bir xil bo'ladimi?")
    if (!same) {
      setError('Yorliq chiqarish bekor qilindi')
      return
    }
    try {
      await window.api.printBarcodeByProduct(product.id, copies)
      await load()
    } catch (err: any) {
      setError(`Xato: ${err?.message ?? 'noma'}`)
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
      setError(`Xato: ${err?.message ?? 'noma'}`)
    }
  }

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff' }}>
      <h3 style={{ marginBottom: '10px' }}>Mahsulotlar</h3>
      <form
        onSubmit={submit}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: '12px',
          marginBottom: '18px',
          alignItems: 'end'
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>SKU</span>
          <input
            placeholder="Masalan: SKU001"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            style={{ padding: '10px' }}
          />
        </label>
        <label style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>Mahsulot nomi</span>
          <input
            placeholder="Nomi"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ padding: '10px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>Narx (so'm)</span>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            style={{ padding: '10px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>Birlik</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ padding: '10px' }}>
            <option value="dona">Dona (raqam)</option>
            <option value="qadoq">Qadoq</option>
            <option value="litr">Litr</option>
            <option value="metr">Metr</option>
          </select>
        </label>
        <button
          type="submit"
          style={{ padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: '8px' }}
        >
          Qo'shish
        </button>
      </form>
      {error && <div style={{ color: '#b91c1c', marginBottom: '8px' }}>{error}</div>}
      {loading ? (
        <div>Yuklanmoqda...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
              <th>SKU</th>
              <th>Nomi</th>
              <th>Narx</th>
              <th>Qoldiq</th>
              <th>Birlik</th>
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
                <td>{p.unit ?? 'dona'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      style={{ width: '80px' }}
                      value={stockEdit[p.id] ?? ''}
                      placeholder="miqdor"
                      onChange={(e) =>
                        setStockEdit((s) => ({ ...s, [p.id]: e.target.value }))
                      }
                    />
                    <button type="button" onClick={() => updateStock(p.id)}>
                      Saqlash
                    </button>
                  </div>
                </td>
                <td>{p.barcode ?? '-'}</td>
                <td>
                  <button type="button" onClick={() => printBarcode(p)}>
                    Barkod chiqarish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
