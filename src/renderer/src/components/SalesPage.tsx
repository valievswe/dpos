import React, { useEffect, useMemo, useState } from 'react'

type Product = {
  id: number
  sku: string
  name: string
  price: number
  stock: number
  barcode?: string
  unit?: string
}

type CartLine = {
  product: Product
  qty: number
}

export function SalesPage(): React.ReactElement {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [payment, setPayment] = useState<'cash' | 'card' | 'debt'>('cash')
  const [discount, setDiscount] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const rows = await window.api.getProducts()
      setProducts(rows)
    } catch {
      setError("Ma'lumotlarni yuklab bo'lmadi")
    }
  }

  useEffect(() => {
    load()
  }, [])

  const addByQuery = async () => {
    setError(null)
    const code = query.trim()
    if (!code) return
    try {
      const found = await window.api.findProduct(code)
      const product =
        found ||
        products.find((p) => {
          const target = code.toLowerCase()
          return (
            p.sku.toLowerCase() === target ||
            (p.barcode ?? '').toLowerCase() === target ||
            p.name.toLowerCase() === target
          )
        })
      if (!product) {
        setError('Mahsulot topilmadi')
        return
      }
      addToCart(product)
      setQuery('')
    } catch (e: any) {
      setError(`Xato: ${e?.message ?? 'noma'}`)
    }
  }

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id)
      if (existing) {
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
    const q = query.trim().toLowerCase()
    if (!q) return products.slice(0, 10)
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? '').toLowerCase().includes(q)
      )
      .slice(0, 10)
  }, [products, query])

  const checkout = async () => {
    setMessage(null)
    setError(null)
    if (cart.length === 0) {
      setError("Savat bo'sh")
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
      setMessage(
        `Sotuv #${res.saleId} yakunlandi. Jami ${(res.total_cents / 100).toLocaleString('uz-UZ')} so'm`
      )
      cancelSale()
    } catch (e: any) {
      setError(`Xato: ${e?.message ?? 'noma'}`)
    }
  }

  const cancelSale = () => {
    setCart([])
    setDiscount(0)
    setCustomerName('')
    setCustomerPhone('')
    setPayment('cash')
    setMessage(null)
    setError(null)
  }

  return (
    <div
      style={{
        padding: '24px',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        background: '#fff'
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: '24px' }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Mahsulotlar</h3>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              placeholder="SKU / barkod / nom"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addByQuery()
                }
              }}
              style={{ flex: 1, padding: '12px' }}
            />
            <button
              type="button"
              style={{
                padding: '12px 18px',
                background: '#111827',
                color: '#fff',
                border: 'none',
                borderRadius: '8px'
              }}
              onClick={addByQuery}
            >
              Savatga
            </button>
            <button
              type="button"
              style={{
                padding: '12px 18px',
                border: '1px solid #d1d5db',
                background: '#fff',
                borderRadius: '8px'
              }}
              onClick={load}
            >
              Yangilash
            </button>
          </div>
          {filtered.length > 0 && (
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                maxHeight: '460px',
                overflowY: 'auto'
              }}
            >
              {filtered.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid #f3f4f6',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      {p.sku} - {p.unit ?? 'dona'} - Qoldiq: {p.stock}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>{p.price.toLocaleString('uz-UZ')} so'm</span>
                    <button type="button" onClick={() => addToCart(p)}>
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Savat</h3>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '12px',
              maxHeight: '380px',
              overflowY: 'auto'
            }}
          >
            {cart.length === 0 ? (
              <div style={{ color: '#6b7280', textAlign: 'center', padding: '30px 0' }}>
                Savat bo'sh. Chap tomondan mahsulot qo'shing.
              </div>
            ) : (
              cart.map((c) => (
                <div
                  key={c.product.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid #f3f4f6'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.product.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      {c.product.price.toLocaleString('uz-UZ')} so'm
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="number"
                      min={1}
                      value={c.qty}
                      onChange={(e) => updateQty(c.product.id, Number(e.target.value))}
                      style={{ width: '70px', padding: '6px' }}
                    />
                    <strong>{(c.product.price * c.qty).toLocaleString('uz-UZ')} so'm</strong>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              Chegirma (so'm)
              <input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                style={{ padding: '10px' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                To'lov turi
                <select value={payment} onChange={(e) => setPayment(e.target.value as any)} style={{ padding: '10px' }}>
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                  <option value="debt">Qarz</option>
                </select>
              </label>
              {payment === 'debt' && (
                <input
                  style={{ flex: 1, padding: '10px' }}
                  placeholder="Mijoz ismi"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              )}
            </div>
            {payment === 'debt' && (
              <input
                style={{ padding: '10px' }}
                placeholder="Telefon"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '16px',
                background: '#f3f4f6',
                borderRadius: '10px',
                fontWeight: 600
              }}
            >
              <span>Jami</span>
              <span>{(total - discount).toLocaleString('uz-UZ')} so'm</span>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={cancelSale}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  borderRadius: '8px'
                }}
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={checkout}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#111827',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px'
                }}
              >
                Sotish
              </button>
            </div>
          </div>
        </div>
      </div>

      {message && <div style={{ color: '#0f766e', marginTop: '16px' }}>{message}</div>}
      {error && <div style={{ color: '#b91c1c', marginTop: '8px' }}>{error}</div>}
    </div>
  )
}
