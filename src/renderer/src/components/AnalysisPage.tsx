import React, { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Button'
import { DateRangeFilter } from './ui/DateRangeFilter'

type AnalyticsPaymentRow = {
  method: string
  salesCount: number
  totalCents: number
}

type AnalyticsDailyRow = {
  day: string
  salesCount: number
  totalCents: number
}

type AnalyticsTopProductRow = {
  productId: number
  productName: string
  qty: number
  revenueCents: number
  avgPriceCents: number
}

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
    salesCount: number
    totalCents: number
    returnedCents: number
    netSalesCents: number
    discountCents: number
    debtCents: number
    refundCents: number
    debtReducedByReturnsCents: number
    grossProfitCents: number
    netProfitCents: number
    avgCheckCents: number
  }
  previousSummary: null | {
    salesCount: number
    totalCents: number
    discountCents: number
    debtCents: number
    avgCheckCents: number
  }
  comparison: null | {
    totalPct: number | null
    salesCountPct: number | null
    avgCheckPct: number | null
  }
  payments: AnalyticsPaymentRow[]
  daily: AnalyticsDailyRow[]
  topProducts: AnalyticsTopProductRow[]
  inventory: AnalyticsInventoryRow[]
}

const emptyReport: AnalyticsReport = {
  period: {},
  summary: {
    salesCount: 0,
    totalCents: 0,
    returnedCents: 0,
    netSalesCents: 0,
    discountCents: 0,
    debtCents: 0,
    refundCents: 0,
    debtReducedByReturnsCents: 0,
    grossProfitCents: 0,
    netProfitCents: 0,
    avgCheckCents: 0
  },
  previousSummary: null,
  comparison: null,
  payments: [],
  daily: [],
  topProducts: [],
  inventory: []
}

const formatSom = (cents: number) => `${(cents / 100).toLocaleString('uz-UZ')} so'm`

const paymentLabel = (method: string) => {
  if (method === 'cash') return 'Naqd'
  if (method === 'card') return 'Karta'
  if (method === 'mixed') return 'Qisman'
  if (method === 'debt') return 'Qarz'
  return method
}

const compareText = (value: number | null) => {
  if (value === null) return 'Taqqoslash uchun oldingi davrda ma\'lumot yo\'q'
  if (value === 0) return 'O\'zgarish yo\'q'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
}

const toMonthInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

const shiftMonth = (monthValue: string, diff: number) => {
  const [yearStr, monthStr] = monthValue.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthValue
  const date = new Date(Date.UTC(year, month - 1 + diff, 1))
  return toMonthInput(date)
}

const monthRange = (monthValue: string): { from: string; to: string } => {
  const [yearStr, monthStr] = monthValue.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`
  return { from, to }
}

const monthLabel = (monthValue: string): string => {
  const [yearStr, monthStr] = monthValue.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthValue
  const uzMonths = [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentabr',
    'oktabr',
    'noyabr',
    'dekabr'
  ]
  return `${uzMonths[Math.max(0, Math.min(11, month - 1))]} ${year}`
}

const pct = (value: number, total: number) => {
  if (total <= 0) return 0
  return Number(((value / total) * 100).toFixed(2))
}

export function AnalysisPage(): React.ReactElement {
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<AnalyticsReport>(emptyReport)
  const [exporting, setExporting] = useState(false)

  const [monthA, setMonthA] = useState(() => toMonthInput(new Date()))
  const [monthB, setMonthB] = useState(() => shiftMonth(toMonthInput(new Date()), -1))
  const [monthAReport, setMonthAReport] = useState<AnalyticsReport | null>(null)
  const [monthBReport, setMonthBReport] = useState<AnalyticsReport | null>(null)
  const [monthCompareLoading, setMonthCompareLoading] = useState(false)

  const loadReport = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.getAnalyticsReport(dateRange)
      setReport(data)
    } catch (e: any) {
      setError(e?.message ?? 'Analitika ma\'lumotlarini yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
  }, [dateRange.from, dateRange.to])

  useEffect(() => {
    const loadMonthlyCompare = async () => {
      setMonthCompareLoading(true)
      try {
        const [a, b] = await Promise.all([
          window.api.getAnalyticsReport(monthRange(monthA)),
          window.api.getAnalyticsReport(monthRange(monthB))
        ])
        setMonthAReport(a)
        setMonthBReport(b)
      } catch {
        setMonthAReport(null)
        setMonthBReport(null)
      } finally {
        setMonthCompareLoading(false)
      }
    }
    loadMonthlyCompare()
  }, [monthA, monthB])

  const totalPaymentsCents = useMemo(() => report.payments.reduce((sum, row) => sum + row.totalCents, 0), [report.payments])
  const storeGeneralProfitCents = useMemo(
    () =>
      report.inventory.reduce(
        (sum, row) =>
          sum +
          Math.round(Number(row.stock ?? 0) * (Number(row.priceCents ?? 0) - Number(row.costCents ?? 0))),
        0
      ),
    [report.inventory]
  )

  const monthFactorRows = useMemo(() => {
    if (!monthAReport || !monthBReport) return []
    const a = monthAReport.summary
    const b = monthBReport.summary
    return [
      { label: 'Umumiy tushum', aValue: a.totalCents, bValue: b.totalCents, format: 'money' as const },
      { label: 'Sotuvlar soni', aValue: a.salesCount, bValue: b.salesCount, format: 'count' as const },
      { label: "O'rtacha chek", aValue: a.avgCheckCents, bValue: b.avgCheckCents, format: 'money' as const },
      { label: "Qarz qoldig'i ulushi", aValue: pct(a.debtCents, a.totalCents), bValue: pct(b.debtCents, b.totalCents), format: 'percent' as const },
      { label: 'Chegirma ulushi', aValue: pct(a.discountCents, a.totalCents), bValue: pct(b.discountCents, b.totalCents), format: 'percent' as const }
    ]
  }, [monthAReport, monthBReport])

  const exportSummary = async () => {
    if (exporting) return
    setExporting(true)
    setError(null)
    try {
      const periodText = report.period.from && report.period.to ? `${report.period.from} - ${report.period.to}` : 'Barcha davr'
      const headers = ['Ko\'rsatkich', 'Qiymat']
      const rows: (string | number)[][] = [
        ['Davr', periodText],
        ['Sotuvlar soni', report.summary.salesCount],
        ['Umumiy sotuv (so\'m)', report.summary.totalCents / 100],
        ['Qaytarilgan summa (so\'m)', report.summary.returnedCents / 100],
        ['Sof sotuv (so\'m)', report.summary.netSalesCents / 100],
        ['Pul qaytarilgan (so\'m)', report.summary.refundCents / 100],
        ['Qarzdan yechilgan (so\'m)', report.summary.debtReducedByReturnsCents / 100],
        ['Chegirma (so\'m)', report.summary.discountCents / 100],
        ['Qarz qoldig\'i (so\'m)', report.summary.debtCents / 100],
        ['Do\'kon umumiy foyda (so\'m)', storeGeneralProfitCents / 100],
        ['Joriy sotilgan mahsulot foydasi (so\'m)', report.summary.netProfitCents / 100],
        ['Brutto foyda (so\'m)', report.summary.grossProfitCents / 100],
        ['Sof foyda (so\'m)', report.summary.netProfitCents / 100],
        ["O'rtacha chek (so'm)", report.summary.avgCheckCents / 100],
        ['Tushum o\'zgarishi (%)', report.comparison?.totalPct ?? 'N/A'],
        ['Sotuv soni o\'zgarishi (%)', report.comparison?.salesCountPct ?? 'N/A'],
        ["O'rtacha chek o'zgarishi (%)", report.comparison?.avgCheckPct ?? 'N/A']
      ]

      report.payments.forEach((p) => {
        rows.push([`To'lov: ${paymentLabel(p.method)} (so'm)`, p.totalCents / 100])
      })

      await window.api.exportSalesExcel({
        headers,
        rows,
        fileName: 'analitika_hisobot.xlsx',
        sheetName: 'Analitika'
      })
    } catch {
      setError('Analitika eksportida xatolik')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14, minHeight: 0 }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: '#f9fafb' }}>Analitika</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={loadReport}>Yangilash</Button>
            <Button variant="outline" size="sm" onClick={exportSummary} disabled={exporting}>
              {exporting ? 'Eksport...' : 'Analitika XLSX'}
            </Button>
          </div>
        </div>

        <DateRangeFilter from={dateRange.from} to={dateRange.to} onChange={(range) => setDateRange(range)} />
        {loading && <div style={{ color: 'var(--muted)' }}>Analitika yuklanmoqda...</div>}
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>Umumiy sotuv</div>
          <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(report.summary.totalCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{compareText(report.comparison?.totalPct ?? null)}</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>Qaytarilgan summa</div>
          <div style={{ color: '#fda4af', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(report.summary.returnedCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Pul qaytarilgan: {formatSom(report.summary.refundCents)}</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>Sof sotuv</div>
          <div style={{ color: '#e5e7eb', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(report.summary.netSalesCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Qaytishdan keyingi natija</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>Sotuvlar soni</div>
          <div style={{ color: '#f9fafb', fontWeight: 800, fontSize: '1.25rem' }}>{report.summary.salesCount}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{compareText(report.comparison?.salesCountPct ?? null)}</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>O'rtacha chek</div>
          <div style={{ color: '#f9fafb', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(report.summary.avgCheckCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{compareText(report.comparison?.avgCheckPct ?? null)}</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>Qarz qoldig'i</div>
          <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(report.summary.debtCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Qarzdan yechilgan: {formatSom(report.summary.debtReducedByReturnsCents)}</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>Do'kon umumiy foyda</div>
          <div style={{ color: '#86efac', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(storeGeneralProfitCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Qoldiq * (Sotuv narxi - Tannarx)</div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>Joriy sotilgan mahsulot foydasi</div>
          <div style={{ color: '#bbf7d0', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(report.summary.netProfitCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Brutto: {formatSom(report.summary.grossProfitCents)}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>2 oylik taqqoslash (asosiy faktorlar)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
              Oy A
              <input type="month" value={monthA} onChange={(e) => setMonthA(e.target.value)} style={{ padding: '8px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-3)', color: '#f9fafb' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
              Oy B
              <input type="month" value={monthB} onChange={(e) => setMonthB(e.target.value)} style={{ padding: '8px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-3)', color: '#f9fafb' }} />
            </label>
          </div>
        </div>

        {monthCompareLoading && <div style={{ color: 'var(--muted)' }}>Taqqoslash yuklanmoqda...</div>}
        {!monthCompareLoading && (!monthAReport || !monthBReport) && <div style={{ color: 'var(--muted)' }}>Taqqoslash ma'lumotini olishda xatolik bo'ldi.</div>}
        {!monthCompareLoading && monthAReport && monthBReport && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-3)', padding: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{monthLabel(monthA)}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {monthFactorRows.map((row) => (
                  <div key={`a-${row.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                    <strong>{row.format === 'money' ? formatSom(row.aValue) : row.format === 'percent' ? `${row.aValue.toFixed(2)}%` : row.aValue.toLocaleString('uz-UZ')}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-3)', padding: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{monthLabel(monthB)}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {monthFactorRows.map((row) => (
                  <div key={`b-${row.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                    <strong>{row.format === 'money' ? formatSom(row.bValue) : row.format === 'percent' ? `${row.bValue.toFixed(2)}%` : row.bValue.toLocaleString('uz-UZ')}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>To'lov turlari ulushi</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border-soft)' }}>
                <th>To'lov turi</th>
                <th style={{ textAlign: 'right' }}>Sotuv soni</th>
                <th style={{ textAlign: 'right' }}>Summa</th>
                <th style={{ textAlign: 'right' }}>Ulushi</th>
              </tr>
            </thead>
            <tbody>
              {report.payments.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center' }}>
                    Ma'lumot yo'q
                  </td>
                </tr>
              )}
              {report.payments.map((p) => {
                const share = totalPaymentsCents > 0 ? (p.totalCents / totalPaymentsCents) * 100 : 0
                return (
                  <tr key={p.method} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td>{paymentLabel(p.method)}</td>
                    <td style={{ textAlign: 'right' }}>{p.salesCount.toLocaleString('uz-UZ')}</td>
                    <td style={{ textAlign: 'right' }}>{formatSom(p.totalCents)}</td>
                    <td style={{ textAlign: 'right' }}>{share.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Eng ko'p daromad bergan mahsulotlar (Top 10)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border-soft)' }}>
                <th>Mahsulot</th>
                <th style={{ textAlign: 'right' }}>Sotilgan miqdor</th>
                <th style={{ textAlign: 'right' }}>Tushum</th>
                <th style={{ textAlign: 'right' }}>O'rtacha narx</th>
              </tr>
            </thead>
            <tbody>
              {report.topProducts.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center' }}>
                    Ma'lumot yo'q
                  </td>
                </tr>
              )}
              {report.topProducts.map((row) => (
                <tr key={row.productId} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ fontWeight: 600 }}>{row.productName}</td>
                  <td style={{ textAlign: 'right' }}>{row.qty.toLocaleString('uz-UZ')}</td>
                  <td style={{ textAlign: 'right' }}>{formatSom(row.revenueCents)}</td>
                  <td style={{ textAlign: 'right' }}>{formatSom(row.avgPriceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
