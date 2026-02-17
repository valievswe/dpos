import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Product, useProducts } from '../hooks/useProducts'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

type CartLine = {
  product: Product
  qty: number
}

export function SalesPage(): React.ReactElement {
  const { products, reload, error: loadError } = useProducts()
  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [payment, setPayment] = useState<'cash' | 'card' | 'debt'>('cash')
  const [discount, setDiscount] = useState('0')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [printPromptOpen, setPrintPromptOpen] = useState(false)
  const [pendingPrintSaleId, setPendingPrintSaleId] = useState<number | null>(null)
  const [printing, setPrinting] = useState(false)

  const isMobile = viewportWidth < 1024

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Barcode scanners usually send Enter; auto-add when newline appears.
  useEffect(() => {
    if (query.includes('\n') || query.includes('\r')) {
      addByQuery()
    }
  }, [query])

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

  const addByQuery = async () => {
    setError(null)
    const code = query.trim()
    if (!code) return

    try {
      const found = await window.api.findProduct(code)
      const target = code.toLowerCase()
      const product =
        found ||
        products.find((p) => {
          return (p.barcode ?? '').toLowerCase() === target
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

  const updateQty = (
    id: number,
    qty: number,
    opts: { allowZero?: boolean; remove?: boolean } = {}
  ) => {
    const allowZero = opts.allowZero ?? false
    const remove = opts.remove ?? false

    setCart((prev) =>
      prev
        .map((c) => {
          if (c.product.id !== id) return c
          const safeQty = Number.isFinite(qty) ? qty : 0
          if (remove) return { ...c, qty: 0 }
          const nextQty = allowZero ? Math.max(0, safeQty) : Math.max(1, safeQty)
          return { ...c, qty: nextQty }
        })
        .filter((c) => (remove ? c.qty > 0 : true))
    )
  }

  const total = useMemo(
    () => cart.reduce((sum, c) => sum + c.product.price * c.qty, 0),
    [cart]
  )

  const discountValue = useMemo(() => {
    const num = parseFloat(discount)
    return Number.isFinite(num) && num > 0 ? num : 0
  }, [discount])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products.slice(0, 15)

    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
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
        discountCents: Math.round(discountValue * 100),
        customer:
          payment === 'debt'
            ? { name: customerName.trim(), phone: customerPhone.trim() || undefined }
            : undefined
      }

      const res = await window.api.createSale(payload)
      const successMsg = `Sotuv #${res.saleId} yakunlandi. Jami ${(res.total_cents / 100).toLocaleString('uz-UZ')} so'm`

      cancelSale(true)
      setMessage(successMsg)
      setPendingPrintSaleId(res.saleId)
      setPrintPromptOpen(true)
    } catch (e: any) {
      setError(`Xato: ${e?.message ?? 'noma'}`)
    }
  }

  const cancelSale = (keepMessage = false) => {
    setCart([])
    setDiscount('0')
    setCustomerName('')
    setCustomerPhone('')
    setPayment('cash')
    if (!keepMessage) setMessage(null)
    setError(null)
    inputRef.current?.focus()
  }

  const closePrintPrompt = () => {
    setPrintPromptOpen(false)
    setPendingPrintSaleId(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const confirmPrint = async () => {
    if (!pendingPrintSaleId || printing) return
    setPrinting(true)
    try {
      const printRes = await window.api.printReceiptBySale(pendingPrintSaleId)
      if (!printRes.success) {
        setError(printRes.error ?? 'Chek chiqarilmadi')
      }
    } catch (e: any) {
      setError(e?.message ?? 'Chek chiqarilmadi')
    } finally {
      setPrinting(false)
      closePrintPrompt()
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1.08fr 0.92fr',
        gridTemplateRows: isMobile ? 'auto auto auto' : 'minmax(0, 1fr) auto',
        gap: isMobile ? '12px' : '16px',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          background: 'var(--surface-2)',
          borderRadius: '5px',
          border: '1px solid var(--border)',
          padding: '20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: isMobile ? 'auto' : '100%',
          overflowX: 'visible',
          overflowY: isMobile ? 'visible' : 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '10px',
            flexWrap: 'wrap',
            rowGap: '8px'
          }}
        >
          <input
            placeholder="Barkod / nom"
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
              flex: '1 1 260px',
              minWidth: 0,
              padding: '14px 14px',
              borderRadius: '5px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb',
              fontSize: '1rem'
            }}
          />
          <button
            type="button"
            style={{
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
              padding: '14px 22px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
              color: '#0b1224',
              border: 'none',
              borderRadius: '5px',
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
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
              padding: '14px 16px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb',
              borderRadius: '5px',
              fontWeight: 600
            }}
            onClick={reload}
          >
            Yangilash
          </button>
        </div>

        <div style={{ color: 'var(--muted)', marginBottom: 12, fontSize: '0.95rem' }}>
          Skaner Enter yuboradi - bir necha marta skan qilinsa miqdor oshadi. Qidiruv orqali qo'lda ham qo'shing.
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '5px',
            overflow: 'hidden',
            background: 'var(--surface-3)',
            minHeight: 0,
            flex: isMobile ? '0 0 auto' : 1,
            maxHeight: isMobile ? '60vh' : undefined
          }}
        >
          {filtered.length > 0 ? (
            <div style={{ height: '100%', minHeight: 0, overflowY: 'auto' }}>
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
                    <div style={{ fontWeight: 800, fontSize: '1.14rem' }}>{p.name}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
                      {p.barcode ?? '-'} - {p.unit ?? 'dona'} - Qoldiq: {p.stock}
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
                        width: 52,
                        height: 52,
                        borderRadius: '5px',
                        border: '1px solid var(--border)',
                        background: 'rgba(34, 211, 238, 0.12)',
                        color: '#e0f2fe',
                        cursor: 'pointer',
                        fontSize: '1.35rem',
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
          border: '1px solid var(--border)',
          borderRadius: '5px',
          padding: '12px',
          background: 'var(--surface-2)',
          boxShadow: 'var(--shadow-sm)',
          minHeight: 0,
          height: isMobile ? 'auto' : '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#f9fafb', fontSize: '1.1rem' }}>Savat</h3>
          <button
            type="button"
            onClick={() => cancelSale()}
            style={{
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--muted)',
              borderRadius: '5px',
              padding: '8px 10px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Tozalash
          </button>
        </div>

        <div
          style={{
            marginTop: '8px',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            maxHeight: isMobile ? '48vh' : undefined
          }}
        >
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
                  <div style={{ fontWeight: 800, fontSize: '1.5rem' }}>{c.product.name}</div>
                  <div style={{ fontSize: '1rem', color: 'var(--muted)', fontWeight: 600 }}>
                    {c.product.price.toLocaleString('uz-UZ')} so'm
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => updateQty(c.product.id, c.qty - 1, { allowZero: false })}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '5px',
                        border: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#f9fafb',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: '1.5rem'
                      }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={c.qty === 0 ? '' : c.qty}
                      onChange={(e) =>
                        updateQty(
                          c.product.id,
                          e.target.value === '' ? 0 : Number(e.target.value),
                          { allowZero: true }
                        )
                      }
                      onBlur={(e) =>
                        updateQty(
                          c.product.id,
                          e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                          { allowZero: true }
                        )
                      }
                      style={{
                        width: 110,
                        textAlign: 'center',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '5px',
                        background: 'var(--surface-3)',
                        fontWeight: 800,
                        fontSize: '1.5rem',
                        color: '#f9fafb'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => updateQty(c.product.id, c.qty + 1, { allowZero: false })}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '5px',
                        border: '1px solid var(--border)',
                        background: 'rgba(34,211,238,0.12)',
                        color: '#e0f2fe',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: '1.5rem'
                      }}
                    >
                      +
                    </button>
                  </div>

                  <strong style={{ fontSize: '1.5rem' }}>
                    {(c.product.price * c.qty).toLocaleString('uz-UZ')} so'm
                  </strong>

                  <button
                    type="button"
                    onClick={() => updateQty(c.product.id, 0, { remove: true })}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '5px',
                      border: '1px solid var(--border)',
                      background: 'rgba(239,68,68,0.15)',
                      color: '#fecdd3',
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: '1.5rem'
                    }}
                  >
                    x
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
          borderRadius: '5px',
          padding: '12px',
          background: 'var(--surface-2)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          gridColumn: isMobile ? 'auto' : '1 / -1',
          gridRow: isMobile ? 'auto' : '2'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: '12px'
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--muted)' }}>
            Chegirma (so'm)
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              style={{
                padding: '12px',
                borderRadius: '5px',
                border: '1px solid var(--border)',
                background: 'var(--surface-3)',
                color: '#f9fafb'
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--muted)' }}>
            To'lov turi
            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value as 'cash' | 'card' | 'debt')}
              style={{
                padding: '12px',
                borderRadius: '5px',
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
        </div>

        {payment === 'debt' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: '12px'
            }}
          >
            <input
              style={{
                padding: '12px',
                borderRadius: '5px',
                border: '1px solid var(--border)',
                background: 'var(--surface-3)',
                color: '#f9fafb'
              }}
              placeholder="Mijoz ismi"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              style={{
                padding: '12px',
                borderRadius: '5px',
                border: '1px solid var(--border)',
                background: 'var(--surface-3)',
                color: '#f9fafb'
              }}
              placeholder="Telefon"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px',
            background: 'var(--surface-3)',
            borderRadius: '5px',
            fontWeight: 750,
            border: '1px solid var(--border)'
          }}
        >
          <span>Jami</span>
          <span>{Math.max(total - discountValue, 0).toLocaleString('uz-UZ')} so'm</span>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={() => cancelSale()}
            style={{
              flex: 1,
              padding: '14px',
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.04)',
              color: '#f9fafb',
              borderRadius: '5px',
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
              borderRadius: '5px',
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

      <Modal open={printPromptOpen} onClose={closePrintPrompt} title="Chek chiqarish">
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: 'var(--muted)' }}>Chekni chop etamizmi?</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={closePrintPrompt} disabled={printing}>
              Keyinroq
            </Button>
            <Button variant="outline" size="sm" onClick={confirmPrint} disabled={printing}>
              {printing ? 'Chop etilmoqda...' : 'Chop etish'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
