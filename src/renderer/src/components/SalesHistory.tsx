import React, { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Button'
import { Pagination } from './ui/Pagination'
import { DateRangeFilter } from './ui/DateRangeFilter'
import { Modal } from './ui/Modal'

type SalesHistoryProps = {
  mode?: 'history' | 'refund'
}

type SaleRow = {
  id: number
  sale_date: string
  total_cents: number
  paid_cents: number
  debt_added_cents: number
  debt_reduced_cents: number
  debt_cents: number
  returned_cents: number
  refund_cents: number
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

export function SalesHistory({ mode = 'history' }: SalesHistoryProps = {}): React.ReactElement {
  const enableReturns = mode === 'refund'
  const allowMaintenanceActions = mode === 'history'
  const [rows, setRows] = useState<SaleRow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [items, setItems] = useState<
    {
      client_key: string
      sale_item_id: number
      product_name: string
      barcode?: string
      unit?: string
      quantity: number
      unit_price_cents: number
      line_total_cents: number
      returned_qty?: number
      returnable_qty?: number
    }[]
  >([])
  const [selectedRow, setSelectedRow] = useState<SaleRow | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'mixed' | 'debt'>('all')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [clearModalOpen, setClearModalOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [returning, setReturning] = useState(false)
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card'>('cash')
  const [returnNote, setReturnNote] = useState('')
  const [returnQtyByItem, setReturnQtyByItem] = useState<Record<string, string>>({})
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
    const labels: Record<string, string> = { cash: 'Naqd', card: 'Karta', mixed: 'Qisman', debt: 'Qarz' }
    return labels[method] ?? method
  }
  const formatUnit = (unit?: string) => (unit ? unit.toLowerCase() : '')
  const toNumber = (value: unknown, fallback = 0): number => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const formatSom = (cents: number) => `${(Math.round(toNumber(cents, 0)) / 100).toLocaleString('uz-UZ')} so'm`
  const normalizeSaleRow = (row: any): SaleRow => ({
    id: Math.round(toNumber(row?.id, 0)),
    sale_date: typeof row?.sale_date === 'string' ? row.sale_date : '',
    total_cents: Math.round(toNumber(row?.total_cents, 0)),
    paid_cents: Math.round(toNumber(row?.paid_cents, 0)),
    debt_added_cents: Math.max(0, Math.round(toNumber(row?.debt_added_cents, 0))),
    debt_reduced_cents: Math.max(0, Math.round(toNumber(row?.debt_reduced_cents, 0))),
    debt_cents: Math.max(0, Math.round(toNumber(row?.debt_cents, 0))),
    returned_cents: Math.max(0, Math.round(toNumber(row?.returned_cents, 0))),
    refund_cents: Math.max(0, Math.round(toNumber(row?.refund_cents, 0))),
    payment_method: typeof row?.payment_method === 'string' ? row.payment_method : 'cash',
    customer_name: row?.customer_name ?? undefined,
    customer_phone: row?.customer_phone ?? undefined
  })
  const clearReturnDraft = () => {
    setReturnQtyByItem({})
    setRefundMethod('cash')
    setReturnNote('')
    setReturning(false)
  }

  const load = async () => {
    try {
      const data = await window.api.getSales()
      const normalized = Array.isArray(data) ? data.map(normalizeSaleRow) : []
      setRows(normalized)
      return normalized
    } catch {
      setError("Sotuv tarixini yuklab bo'lmadi")
      return []
    }
  }

  useEffect(() => {
    load()
  }, [])

  const selectSale = async (row: SaleRow) => {
    setSelected(row.id)
    setSelectedRow(normalizeSaleRow(row))
    setReturnModalOpen(false)
    clearReturnDraft()
    try {
      const its = await window.api.getSaleItems(row.id)
      const normalizedItems = (Array.isArray(its) ? its : []).map((item: any, idx: number) => {
        const saleItemId = Math.round(toNumber(item?.sale_item_id ?? item?.id, 0))
        return {
          client_key: `ri-${idx}-${saleItemId > 0 ? saleItemId : 'x'}`,
          sale_item_id: saleItemId,
          product_name: typeof item?.product_name === 'string' ? item.product_name : '-',
          barcode: item?.barcode ?? undefined,
          unit: item?.unit ?? undefined,
          quantity: toNumber(item?.quantity, 0),
          unit_price_cents: Math.round(toNumber(item?.unit_price_cents, 0)),
          line_total_cents: Math.round(toNumber(item?.line_total_cents, 0)),
          returned_qty: toNumber(item?.returned_qty, 0),
          returnable_qty: Math.max(0, toNumber(item?.returnable_qty, toNumber(item?.quantity, 0)))
        }
      })
      setItems(normalizedItems)
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
      setReturnModalOpen(false)
      clearReturnDraft()
      await load()
    } catch {
      setError("Sotuv yozuvlarini tozalashda xatolik")
    } finally {
      setClearing(false)
    }
  }

  const returnPreview = useMemo(() => {
    const rows = items
      .map((i) => {
        const raw = returnQtyByItem[i.client_key]
        const parsed = Number(raw)
        const maxQty = Math.max(0, Number(i.returnable_qty ?? Math.max(i.quantity - (i.returned_qty ?? 0), 0)))
        const qty = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maxQty) : 0
        return {
          clientKey: i.client_key,
          saleItemId: i.sale_item_id,
          qty,
          maxQty,
          lineCents: Math.round(qty * i.unit_price_cents)
        }
      })
      .filter((r) => r.qty > 0)
    const totalCents = rows.reduce((sum, r) => sum + r.lineCents, 0)
    return { rows, totalCents }
  }, [items, returnQtyByItem])

  const hasReturnableItems = useMemo(
    () => items.some((i) => Number(i.returnable_qty ?? Math.max(i.quantity - (i.returned_qty ?? 0), 0)) > 0),
    [items]
  )
  const previewDebtReductionCents = useMemo(
    () => Math.min(returnPreview.totalCents, Math.max(0, toNumber(selectedRow?.debt_cents, 0))),
    [returnPreview.totalCents, selectedRow]
  )
  const previewRefundCents = useMemo(
    () => Math.max(0, returnPreview.totalCents - previewDebtReductionCents),
    [returnPreview.totalCents, previewDebtReductionCents]
  )

  const openReturnModal = () => {
    if (!selectedRow) return
    clearReturnDraft()
    setReturnModalOpen(true)
  }

  const submitReturn = async () => {
    if (!selectedRow) return
    if (returnPreview.rows.length === 0) {
      setError("Qaytarish uchun miqdor kiriting")
      return
    }
    if (returnPreview.rows.some((r) => r.saleItemId <= 0)) {
      setError("Qaytarish satrlari noto'g'ri yuklangan. Dasturni qayta ochib qayta urinib ko'ring.")
      return
    }

    setReturning(true)
    setError(null)
    setMessage(null)
    try {
      const res = await window.api.createSaleReturn({
        saleId: selectedRow.id,
        items: returnPreview.rows.map((r) => ({ saleItemId: r.saleItemId, qty: r.qty })),
        refundMethod,
        note: returnNote.trim() || undefined
      })

      setMessage(
        `Qaytish #${res.returnId}: jami ${formatSom(res.totalReturnedCents)}. Qarz kamaydi: ${formatSom(
          res.debtReducedCents
        )}. ${res.refundCents > 0 ? `Pul qaytarildi: ${formatSom(res.refundCents)} (${res.refundMethod === 'card' ? 'karta' : 'naqd'}).` : ''}`
      )

      setReturnModalOpen(false)
      clearReturnDraft()

      const refreshedRows = await load()
      const refreshed = refreshedRows.find((r) => r.id === selectedRow.id)
      if (refreshed) {
        setSelectedRow(refreshed)
        const refreshedItems = await window.api.getSaleItems(refreshed.id)
        const normalizedItems = (Array.isArray(refreshedItems) ? refreshedItems : []).map((item: any, idx: number) => {
          const saleItemId = Math.round(toNumber(item?.sale_item_id ?? item?.id, 0))
          return {
            client_key: `ri-${idx}-${saleItemId > 0 ? saleItemId : 'x'}`,
            sale_item_id: saleItemId,
            product_name: typeof item?.product_name === 'string' ? item.product_name : '-',
            barcode: item?.barcode ?? undefined,
            unit: item?.unit ?? undefined,
            quantity: toNumber(item?.quantity, 0),
            unit_price_cents: Math.round(toNumber(item?.unit_price_cents, 0)),
            line_total_cents: Math.round(toNumber(item?.line_total_cents, 0)),
            returned_qty: toNumber(item?.returned_qty, 0),
            returnable_qty: Math.max(0, toNumber(item?.returnable_qty, toNumber(item?.quantity, 0)))
          }
        })
        setItems(normalizedItems)
      }
    } catch (e: any) {
      setError(e?.message ?? "Qaytarishni saqlashda xatolik")
    } finally {
      setReturning(false)
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
        <h3 style={{ margin: 0, color: '#f9fafb' }}>
          {enableReturns ? 'Qaytarish' : "So'nggi sotuvlar"}
        </h3>
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
            <option value="mixed">Qisman</option>
            <option value="debt">Qarz</option>
          </select>
          <Button variant="ghost" size="sm" onClick={load}>
            Yangilash
          </Button>
          {allowMaintenanceActions && (
            <Button variant="outline" size="sm" onClick={() => exportExcel(filteredRows, 'sales_items')} disabled={exporting}>
              {exporting ? 'Eksport...' : 'Excel eksport'}
            </Button>
          )}
          {allowMaintenanceActions && (
            <Button variant="ghost" size="sm" onClick={() => setClearModalOpen(true)} disabled={clearing}>
              Sotuvlarni tozalash
            </Button>
          )}
        </div>
      </div>

      <div style={{ margin: '12px 0' }}>
        <DateRangeFilter
          from={dateRange.from}
          to={dateRange.to}
          onChange={(range) => setDateRange(range)}
        />
      </div>

      {message && <div style={{ color: 'var(--success)', marginBottom: '8px' }}>{message}</div>}
      {error && <div style={{ color: 'var(--danger)', marginBottom: '8px' }}>{error}</div>}
      <div style={{ border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--border-soft)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '0.7fr 1.1fr 0.9fr 1.3fr 0.8fr 1fr 0.8fr',
              padding: '12px 14px',
              color: 'var(--muted)',
              fontWeight: 700
            }}
          >
            <div>ID</div>
            <div>Sana</div>
            <div>Jami</div>
            <div>Hisob</div>
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
                gridTemplateColumns: '0.7fr 1.1fr 0.9fr 1.3fr 0.8fr 1fr 0.8fr',
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
                {formatSom(r.total_cents)}
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ color: '#e5e7eb', fontSize: '0.86rem' }}>
                  To'langan: <span style={{ fontWeight: 700 }}>{formatSom(r.paid_cents)}</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                  Dastlabki qarz: <span style={{ fontWeight: 700 }}>{formatSom(r.debt_added_cents)}</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                  Hozirgi qarz: <span style={{ fontWeight: 700 }}>{formatSom(r.debt_cents)}</span>
                </div>
                {r.returned_cents > 0 && (
                  <div style={{ color: '#fda4af', fontSize: '0.82rem' }}>
                    Qaytgan: <span style={{ fontWeight: 700 }}>{formatSom(r.returned_cents)}</span>
                  </div>
                )}
                {r.refund_cents > 0 && (
                  <div style={{ color: '#bbf7d0', fontSize: '0.82rem' }}>
                    Mijozga qaytarilgan: <span style={{ fontWeight: 700 }}>{formatSom(r.refund_cents)}</span>
                  </div>
                )}
              </div>
              <div>
                {(() => {
                  const styles: Record<string, { bg: string; color: string; label: string }> = {
                    cash: { bg: 'rgba(52,211,153,0.14)', color: '#bbf7d0', label: 'Naqd' },
                    card: { bg: 'rgba(59,130,246,0.14)', color: '#c7d2fe', label: 'Karta' },
                    mixed: { bg: 'rgba(249,115,22,0.16)', color: '#fed7aa', label: 'Qisman' },
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
          setReturnModalOpen(false)
          clearReturnDraft()
        }}
        title={selected ? `Sotuv #${selected}` : ''}
        width={760}
      >
        {selectedRow && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
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
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Umumiy sotuv</div>
              <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.1rem' }}>
                {formatSom(selectedRow.total_cents)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>To'langan</div>
              <div style={{ color: '#bbf7d0', fontWeight: 800, fontSize: '1.1rem' }}>
                {formatSom(selectedRow.paid_cents)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Dastlabki qarz</div>
              <div style={{ color: '#fef3c7', fontWeight: 800, fontSize: '1.1rem' }}>
                {formatSom(selectedRow.debt_added_cents)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Hozirgi qarz</div>
              <div style={{ color: '#fef3c7', fontWeight: 800, fontSize: '1.1rem' }}>
                {formatSom(selectedRow.debt_cents)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Qaytgan jami</div>
              <div style={{ color: '#fda4af', fontWeight: 800, fontSize: '1.1rem' }}>
                {formatSom(selectedRow.returned_cents)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Qaytishda qarzdan yechildi</div>
              <div style={{ color: '#fef3c7', fontWeight: 800, fontSize: '1.1rem' }}>
                {formatSom(selectedRow.debt_reduced_cents)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Mijozga qaytarilgan (kassa chiqimi)</div>
              <div style={{ color: '#bbf7d0', fontWeight: 800, fontSize: '1.1rem' }}>
                {formatSom(selectedRow.refund_cents)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Sof sotuv</div>
              <div style={{ color: '#e5e7eb', fontWeight: 800, fontSize: '1.1rem' }}>
                {formatSom(Math.max(0, selectedRow.total_cents - selectedRow.returned_cents))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>To'lov</div>
              <div>
                {(() => {
                  const styles: Record<string, { bg: string; color: string; label: string }> = {
                    cash: { bg: 'rgba(52,211,153,0.14)', color: '#bbf7d0', label: 'Naqd' },
                    card: { bg: 'rgba(59,130,246,0.14)', color: '#c7d2fe', label: 'Karta' },
                    mixed: { bg: 'rgba(249,115,22,0.16)', color: '#fed7aa', label: 'Qisman' },
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

        {enableReturns && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Button variant="outline" size="sm" disabled={!hasReturnableItems} onClick={openReturnModal}>
              Qaytarish
            </Button>
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
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
              padding: '10px 12px',
              color: 'var(--muted)',
              borderBottom: '1px solid var(--border-soft)',
              fontWeight: 700
            }}
          >
            <div>Mahsulot</div>
            <div>Sotilgan</div>
            <div>Qaytgan</div>
            <div>Qolgan</div>
            <div>Jami</div>
          </div>
          <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
            {items.map((i, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border-soft)'
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {i.product_name}
                  <div style={{ color: 'var(--muted)', fontSize: '0.82rem', fontWeight: 500 }}>
                    Barkod: {i.barcode ?? '-'}
                  </div>
                </div>
                <div style={{ color: '#e5e7eb' }}>
                  {Number(i.quantity).toLocaleString('uz-UZ')} {formatUnit(i.unit) || 'dona'}
                </div>
                <div style={{ color: '#fda4af' }}>{Number(i.returned_qty ?? 0).toLocaleString('uz-UZ')}</div>
                <div>{Number(i.returnable_qty ?? Math.max(i.quantity - (i.returned_qty ?? 0), 0)).toLocaleString('uz-UZ')}</div>
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

      {enableReturns && (
        <Modal
          open={returnModalOpen && !!selectedRow}
          onClose={() => {
            setReturnModalOpen(false)
            clearReturnDraft()
          }}
          title={selectedRow ? `Sotuv #${selectedRow.id} qaytarish` : 'Qaytarish'}
          width={760}
        >
          {selectedRow && (
            <div style={{ display: 'grid', gap: 12 }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 5,
                background: 'var(--surface-3)',
                padding: '10px 12px',
                display: 'grid',
                gap: 6
              }}
            >
              <div style={{ color: 'var(--muted)' }}>
                Mahsulotni qaytarganda tizim:
                {' '}1) stokni oshiradi,
                {' '}2) qarzni kamaytiradi,
                {' '}3) ortiqcha qismi uchun pul qaytarishni qayd qiladi.
              </div>
            </div>

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
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  padding: '10px 12px',
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--border-soft)',
                  fontWeight: 700
                }}
              >
                <div>Mahsulot</div>
                <div>Sotilgan</div>
                <div>Qaytgan</div>
                <div>Qaytarish</div>
                <div>Summasi</div>
              </div>
              <div style={{ maxHeight: '38vh', overflowY: 'auto' }}>
                {items.map((item) => {
                  const rowKey = item.client_key
                  const returnedQty = Number(item.returned_qty ?? 0)
                  const maxQty = Math.max(0, Number(item.returnable_qty ?? Math.max(item.quantity - returnedQty, 0)))
                  const raw = returnQtyByItem[rowKey] ?? ''
                  const parsed = Number(raw)
                  const qty = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maxQty) : 0
                  const lineCents = Math.round(qty * item.unit_price_cents)
                  return (
                    <div
                      key={rowKey}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border-soft)',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                      <div>{Number(item.quantity).toLocaleString('uz-UZ')}</div>
                      <div>{returnedQty.toLocaleString('uz-UZ')}</div>
                      <div>
                        <input
                          type="number"
                          min={0}
                          max={maxQty}
                          step="0.001"
                          value={raw}
                          disabled={maxQty <= 0}
                          onChange={(e) =>
                            setReturnQtyByItem((prev) => ({ ...prev, [rowKey]: e.target.value }))
                          }
                          style={{
                            width: 110,
                            padding: '8px 10px',
                            borderRadius: '5px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface-2)',
                            color: '#f9fafb'
                          }}
                        />
                        <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 4 }}>
                          Max: {maxQty.toLocaleString('uz-UZ')}
                        </div>
                      </div>
                      <div style={{ color: '#fda4af', fontWeight: 700 }}>{formatSom(lineCents)}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, color: 'var(--muted)' }}>
                Pul qaytarish usuli
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as 'cash' | 'card')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '5px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
                >
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, color: 'var(--muted)' }}>
                Izoh (ixtiyoriy)
                <input
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="Qaytarish sababi"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '5px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: '#f9fafb'
                  }}
                />
              </label>
            </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  background: 'var(--surface-3)',
                  padding: '10px 12px'
                }}
              >
                <div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Qaytarish jami</div>
                  <div style={{ color: '#fda4af', fontWeight: 800 }}>{formatSom(returnPreview.totalCents)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Qarzdan yechiladi</div>
                  <div style={{ color: '#fef3c7', fontWeight: 800 }}>{formatSom(previewDebtReductionCents)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Pul qaytariladi</div>
                  <div style={{ color: '#bbf7d0', fontWeight: 800 }}>
                    {formatSom(previewRefundCents)} {previewRefundCents > 0 ? `(${refundMethod === 'card' ? 'karta' : 'naqd'})` : ''}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReturnModalOpen(false)
                    clearReturnDraft()
                  }}
                  disabled={returning}
                >
                  Bekor qilish
                </Button>
                <Button variant="outline" size="sm" onClick={submitReturn} disabled={returning || returnPreview.totalCents <= 0}>
                  {returning ? 'Saqlanmoqda...' : "Qaytarishni saqlash"}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {allowMaintenanceActions && (
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
      )}
    </div>
  )
}
