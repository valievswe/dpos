import React, { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Button'
import { Pagination } from './ui/Pagination'
import { DateRangeFilter } from './ui/DateRangeFilter'
import { Modal } from './ui/Modal'

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
  const [selectedRow, setSelectedRow] = useState<SaleRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'debt' | 'mixed'>('all')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})
  const [page, setPage] = useState(1)
  const pageSize = 10

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

  const selectSale = async (row: SaleRow) => {
    setSelected(row.id)
    setSelectedRow(row)
    try {
      const its = await window.api.getSaleItems(row.id)
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

  useEffect(() => {
    setPage(1)
  }, [paymentFilter, search, dateRange])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesPayment = paymentFilter === 'all' || r.payment_method === paymentFilter
      const term = search.trim().toLowerCase()
      const matchesSearch =
        !term ||
        r.customer_name?.toLowerCase().includes(term) ||
        r.id.toString().includes(term) ||
        r.sale_date.toLowerCase().includes(term)

      let matchesDate = true
      if (dateRange.from) {
        matchesDate = matchesDate && new Date(r.sale_date) >= new Date(dateRange.from)
      }
      if (dateRange.to) {
        const end = new Date(dateRange.to)
        end.setHours(23, 59, 59, 999)
        matchesDate = matchesDate && new Date(r.sale_date) <= end
      }
      return matchesPayment && matchesSearch && matchesDate
    })
  }, [rows, paymentFilter, search, dateRange])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ID / sana / mijoz"
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb',
              minWidth: 180
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
            <option value="mixed">Aralash</option>
          </select>
          <Button variant="ghost" size="sm" onClick={load}>
            Yangilash
          </Button>
        </div>
      </div>

      <div style={{ margin: '12px 0' }}>
        <DateRangeFilter
          from={dateRange.from}
          to={dateRange.to}
          onChange={(range) => setDateRange(range)}
        />
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '8px' }}>{error}</div>}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--border-soft)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '0.7fr 1.2fr 1fr 0.8fr 1fr 0.8fr',
              padding: '12px 14px',
              color: 'var(--muted)',
              fontWeight: 700
            }}
          >
            <div>ID</div>
            <div>Sana</div>
            <div>Jami</div>
            <div>To'lov</div>
            <div>Mijoz</div>
            <div />
          </div>
        </div>
        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {pageRows.map((r) => (
            <div
              key={r.id}
              onClick={() => selectSale(r)}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1.2fr 1fr 0.8fr 1fr 0.8fr',
                padding: '12px 14px',
                borderBottom: '1px solid var(--border-soft)',
                background: selected === r.id ? 'rgba(34,211,238,0.06)' : 'transparent',
                cursor: 'pointer',
                alignItems: 'center',
                gap: 6
              }}
            >
              <div style={{ fontWeight: 700 }}>{r.id}</div>
              <div style={{ color: '#e5e7eb' }}>{new Date(r.sale_date).toLocaleString('uz-UZ')}</div>
              <div style={{ color: 'var(--accent)', fontWeight: 800 }}>
                {(r.total_cents / 100).toLocaleString('uz-UZ')} so'm
              </div>
              <div>
                {(() => {
                  const styles: Record<string, { bg: string; color: string; label: string }> = {
                    cash: { bg: 'rgba(52,211,153,0.14)', color: '#bbf7d0', label: 'Naqd' },
                    card: { bg: 'rgba(59,130,246,0.14)', color: '#c7d2fe', label: 'Karta' },
                    debt: { bg: 'rgba(251,191,36,0.14)', color: '#fef3c7', label: 'Qarz' },
                    mixed: { bg: 'rgba(168,85,247,0.14)', color: '#ede9fe', label: 'Aralash' }
                  }
                  const token = styles[r.payment_method] ?? styles.cash
                  return (
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: token.bg,
                        color: token.color,
                        fontWeight: 700,
                        border: '1px solid var(--border)'
                      }}
                    >
                      {token.label}
                    </span>
                  )
                })()}
              </div>
              <div style={{ color: '#e5e7eb' }}>{r.customer_name ?? '-'}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    print(r.id)
                  }}
                >
                  Chek chiqarish
                </Button>
              </div>
            </div>
          ))}
          {pageRows.length === 0 && (
            <div style={{ padding: 16, color: 'var(--muted)' }}>Mos yozuv topilmadi.</div>
          )}
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null)
          setSelectedRow(null)
          setItems([])
        }}
        title={selected ? `Sotuv #${selected}` : ''}
        width={640}
      >
        {selectedRow && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Sana</div>
              <div style={{ fontWeight: 700 }}>{new Date(selectedRow.sale_date).toLocaleString('uz-UZ')}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Jami</div>
              <div style={{ color: 'var(--accent)', fontWeight: 800 }}>
                {(selectedRow.total_cents / 100).toLocaleString('uz-UZ')} so'm
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>To'lov</div>
              <div>
                {(() => {
                  const styles: Record<string, { bg: string; color: string; label: string }> = {
                    cash: { bg: 'rgba(52,211,153,0.14)', color: '#bbf7d0', label: 'Naqd' },
                    card: { bg: 'rgba(59,130,246,0.14)', color: '#c7d2fe', label: 'Karta' },
                    debt: { bg: 'rgba(251,191,36,0.14)', color: '#fef3c7', label: 'Qarz' },
                    mixed: { bg: 'rgba(168,85,247,0.14)', color: '#ede9fe', label: 'Aralash' }
                  }
                  const token = styles[selectedRow.payment_method] ?? styles.cash
                  return (
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: token.bg,
                        color: token.color,
                        fontWeight: 700,
                        border: '1px solid var(--border)'
                      }}
                    >
                      {token.label}
                    </span>
                  )
                })()}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Mijoz</div>
              <div>{selectedRow.customer_name ?? '-'}</div>
            </div>
          </div>
        )}

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
            background: 'var(--surface-3)'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr',
              padding: '10px 12px',
              color: 'var(--muted)',
              borderBottom: '1px solid var(--border-soft)',
              fontWeight: 700
            }}
          >
            <div>Mahsulot</div>
            <div>Miqdor</div>
            <div>Jami</div>
          </div>
          <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
            {items.map((i, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border-soft)'
                }}
              >
                <div>{i.product_name}</div>
                <div>
                  {i.quantity} x {(i.unit_price_cents / 100).toLocaleString('uz-UZ')} so'm
                </div>
                <div style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  {(i.line_total_cents / 100).toLocaleString('uz-UZ')} so'm
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div style={{ padding: 12, color: 'var(--muted)' }}>Tafsilotlar yo'q.</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
