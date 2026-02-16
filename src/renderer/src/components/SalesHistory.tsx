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
  customer_phone?: string
}

const TASHKENT_TZ = 'Asia/Tashkent'

const parseSaleDate = (raw: string): Date | null => {
  if (!raw) return null
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized)
  const parsed = new Date(hasZone ? normalized : `${normalized}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function SalesHistory(): React.ReactElement {
  const [rows, setRows] = useState<SaleRow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [items, setItems] = useState<
    {
      product_name: string
      barcode?: string
      unit?: string
      quantity: number
      unit_price_cents: number
      line_total_cents: number
    }[]
  >([])
  const [selectedRow, setSelectedRow] = useState<SaleRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'debt'>('all')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [clearModalOpen, setClearModalOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const pageSize = 10
  const tzFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('uz-UZ', {
        timeZone: TASHKENT_TZ,
        dateStyle: 'short',
        timeStyle: 'short'
      }),
    []
  )
  const tzDateKeyFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: TASHKENT_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }),
    []
  )
  const formatSaleDate = (raw: string) => {
    const parsed = parseSaleDate(raw)
    return parsed ? tzFormatter.format(parsed) : '-'
  }
  const paymentLabel = (method: string) => {
    const labels: Record<string, string> = { cash: 'Naqd', card: 'Karta', debt: 'Qarz' }
    return labels[method] ?? method
  }
  const formatUnit = (unit?: string) => (unit ? unit.toLowerCase() : '')

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

  const exportExcel = async (sourceRows: SaleRow[], filePrefix: string) => {
    if (exporting) return
    if (sourceRows.length === 0) {
      setError("Eksport uchun sotuv yo'q")
      return
    }
    setExporting(true)
    setError(null)
    try {
      const headers = ['ID', 'Mahsulot', 'Barkod', 'Miqdor', 'Birlik', "Jami (so'm)", "To'lov", 'Mijoz', 'Telefon', 'Sana']
      const saleItems = await Promise.all(
        sourceRows.map(async (r) => {
          const its = await window.api.getSaleItems(r.id)
          return { sale: r, items: its }
        })
      )
      let totalSalesCents = 0
      const rows = saleItems.flatMap(({ sale, items }) =>
        items.map((i) => {
          totalSalesCents += Math.round(i.line_total_cents)
          const unit = formatUnit(i.unit)
          return [
            sale.id,
            i.product_name,
            i.barcode ?? '',
            i.quantity,
            unit,
            Math.round(i.line_total_cents) / 100,
            paymentLabel(sale.payment_method),
            sale.customer_name ?? '',
            sale.customer_phone ?? '',
            formatSaleDate(sale.sale_date)
          ]
        })
      )
      rows.push(['Jami', '', '', '', '', totalSalesCents / 100, '', '', '', ''])
      const fileName = `${filePrefix}_${tzDateKeyFormatter.format(new Date())}.xlsx`
      const res = await window.api.exportSalesExcel({
        headers,
        rows,
        fileName,
        sheetName: 'Sales'
      })
      if (!res.success && !res.cancelled) {
        setError('Eksport qilishda xatolik')
      }
    } catch {
      setError('Eksport qilishda xatolik')
    } finally {
      setExporting(false)
    }
  }

  const clearSales = async () => {
    const finalOk = window.confirm(
      "Barcha sotuv yozuvlarini tozalaysizmi? Bu amalni ortga qaytarib bo'lmaydi."
    )
    if (!finalOk) return

    setClearing(true)
    setError(null)
    try {
      await window.api.clearSalesRecords()
      setClearModalOpen(false)
      setSelected(null)
      setSelectedRow(null)
      setItems([])
      await load()
    } catch {
      setError("Sotuv yozuvlarini tozalashda xatolik")
    } finally {
      setClearing(false)
    }
  }

  useEffect(() => {
    setPage(1)
  }, [paymentFilter, search, dateRange])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesPayment = paymentFilter === 'all' || r.payment_method === paymentFilter
      const term = search.trim().toLowerCase()
      const saleDate = parseSaleDate(r.sale_date)
      const saleDateKey = saleDate ? tzDateKeyFormatter.format(saleDate) : ''
      const matchesSearch =
        !term ||
        r.customer_name?.toLowerCase().includes(term) ||
        r.id.toString().includes(term) ||
        r.sale_date.toLowerCase().includes(term) ||
        (saleDate ? tzFormatter.format(saleDate).toLowerCase().includes(term) : false)

      let matchesDate = true
      if (dateRange.from || dateRange.to) {
        if (!saleDateKey) {
          matchesDate = false
        }
      }
      if (dateRange.from) {
        matchesDate = matchesDate && saleDateKey >= dateRange.from
      }
      if (dateRange.to) {
        matchesDate = matchesDate && saleDateKey <= dateRange.to
      }
      return matchesPayment && matchesSearch && matchesDate
    })
  }, [rows, paymentFilter, search, dateRange, tzFormatter, tzDateKeyFormatter])

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
        borderRadius: '5px',
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
              borderRadius: '5px',
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
              borderRadius: '5px',
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
          <Button variant="ghost" size="sm" onClick={load}>
            Yangilash
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel(filteredRows, 'sales_items')} disabled={exporting}>
            {exporting ? 'Eksport...' : 'Excel eksport'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setClearModalOpen(true)} disabled={clearing}>
            Sotuvlarni tozalash
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
      <div style={{ border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
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
              <div style={{ color: '#e5e7eb' }}>{formatSaleDate(r.sale_date)}</div>
              <div style={{ color: 'var(--accent)', fontWeight: 800 }}>
                {(r.total_cents / 100).toLocaleString('uz-UZ')} so'm
              </div>
              <div>
                {(() => {
                  const styles: Record<string, { bg: string; color: string; label: string }> = {
                    cash: { bg: 'rgba(52,211,153,0.14)', color: '#bbf7d0', label: 'Naqd' },
                    card: { bg: 'rgba(59,130,246,0.14)', color: '#c7d2fe', label: 'Karta' },
                    debt: { bg: 'rgba(251,191,36,0.14)', color: '#fef3c7', label: 'Qarz' }
                  }
                  const token = styles[r.payment_method] ?? styles.cash
                  return (
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: 5,
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: 12,
              marginBottom: 14,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 5,
              background: 'var(--surface-3)'
            }}
          >
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Sana va vaqt</div>
              <div style={{ fontWeight: 750 }}>{formatSaleDate(selectedRow.sale_date)}</div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Jami</div>
              <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.1rem' }}>
                {(selectedRow.total_cents / 100).toLocaleString('uz-UZ')} so'm
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>To'lov</div>
              <div>
                {(() => {
                  const styles: Record<string, { bg: string; color: string; label: string }> = {
                    cash: { bg: 'rgba(52,211,153,0.14)', color: '#bbf7d0', label: 'Naqd' },
                    card: { bg: 'rgba(59,130,246,0.14)', color: '#c7d2fe', label: 'Karta' },
                    debt: { bg: 'rgba(251,191,36,0.14)', color: '#fef3c7', label: 'Qarz' }
                  }
                  const token = styles[selectedRow.payment_method] ?? styles.cash
                  return (
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: 5,
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
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Mijoz</div>
              <div>{selectedRow.customer_name ?? '-'}</div>
            </div>
          </div>
        )}

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 5,
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
                <div style={{ fontWeight: 600 }}>{i.product_name}</div>
                <div style={{ color: '#e5e7eb' }}>
                  {i.quantity} x {(i.unit_price_cents / 100).toLocaleString('uz-UZ')} so'm
                </div>
                <div style={{ color: 'var(--accent)', fontWeight: 800 }}>
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

      <Modal open={clearModalOpen} onClose={() => setClearModalOpen(false)} title="Sotuvlarni tozalash" width={560}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
            Tozalashdan oldin barcha sotuv yozuvlarini Excelga eksport qilasizmi? Tavsiya: avval eksport qiling, keyin tozalang.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const allRows = await window.api.getSalesAll()
                await exportExcel(allRows, 'sales_all_before_clear')
              }}
              disabled={exporting || clearing}
            >
              {exporting ? 'Eksport...' : 'Avval eksport qilish'}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSales} disabled={exporting || clearing}>
              {clearing ? 'Tozalanmoqda...' : 'Eksportsiz tozalash'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setClearModalOpen(false)} disabled={exporting || clearing}>
              Bekor qilish
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
