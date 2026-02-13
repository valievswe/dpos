import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Product, useProducts } from '../hooks/useProducts'

type CartLine = {
  product: Product
  qty: number
}

export function SalesPage(): React.ReactElement {
  const { products, reload, error: loadError } = useProducts()
  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [payment, setPayment] = useState<'cash' | 'card' | 'debt'>('cash')
  const [discount, setDiscount] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
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
      inputRef.current?.focus()
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
    if (!q) return products.slice(0, 15)
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20)
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
      const successMsg = `Sotuv #${res.saleId} yakunlandi. Jami ${(res.total_cents / 100).toLocaleString('uz-UZ')} so'm`
      if (window.confirm('Chekni chop etamizmi?')) {
        const printRes = await window.api.printReceiptBySale(res.saleId)
        if (!printRes.success) {
          setError(printRes.error ?? 'Chek chiqarilmadi')
        }
      }
      cancelSale(true)
      setMessage(successMsg)
    } catch (e: any) {
      setError(`Xato: ${e?.message ?? 'noma'}`)
    }
  }

  const cancelSale = (keepMessage = false) => {
    setCart([])
    setDiscount(0)
    setCustomerName('')
    setCustomerPhone('')
    setPayment('cash')
    if (!keepMessage) setMessage(null)
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 0.95fr',
        gap: '20px',
        height: '100%'
      }}
    >
      <div
        style={{
          background: 'var(--surface-2)',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          padding: '20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}
      >
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <input
            placeholder="SKU / barkod / nom"
            value={query}
            ref={inputRef}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addByQuery()
              }
            }}
            style={{
              flex: 1,
              padding: '14px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb',
              fontSize: '1rem'
            }}
          />
          <button
            type="button"
            style={{
              padding: '14px 22px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
              color: '#0b1224',
              border: 'none',
              borderRadius: '6px',
              boxShadow: 'var(--shadow-sm)',
              fontWeight: 700
            }}
            onClick={addByQuery}
          >
            Savatga
          </button>
          <button
            type="button"
            style={{
              padding: '14px 16px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb',
              borderRadius: '6px',
              fontWeight: 600
            }}
            onClick={reload}
          >
            Yangilash
          </button>
        </div>
        <div style={{ color: 'var(--muted)', marginBottom: 12, fontSize: '0.95rem' }}>
          Skaner Enter yuboradi — bir necha marta skan qilinsa miqdor oshadi. Qidiruv orqali qo‘lda ham qo‘shing.
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '6px',
            overflow: 'hidden',
            background: 'var(--surface-3)',
            minHeight: 0,
            flex: 1
          }}
        >
          {filtered.length > 0 ? (
            <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
              {filtered.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '16px 18px',
                    borderBottom: '1px solid var(--border-soft)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 750, fontSize: '1.02rem' }}>{p.name}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
                      {p.sku} - {p.unit ?? 'dona'} - Qoldiq: {p.stock}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      {p.price.toLocaleString('uz-UZ')} so'm
                    </span>
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'rgba(34, 211, 238, 0.12)',
                        color: '#e0f2fe',
                        cursor: 'pointer',
                        fontSize: '1.1rem',
                        fontWeight: 800
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '18px', color: 'var(--muted)' }}>Mos mahsulot topilmadi.</div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: 0
        }}
      >
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '12px',
            background: 'var(--surface-2)',
            boxShadow: 'var(--shadow-sm)',
            minHeight: 0,
            maxHeight: '50vh',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#f9fafb' }}>Savat</h3>
            <button
              type="button"
              onClick={cancelSale}
              style={{
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--muted)',
                borderRadius: '6px',
                padding: '8px 10px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Tozalash
            </button>
          </div>
          <div style={{ marginTop: '8px', maxHeight: 'calc(50vh - 70px)', overflowY: 'auto' }}>
            {cart.length === 0 ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '28px 0' }}>
                Savat bo'sh. Chap tomondan mahsulot qo'shing.
              </div>
            ) : (
              cart.map((c) => (
                <div
                  key={c.product.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border-soft)',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 750 }}>{c.product.name}</div>
                    <div style={{ fontSize: '0.86rem', color: 'var(--muted)' }}>
                      {c.product.price.toLocaleString('uz-UZ')} so'm
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => updateQty(c.product.id, c.qty - 1)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'rgba(255,255,255,0.04)',
                          color: '#f9fafb',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                      >
                        –
                      </button>
                      <div
                        style={{
                          minWidth: 44,
                          textAlign: 'center',
                          padding: '6px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          background: 'var(--surface-3)',
                          fontWeight: 700
                        }}
                      >
                        {c.qty}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQty(c.product.id, c.qty + 1)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'rgba(34,211,238,0.12)',
                          color: '#e0f2fe',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                      >
                        +
                      </button>
                    </div>
                    <strong>{(c.product.price * c.qty).toLocaleString('uz-UZ')} so'm</strong>
                    <button
                      type="button"
                      onClick={() => updateQty(c.product.id, 0)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'rgba(239,68,68,0.15)',
                        color: '#fecdd3',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '12px',
            background: 'var(--surface-2)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--muted)' }}>
            Chegirma (so'm)
            <input
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--surface-3)',
                color: '#f9fafb'
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--muted)' }}>
              To'lov turi
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value as any)}
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-3)',
                  color: '#f9fafb'
                }}
              >
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
                <option value="debt">Qarz</option>
              </select>
            </label>
            {payment === 'debt' && (
              <input
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-3)',
                  color: '#f9fafb'
                }}
                placeholder="Mijoz ismi"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            )}
          </div>
          {payment === 'debt' && (
            <input
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--surface-3)',
                color: '#f9fafb'
              }}
              placeholder="Telefon"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px',
              background: 'var(--surface-3)',
              borderRadius: '6px',
              fontWeight: 750,
              border: '1px solid var(--border)'
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
                padding: '14px',
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.04)',
                color: '#f9fafb',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={checkout}
              style={{
                flex: 1,
                padding: '14px',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
                color: '#0b1224',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              Sotish
            </button>
          </div>
          {message && <div style={{ color: 'var(--success)' }}>{message}</div>}
          {(error || loadError) && <div style={{ color: 'var(--danger)' }}>{error ?? loadError}</div>}
        </div>
      </div>
    </div>
  )
}
