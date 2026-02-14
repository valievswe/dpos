import React, { useState } from 'react'
import { Product, useProducts } from '../hooks/useProducts'

export function ProductManager(): React.ReactElement {
  const { products, loading, error: loadError, reload } = useProducts()
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState('dona')
  const [qty, setQty] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [stockEdit, setStockEdit] = useState<Record<number, string>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [showPrint, setShowPrint] = useState<{ product: Product | null }>({ product: null })
  const [printCopies, setPrintCopies] = useState('1')
  const [printPrinter, setPrintPrinter] = useState('label')

  const deleteProduct = async (product: Product) => {
    setError(null)
    setInfo(null)
    try {
      const first = await window.api.deleteProduct(product.id, false)
      if (first.requiresConfirmation) {
        const ok = window.confirm(
          `Bu mahsulot avval ishlatilgan (sotuv yozuvlari: ${first.saleCount ?? 0}, harakatlar: ${
            first.movementCount ?? 0
          }). Baribir o'chiraymi?`
        )
        if (!ok) return
        const forced = await window.api.deleteProduct(product.id, true)
        if (!forced.success) throw new Error("O'chirish amalga oshmadi")
      } else if (!first.success) {
        throw new Error("O'chirish amalga oshmadi")
      }
      setInfo("Mahsulot o'chirildi")
      await reload()
    } catch (err: any) {
      setError(`Xato: ${err?.message ?? 'noma'}`)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const numericPrice = Number(price)
      if (Number.isNaN(numericPrice) || numericPrice < 0) {
        setError("Narx noto'g'ri kiritildi")
        return
      }
      const initialQty = Number(qty)
      if (!Number.isFinite(initialQty) || initialQty < 0) {
        setError("Boshlang'ich qoldiq noto'g'ri")
        return
      }
      const ok = await window.api.addProduct(sku.trim(), name.trim(), numericPrice, unit, initialQty)
      if (!ok) throw new Error("Mahsulot qo'shilmadi")
      setSku('')
      setName('')
      setPrice('')
      setUnit('dona')
      setQty('0')
      setShowAdd(false)
      await reload()
    } catch (err: any) {
      setError(`Xato: ${err?.message ?? 'noma'}`)
    }
  }

  const printBarcode = async (product: Product) => {
    setError(null)
    setInfo(null)
    setPrintCopies('1')
    setPrintPrinter('label')
    setShowPrint({ product })
  }

  const updateStock = async (id: number) => {
    const val = stockEdit[id]
    if (val === undefined) return
    const qty = Number(val)
    if (Number.isNaN(qty)) return
    try {
      await window.api.setStock(id, qty)
      await reload()
    } catch (err: any) {
      setError(`Xato: ${err?.message ?? 'noma'}`)
    }
  }

  return (
    <div
      style={{
        padding: '18px',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        background: 'var(--surface-2)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, color: '#f9fafb' }}>Mahsulotlar</h3>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setInfo(null)
            setShowAdd(true)
          }}
          style={{
            padding: '10px 12px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
            color: '#0b1224',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer'
          }}
        >
          Yangi mahsulot
        </button>
      </div>

      {showAdd && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            padding: 20
          }}
          onClick={() => setShowAdd(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '520px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '16px',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: '#f9fafb' }}>Mahsulot qo'shish</h4>
              <button
                onClick={() => setShowAdd(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  fontSize: 18,
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>
            <form
              onSubmit={submit}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: 12 }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>SKU</span>
                <input
                  placeholder="SKU001"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  required
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Birlik</span>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
                >
                  <option value="dona">Dona (raqam)</option>
                  <option value="qadoq">Qadoq</option>
                  <option value="litr">Litr</option>
                  <option value="metr">Metr</option>
                </select>
              </label>
              <label style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Mahsulot nomi</span>
                <input
                  placeholder="Nomi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
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
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Boshlang'ich qoldiq</span>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
                />
              </label>
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#f9fafb',
                    cursor: 'pointer'
                  }}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
                    color: '#0b1224',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  Saqlash
                </button>
              </div>
              {error && <div style={{ color: 'var(--danger)', gridColumn: 'span 2' }}>{error}</div>}
            </form>
          </div>
        </div>
      )}
      {(error || loadError) && <div style={{ color: 'var(--danger)', marginBottom: '8px' }}>{error ?? loadError}</div>}
      {info && <div style={{ color: 'var(--success)', marginBottom: '8px' }}>{info}</div>}
      {loading ? (
        <div>Yuklanmoqda...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
              <th>SKU</th>
              <th>Nomi</th>
              <th>Narx</th>
              <th>Qoldiq</th>
              <th>Birlik</th>
              <th>Yangilash</th>
              <th>Barkod</th>
              <th>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td>{p.sku}</td>
                <td>{p.name}</td>
                <td style={{ color: 'var(--accent)' }}>{p.price.toLocaleString('uz-UZ')} so'm</td>
                <td>
                  {p.stock}{' '}
                  {p.stock <= 2 ? <span style={{ color: 'var(--warning)' }}>(kam)</span> : null}
                </td>
                <td>{p.unit ?? 'dona'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      style={{
                        width: '80px',
                        padding: '6px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-3)',
                        color: '#f9fafb'
                      }}
                      value={stockEdit[p.id] ?? ''}
                      placeholder="miqdor"
                      onChange={(e) =>
                        setStockEdit((s) => ({ ...s, [p.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => updateStock(p.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'rgba(34,211,238,0.14)',
                        color: '#e0f2fe',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Saqlash
                    </button>
                  </div>
                </td>
                <td>{p.barcode ?? '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => printBarcode(p)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'linear-gradient(135deg, rgba(34,211,238,0.28), rgba(6,182,212,0.28))',
                        color: '#e0f2fe',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Barkod chiqarish
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProduct(p)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'rgba(239,68,68,0.14)',
                        color: '#fecdd3',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      O'chirish
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showPrint.product && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            padding: 20
          }}
          onClick={() => setShowPrint({ product: null })}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 360,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: 16,
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: '#f9fafb' }}>Yorliq chiqarish</h4>
              <button
                onClick={() => setShowPrint({ product: null })}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  fontSize: 18,
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>
            <p style={{ color: 'var(--muted)', marginTop: 6, marginBottom: 12 }}>
              {showPrint.product?.name} ({showPrint.product?.sku})
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>Nusxa soni</span>
                <input
                  type="number"
                  min={1}
                  value={printCopies}
                  onChange={(e) => setPrintCopies(e.target.value)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>Printer nomi</span>
                <input
                  value={printPrinter}
                  onChange={(e) => setPrintPrinter(e.target.value)}
                  placeholder="label"
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowPrint({ product: null })}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#f9fafb',
                  cursor: 'pointer'
                }}
              >
                Bekor
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!showPrint.product) return
                  const copiesNum = Number(printCopies)
                  if (!Number.isInteger(copiesNum) || copiesNum <= 0) {
                    setError("Yorliq soni noto'g'ri")
                    return
                  }
                  try {
                    const ok = await window.api.printBarcodeByProduct(
                      showPrint.product.id,
                      copiesNum,
                      printPrinter || 'label'
                    )
                    if (!ok) {
                      setError('Barkod chop etilmadi')
                      return
                    }
                    setInfo(`Barkod yuborildi (${copiesNum} dona) → ${printPrinter || 'label'}`)
                    setShowPrint({ product: null })
                    await reload()
                  } catch (err: any) {
                    setError(`Xato: ${err?.message ?? 'noma'}`)
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
                  color: '#0b1224',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                Chop etish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
