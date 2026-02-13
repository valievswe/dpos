import React, { useEffect, useMemo, useState } from 'react'

type Product = {
  id: number
  sku: string
  name: string
  price: number
  stock: number
  barcode?: string
}

type CartLine = {
  product: Product
  qty: number
}

export function SalesPage(): React.ReactElement {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [scanCode, setScanCode] = useState('')
  const [search, setSearch] = useState('')
  const [payment, setPayment] = useState<'cash' | 'card' | 'debt'>('cash')
  const [discount, setDiscount] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const rows = await window.api.getProducts()
    setProducts(rows)
  }

  useEffect(() => {
    load()
  }, [])

  const addByCode = async () => {
    setError(null)
    const code = scanCode.trim()
    if (!code) return
    try {
      const found = await window.api.findProduct(code)
      const product = found || products.find((p) => p.sku === code || p.barcode === code)
      if (!product) {
        setError('Mahsulot topilmadi')
        return
      }
      addToCart(product)
      setScanCode('')
    } catch (e: any) {
      setError(e.message)
    }
  }

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const exist = prev.find((c) => c.product.id === product.id)
      if (exist) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c
        )
      }
      return [...prev, { product, qty: 1 }]
    })
  }

  const updateQty = (id: number, qty: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.product.id === id ? { ...c, qty: Math.max(1, qty) } : c))
        .filter((c) => c.qty > 0)
    )
  }

  const total = useMemo(
    () => cart.reduce((sum, c) => sum + c.product.price * c.qty, 0),
    [cart]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products.slice(0, 10)
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
    ).slice(0, 10)
  }, [products, search])

  const checkout = async () => {
    setMessage(null)
    setError(null)
    if (cart.length === 0) {
      setError('Savat bo‘sh')
      return
    }
    if (payment === 'debt' && !customerName.trim()) {
      setError('Qarz uchun mijoz ismi talab qilinadi')
      return
    }
    try {
      const payload = {
        items: cart.map((c) => ({ productId: c.product.id, qty: c.qty })),
        paymentMethod: payment,
        discountCents: Math.round(discount * 100),
        customer:
          payment === 'debt'
            ? { name: customerName.trim(), phone: customerPhone.trim() || undefined }
            : undefined
      }
      const res = await window.api.createSale(payload)
      setMessage(`Sotuv #${res.saleId} yakunlandi. Jami ${(res.total_cents / 100).toLocaleString('uz-UZ')} so'm`)
      setCart([])
      setDiscount(0)
      setCustomerName('')
      setCustomerPhone('')
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div style={{ padding: '12px', border: '1px solid #ddd', marginTop: '12px' }}>
      <h3>Sotuv</h3>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
        <input
          placeholder="Barkod yoki SKU skan/kiritish"
          value={scanCode}
          autoFocus
          onChange={(e) => setScanCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addByCode()
            }
          }}
          style={{ flex: 2 }}
        />
        <button onClick={addByCode}>Qo'shish</button>
        <button onClick={load}>Yangilash</button>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <input
          placeholder="Mahsulot nomi / SKU bo'yicha qidirish"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '6px' }}
        />
        {filtered.length > 0 && (
          <div style={{ border: '1px solid #ddd', maxHeight: '220px', overflowY: 'auto' }}>
            {filtered.map((p) => (
              <div
                key={p.id}
                style={{ padding: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                onClick={() => addToCart(p)}
              >
                <span>{p.name} ({p.sku})</span>
                <span>{p.price.toLocaleString('uz-UZ')} so'm | qoldiq: {p.stock}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th>Mahsulot</th>
            <th>Narx</th>
            <th>Miqdor</th>
            <th>Jami</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((c) => (
            <tr key={c.product.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td>{c.product.name}</td>
              <td>{c.product.price.toLocaleString('uz-UZ')} so'm</td>
              <td>
                <input
                  type="number"
                  min={1}
                  value={c.qty}
                  onChange={(e) => updateQty(c.product.id, Number(e.target.value))}
                  style={{ width: '70px' }}
                />
              </td>
              <td>{(c.product.price * c.qty).toLocaleString('uz-UZ')} so'm</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '8px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <label>
          Chegirma (so'm):
          <input
            type="number"
            min={0}
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
            style={{ width: '120px', marginLeft: '6px' }}
          />
        </label>

        <label>
          To'lov:
          <select
            value={payment}
            onChange={(e) => setPayment(e.target.value as any)}
            style={{ marginLeft: '6px' }}
          >
            <option value="cash">Naqd</option>
            <option value="card">Karta</option>
            <option value="debt">Qarz</option>
          </select>
        </label>

        {payment === 'debt' && (
          <>
            <input
              placeholder="Mijoz ismi"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              placeholder="Telefon"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </>
        )}

        <div style={{ marginLeft: 'auto', fontWeight: 600 }}>
          Jami: {(total - discount).toLocaleString('uz-UZ')} so'm
        </div>
        <button onClick={checkout}>Yakunlash</button>
      </div>

      {message && <div style={{ color: 'green', marginTop: '6px' }}>{message}</div>}
      {error && <div style={{ color: 'red', marginTop: '6px' }}>{error}</div>}
    </div>
  )
}
