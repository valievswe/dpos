import React, { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Button'
import { DateRangeFilter } from './ui/DateRangeFilter'
import { Pagination } from './ui/Pagination'

type AnalyticsInventoryRow = {
  productId: number
  barcode: string
  name: string
  unit: string
  stock: number
  minStock: number
  costCents: number
  priceCents: number
  stockValueCents: number
  soldQty: number
  soldCents: number
}

type AnalyticsReport = {
  period: { from?: string; to?: string }
  summary: {
    netProfitCents: number
  }
  inventory: AnalyticsInventoryRow[]
}

const formatSom = (cents: number) => `${(cents / 100).toLocaleString('uz-UZ')} so'm`

export function OmborReportPage(): React.ReactElement {
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [report, setReport] = useState<AnalyticsReport>({
    period: {},
    summary: { netProfitCents: 0 },
    inventory: []
  })

  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 12

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.getAnalyticsReport(dateRange)
      setReport({
        period: data.period,
        summary: { netProfitCents: Number(data.summary?.netProfitCents ?? 0) },
        inventory: data.inventory
      })
    } catch (e: any) {
      setError(e?.message ?? 'Ombor hisobotini yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [dateRange.from, dateRange.to])

  useEffect(() => {
    setPage(1)
  }, [search, lowStockOnly])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return report.inventory.filter((row) => {
      const matchesTerm = !term || row.name.toLowerCase().includes(term) || row.barcode.toLowerCase().includes(term)
      const isLow = row.stock <= row.minStock
      return matchesTerm && (!lowStockOnly || isLow)
    })
  }, [report.inventory, search, lowStockOnly])

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.stockValueCents += row.stockValueCents
        acc.stockCostCents += Math.round(Number(row.stock ?? 0) * Number(row.costCents ?? 0))
        acc.soldQty += row.soldQty
        acc.soldCents += row.soldCents
        return acc
      },
      { stockValueCents: 0, stockCostCents: 0, soldQty: 0, soldCents: 0 }
    )
  }, [filteredRows])

  const overallStoreProfitCents = useMemo(
    () =>
      report.inventory.reduce(
        (sum, row) => sum + Math.round(row.stock * (row.priceCents - row.costCents)),
        0
      ),
    [report.inventory]
  )

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  const exportInventory = async () => {
    if (exporting) return
    setExporting(true)
    setError(null)
    try {
      const headers = [
        'Barkod',
        'Mahsulot',
        'Birlik',
        'Qoldiq',
        'Min qoldiq',
        'Tannarx (so\'m)',
        'Sotuv narxi (so\'m)',
        'Birlik foyda (so\'m)',
        'Ombor qiymati (so\'m)',
        'Qoldiq foyda (so\'m)',
        'Davrda sotildi (miqdor)',
        'Davrda tushum (so\'m)'
      ]
      const rows = filteredRows.map((r) => [
        r.barcode,
        r.name,
        r.unit,
        r.stock,
        r.minStock,
        r.costCents / 100,
        r.priceCents / 100,
        (r.priceCents - r.costCents) / 100,
        r.stockValueCents / 100,
        Math.round(r.stock * (r.priceCents - r.costCents)) / 100,
        r.soldQty,
        r.soldCents / 100
      ])

      await window.api.exportSalesExcel({
        headers,
        rows,
        fileName: 'ombor_hisoboti.xlsx',
        sheetName: 'Ombor'
      })
    } catch {
      setError('Ombor eksportida xatolik')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14, minHeight: 0 }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: '#f9fafb' }}>Ombor hisoboti</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={load}>Yangilash</Button>
            <Button variant="outline" size="sm" onClick={exportInventory} disabled={exporting}>
              {exporting ? 'Eksport...' : 'Ombor XLSX'}
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: '1 1 280px' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mahsulot yoki barkod"
              style={{
                padding: '10px 12px',
                borderRadius: 5,
                border: '1px solid var(--border)',
                background: 'var(--surface-3)',
                color: '#f9fafb',
                minWidth: 220
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
              Faqat kam qoldiq
            </label>
          </div>
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
            <DateRangeFilter from={dateRange.from} to={dateRange.to} onChange={(range) => setDateRange(range)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--surface-3)' }}>
            <div style={{ color: 'var(--muted)' }}>Davrda tushum</div>
            <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.15rem' }}>{formatSom(totals.soldCents)}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--surface-3)' }}>
            <div style={{ color: 'var(--muted)' }}>Davrda sotildi (miqdor)</div>
            <div style={{ color: '#f9fafb', fontWeight: 800, fontSize: '1.15rem' }}>{totals.soldQty.toLocaleString('uz-UZ')}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--surface-3)' }}>
            <div style={{ color: 'var(--muted)' }}>Joriy ombor qiymati</div>
            <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '1.15rem' }}>{formatSom(totals.stockValueCents)}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--surface-3)' }}>
            <div style={{ color: 'var(--muted)' }}>Joriy ombor tannarxi</div>
            <div style={{ color: '#e5e7eb', fontWeight: 800, fontSize: '1.15rem' }}>{formatSom(totals.stockCostCents)}</div>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-3)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Foyda bo'limi</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--muted)' }}>Umumiy foyda salohiyati</div>
              <div style={{ color: '#86efac', fontWeight: 800, fontSize: '1.15rem' }}>{formatSom(overallStoreProfitCents)}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Barcha ombor: Qoldiq * (Sotuv narxi - Tannarx)</div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--muted)' }}>Davrdagi sotilgan mahsulot foydasi</div>
              <div style={{ color: '#bbf7d0', fontWeight: 800, fontSize: '1.15rem' }}>
                {formatSom(report.summary.netProfitCents)}
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1500 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '0.8fr 1.6fr 0.7fr 0.8fr 0.9fr 1fr 1fr 1fr 1fr 1fr 0.9fr 1fr',
                  padding: '11px 12px',
                  background: 'var(--surface-3)',
                  color: 'var(--muted)',
                  fontWeight: 700,
                  borderBottom: '1px solid var(--border-soft)',
                  gap: 8
                }}
              >
                <div>Barkod</div>
                <div>Mahsulot</div>
                <div>Birlik</div>
                <div>Qoldiq</div>
                <div>Min qoldiq</div>
                <div>Tannarx</div>
                <div>Sotuv narxi</div>
                <div>Birlik foyda</div>
                <div>Ombor qiymati</div>
                <div>Qoldiq foyda</div>
                <div>Davrda sotildi</div>
                <div>Davrda tushum</div>
              </div>

              <div style={{ maxHeight: '48vh', overflowY: 'auto' }}>
                {loading && <div style={{ padding: 14, color: 'var(--muted)' }}>Yuklanmoqda...</div>}
                {!loading && pagedRows.length === 0 && <div style={{ padding: 14, color: 'var(--muted)' }}>Mos mahsulot yo'q</div>}
                {!loading &&
                  pagedRows.map((row) => {
                    const low = row.stock <= row.minStock
                    const unitProfitCents = row.priceCents - row.costCents
                    const stockProfitCents = Math.round(row.stock * unitProfitCents)
                    return (
                      <div
                        key={row.productId}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '0.8fr 1.6fr 0.7fr 0.8fr 0.9fr 1fr 1fr 1fr 1fr 1fr 0.9fr 1fr',
                          padding: '11px 12px',
                          borderBottom: '1px solid var(--border-soft)',
                          gap: 8,
                          alignItems: 'center',
                          background: low ? 'rgba(239,68,68,0.08)' : 'transparent'
                        }}
                      >
                        <div>{row.barcode || '-'}</div>
                        <div style={{ fontWeight: 600 }}>{row.name}</div>
                        <div>{row.unit || '-'}</div>
                        <div style={{ color: low ? '#fca5a5' : '#e5e7eb', fontWeight: low ? 700 : 500 }}>
                          {row.stock.toLocaleString('uz-UZ')}
                        </div>
                        <div>{row.minStock.toLocaleString('uz-UZ')}</div>
                        <div>{formatSom(row.costCents)}</div>
                        <div>{formatSom(row.priceCents)}</div>
                        <div style={{ color: unitProfitCents >= 0 ? '#86efac' : '#fca5a5', fontWeight: 700 }}>
                          {formatSom(unitProfitCents)}
                        </div>
                        <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{formatSom(row.stockValueCents)}</div>
                        <div style={{ color: stockProfitCents >= 0 ? '#86efac' : '#fca5a5', fontWeight: 700 }}>
                          {formatSom(stockProfitCents)}
                        </div>
                        <div>{row.soldQty.toLocaleString('uz-UZ')}</div>
                        <div>{formatSom(row.soldCents)}</div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  )
}
