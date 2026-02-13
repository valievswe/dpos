import React, { useEffect, useState } from 'react'

type SaleRow = {
  id: number
  sale_date: string
  total_cents: number
  payment_method: string
  customer_name?: string
}

export function SalesHistory(): React.ReactElement {
  const [rows, setRows] = useState<SaleRow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [items, setItems] = useState<
    { product_name: string; quantity: number; unit_price_cents: number; line_total_cents: number }[]
  >([])
  const [error, setError] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'debt'>('all')
  const [search, setSearch] = useState('')

  const load = async () => {
    try {
      const data = await window.api.getSales()
      setRows(data)
    } catch {
      setError("Sotuv tarixini yuklab bo'lmadi")
    }
  }

  useEffect(() => {
    load()
  }, [])

  const selectSale = async (id: number) => {
    setSelected(id)
    try {
      const its = await window.api.getSaleItems(id)
      setItems(its)
    } catch {
      setError("Sotuv tafsilotlari topilmadi")
    }
  }

  const print = async (id: number) => {
    const res = await window.api.printReceiptBySale(id)
    if (!res.success) {
      setError(res.error ? `Chop etilmadi: ${res.error}` : 'Chop etilmadi')
    } else {
      setError(null)
    }
  }

  const filteredRows = rows.filter((r) => {
    const matchesPayment = paymentFilter === 'all' || r.payment_method === paymentFilter
    const term = search.trim().toLowerCase()
    const matchesSearch =
      !term ||
      r.customer_name?.toLowerCase().includes(term) ||
      r.id.toString().includes(term) ||
      r.sale_date.toLowerCase().includes(term)
    return matchesPayment && matchesSearch
  })

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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#f9fafb' }}>So'nggi sotuvlar</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ID / sana / mijoz"
            style={{
              padding: '10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          />
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as any)}
            style={{
              padding: '10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          >
            <option value="all">Barchasi</option>
            <option value="cash">Naqd</option>
            <option value="card">Karta</option>
            <option value="debt">Qarz</option>
          </select>
          <button
            type="button"
            onClick={load}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.04)',
              color: '#f9fafb',
              cursor: 'pointer'
            }}
          >
            Yangilash
          </button>
        </div>
      </div>
      {error && <div style={{ color: 'var(--danger)', marginBottom: '8px' }}>{error}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
            <th>ID</th>
            <th>Sana</th>
            <th>Jami</th>
            <th>To'lov</th>
            <th>Mijoz</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((r) => (
            <tr
              key={r.id}
              style={{
                borderBottom: '1px solid var(--border-soft)',
                cursor: 'pointer',
                background: selected === r.id ? 'rgba(34,211,238,0.06)' : 'transparent'
              }}
              onClick={() => selectSale(r.id)}
            >
              <td>{r.id}</td>
              <td>{new Date(r.sale_date).toLocaleString('uz-UZ')}</td>
              <td style={{ color: 'var(--accent)' }}>{(r.total_cents / 100).toLocaleString('uz-UZ')} so'm</td>
              <td>{r.payment_method}</td>
              <td>{r.customer_name ?? '-'}</td>
              <td>
                <button type="button" onClick={(e) => { e.stopPropagation(); print(r.id) }}>
                  Chek chiqarish
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div style={{ marginTop: '12px', padding: '12px', borderRadius: '12px', background: 'var(--surface-3)' }}>
          <strong>Sotuv #{selected}</strong>
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {items.map((i, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                {i.product_name} x {i.quantity} = {(i.line_total_cents / 100).toLocaleString('uz-UZ')} so'm
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
