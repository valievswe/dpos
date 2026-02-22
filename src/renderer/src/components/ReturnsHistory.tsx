import React, { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Button'
import { DateRangeFilter } from './ui/DateRangeFilter'
import { Modal } from './ui/Modal'
import { Pagination } from './ui/Pagination'

type ReturnRow = {
  id: number
  saleId: number
  customerId?: number
  customerName: string
  returnDate: string
  totalCents: number
  debtReducedCents: number
  refundCents: number
  refundMethod?: 'cash' | 'card'
  note?: string
  items: {
    productName: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
  }[]
}

const TASHKENT_TZ = 'Asia/Tashkent'

const parseDate = (raw?: string): Date | null => {
  if (!raw) return null
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized)
  const parsed = new Date(hasZone ? normalized : `${normalized}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function ReturnsHistory(): React.ReactElement {
  const [rows, setRows] = useState<ReturnRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})
  const [page, setPage] = useState(1)
  const [selectedRow, setSelectedRow] = useState<ReturnRow | null>(null)
  const [printingId, setPrintingId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
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

  const formatDateTime = (raw?: string) => {
    const parsed = parseDate(raw)
    return parsed ? tzFormatter.format(parsed) : '-'
  }
  const dateKey = (raw?: string) => {
    const parsed = parseDate(raw)
    return parsed ? tzDateKeyFormatter.format(parsed) : ''
  }
  const toNumber = (value: unknown, fallback = 0): number => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const formatSom = (cents: number) => `${(Math.round(toNumber(cents, 0)) / 100).toLocaleString('uz-UZ')} so'm`

  const normalizeReturnRow = (row: any): ReturnRow => ({
    id: Math.round(toNumber(row?.id, 0)),
    saleId: Math.round(toNumber(row?.saleId, 0)),
    customerId: row?.customerId != null ? Math.round(toNumber(row.customerId, 0)) : undefined,
    customerName: typeof row?.customerName === 'string' ? row.customerName : '-',
    returnDate: typeof row?.returnDate === 'string' ? row.returnDate : '',
    totalCents: Math.round(toNumber(row?.totalCents, 0)),
    debtReducedCents: Math.round(toNumber(row?.debtReducedCents, 0)),
    refundCents: Math.round(toNumber(row?.refundCents, 0)),
    refundMethod: row?.refundMethod === 'card' || row?.refundMethod === 'cash' ? row.refundMethod : undefined,
    note: typeof row?.note === 'string' ? row.note : undefined,
    items: (Array.isArray(row?.items) ? row.items : []).map((item: any) => ({
      productName: typeof item?.productName === 'string' ? item.productName : '-',
      quantity: toNumber(item?.quantity, 0),
      unitPriceCents: Math.round(toNumber(item?.unitPriceCents, 0)),
      lineTotalCents: Math.round(toNumber(item?.lineTotalCents, 0))
    }))
  })

  const loadReturns = async () => {
    setLoading(true)
    setError(null)
    try {
      const getSaleReturns = (window.api as any).getSaleReturns
      if (typeof getSaleReturns !== 'function') {
        setRows([])
        setError("Qaytishlar funksiyasi yangilangan. Dasturni yopib qayta oching.")
        return
      }
      const data = await getSaleReturns()
      setRows((Array.isArray(data) ? data : []).map(normalizeReturnRow))
    } catch (e: any) {
      setError(e?.message ?? "Qaytishlar ro'yxatini yuklab bo'lmadi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReturns()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, dateRange])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      const key = dateKey(r.returnDate)
      const matchesFrom = !dateRange.from || (key && key >= dateRange.from)
      const matchesTo = !dateRange.to || (key && key <= dateRange.to)
      const productText = r.items.map((i) => i.productName.toLowerCase()).join(' ')
      const methodText = r.refundMethod === 'card' ? 'karta' : r.refundMethod === 'cash' ? 'naqd' : 'yoq'
      const matchesSearch =
        !term ||
        String(r.id).includes(term) ||
        String(r.saleId).includes(term) ||
        r.customerName.toLowerCase().includes(term) ||
        methodText.includes(term) ||
        (r.note ?? '').toLowerCase().includes(term) ||
        productText.includes(term)
      return matchesFrom && matchesTo && matchesSearch
    })
  }, [rows, search, dateRange, tzDateKeyFormatter])

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.totalReturnedCents += row.totalCents
        acc.totalDebtReducedCents += row.debtReducedCents
        acc.totalRefundCents += row.refundCents
        return acc
      },
      {
        totalReturnedCents: 0,
        totalDebtReducedCents: 0,
        totalRefundCents: 0
      }
    )
  }, [filteredRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  const printReturn = async (row: ReturnRow) => {
    setPrintingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const printReturnReceiptById = (window.api as any).printReturnReceiptById
      if (typeof printReturnReceiptById !== 'function') {
        setError("Qaytish chek funksiyasi yangilangan. Dasturni yopib qayta oching.")
        return
      }
      const res = await printReturnReceiptById(row.id)
      if (!res.success) {
        setError(res.error ?? 'Qaytish cheki chiqarilmadi')
      } else {
        setMessage(`Qaytish #${row.id} cheki yuborildi`)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Qaytish cheki chiqarilmadi')
    } finally {
      setPrintingId(null)
    }
  }

  const exportReturns = async (sourceRows: ReturnRow[]) => {
    if (exporting) return
    if (sourceRows.length === 0) {
      setError("Eksport uchun qaytish yozuvi yo'q")
      return
    }

    setExporting(true)
    setError(null)
    try {
      const headers = [
        'Qaytish ID',
        'Sotuv ID',
        'Sana',
        'Mijoz',
        'Mahsulot',
        'Miqdor',
        'Birlik narx (so\'m)',
        'Qator jami (so\'m)',
        'Qaytish jami (so\'m)',
        'Qarzdan yechilgan (so\'m)',
        'Refund (so\'m)',
        'Usul',
        'Izoh'
      ]

      const rows = sourceRows.flatMap((r) => {
        const method = r.refundMethod === 'card' ? 'Karta' : r.refundMethod === 'cash' ? 'Naqd' : '-'
        const mappedItems = r.items.length > 0 ? r.items : [{ productName: '-', quantity: 0, unitPriceCents: 0, lineTotalCents: 0 }]
        return mappedItems.map((item) => [
          r.id,
          r.saleId,
          formatDateTime(r.returnDate),
          r.customerName,
          item.productName,
          item.quantity,
          item.unitPriceCents / 100,
          item.lineTotalCents / 100,
          r.totalCents / 100,
          r.debtReducedCents / 100,
          r.refundCents / 100,
          method,
          r.note ?? ''
        ])
      })

      rows.push([
        'Jami',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        summary.totalReturnedCents / 100,
        summary.totalDebtReducedCents / 100,
        summary.totalRefundCents / 100,
        '',
        ''
      ])

      const fileName = `qaytishlar_tarikhi_${tzDateKeyFormatter.format(new Date())}.xlsx`
      const res = await window.api.exportSalesExcel({
        headers,
        rows,
        fileName,
        sheetName: 'Returns'
      })

      if (!res.success && !res.cancelled) {
        setError('Qaytishlarni eksport qilishda xatolik')
      }
    } catch {
      setError('Qaytishlarni eksport qilishda xatolik')
    } finally {
      setExporting(false)
    }
  }

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, color: '#f9fafb' }}>Qaytishlar tarixi</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={loadReturns}>
            Yangilash
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReturns(filteredRows)} disabled={exporting}>
            {exporting ? 'Eksport...' : 'Qaytish XLSX'}
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: '1 1 280px' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qaytish ID / Sotuv ID / mijoz"
            style={{
              padding: '10px 12px',
              borderRadius: '5px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb',
              minWidth: 240
            }}
          />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <DateRangeFilter from={dateRange.from} to={dateRange.to} onChange={(range) => setDateRange(range)} />
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10
        }}
      >
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 5,
            background: 'var(--surface-3)',
            padding: 10
          }}
        >
          <div style={{ color: 'var(--muted)' }}>Jami qaytgan summa</div>
          <div style={{ color: '#fda4af', fontWeight: 800, fontSize: '1.08rem' }}>
            {formatSom(summary.totalReturnedCents)}
          </div>
        </div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 5,
            background: 'var(--surface-3)',
            padding: 10
          }}
        >
          <div style={{ color: 'var(--muted)' }}>Qarzdan yechilgan</div>
          <div style={{ color: '#fef3c7', fontWeight: 800, fontSize: '1.08rem' }}>
            {formatSom(summary.totalDebtReducedCents)}
          </div>
        </div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 5,
            background: 'var(--surface-3)',
            padding: 10
          }}
        >
          <div style={{ color: 'var(--muted)' }}>Pul qaytarilgan</div>
          <div style={{ color: '#bbf7d0', fontWeight: 800, fontSize: '1.08rem' }}>
            {formatSom(summary.totalRefundCents)}
          </div>
        </div>
      </div>

      {message && <div style={{ color: 'var(--success)', marginTop: 10 }}>{message}</div>}
      {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}

      <div style={{ border: '1px solid var(--border)', borderRadius: '5px', marginTop: 12, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '0.7fr 1.1fr 0.8fr 1.2fr 0.9fr 0.9fr 0.9fr 0.9fr 1.3fr',
            padding: '12px 14px',
            color: 'var(--muted)',
            fontWeight: 700,
            background: 'var(--surface-3)',
            borderBottom: '1px solid var(--border-soft)',
            gap: 8
          }}
        >
          <div>ID</div>
          <div>Sana</div>
          <div>Sotuv</div>
          <div>Mijoz</div>
          <div>Qaytgan</div>
          <div>Qarz kamaydi</div>
          <div>Refund</div>
          <div>Usul</div>
          <div>Amallar</div>
        </div>

        <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16, color: 'var(--muted)' }}>Yuklanmoqda...</div>
          ) : pageRows.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--muted)' }}>Mos qaytish yozuvi topilmadi.</div>
          ) : (
            pageRows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '0.7fr 1.1fr 0.8fr 1.2fr 0.9fr 0.9fr 0.9fr 0.9fr 1.3fr',
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--border-soft)',
                  gap: 8,
                  alignItems: 'center'
                }}
              >
                <div style={{ fontWeight: 700 }}>{r.id}</div>
                <div>{formatDateTime(r.returnDate)}</div>
                <div>#{r.saleId}</div>
                <div>{r.customerName}</div>
                <div style={{ color: '#fda4af', fontWeight: 700 }}>{formatSom(r.totalCents)}</div>
                <div style={{ color: '#fef3c7', fontWeight: 700 }}>{formatSom(r.debtReducedCents)}</div>
                <div style={{ color: '#bbf7d0', fontWeight: 700 }}>{formatSom(r.refundCents)}</div>
                <div>{r.refundMethod === 'card' ? 'Karta' : r.refundMethod === 'cash' ? 'Naqd' : '-'}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedRow(r)}>
                    Batafsil
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => printReturn(r)} disabled={printingId === r.id}>
                    {printingId === r.id ? 'Chop...' : 'Chek'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <Modal
        open={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={selectedRow ? `Qaytish #${selectedRow.id}` : ''}
        width={700}
      >
        {selectedRow && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 5,
                background: 'var(--surface-3)',
                padding: 12,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 10
              }}
            >
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Sana</div>
                <div>{formatDateTime(selectedRow.returnDate)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Sotuv</div>
                <div>#{selectedRow.saleId}</div>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Mijoz</div>
                <div>{selectedRow.customerName}</div>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Jami qaytgan</div>
                <div style={{ color: '#fda4af', fontWeight: 700 }}>{formatSom(selectedRow.totalCents)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Qarz kamaydi</div>
                <div style={{ color: '#fef3c7', fontWeight: 700 }}>{formatSom(selectedRow.debtReducedCents)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Pul qaytdi</div>
                <div style={{ color: '#bbf7d0', fontWeight: 700 }}>
                  {formatSom(selectedRow.refundCents)}
                  {selectedRow.refundCents > 0 && ` (${selectedRow.refundMethod === 'card' ? 'karta' : 'naqd'})`}
                </div>
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
              <div style={{ maxHeight: '34vh', overflowY: 'auto' }}>
                {selectedRow.items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border-soft)'
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{item.productName}</div>
                    <div>{item.quantity.toLocaleString('uz-UZ')}</div>
                    <div style={{ color: '#fda4af', fontWeight: 700 }}>{formatSom(item.lineTotalCents)}</div>
                  </div>
                ))}
                {selectedRow.items.length === 0 && (
                  <div style={{ padding: 12, color: 'var(--muted)' }}>Mahsulotlar yo'q.</div>
                )}
              </div>
            </div>

            {selectedRow.note && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  background: 'var(--surface-3)',
                  padding: 12
                }}
              >
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 6 }}>Izoh</div>
                <div>{selectedRow.note}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
