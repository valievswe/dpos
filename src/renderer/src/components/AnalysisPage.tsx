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

type AnalyticsReport = {
  period: { from?: string; to?: string }
  summary: {
    salesCount: number
    totalCents: number
    discountCents: number
    debtCents: number
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
}

const emptyReport: AnalyticsReport = {
  period: {},
  summary: { salesCount: 0, totalCents: 0, discountCents: 0, debtCents: 0, avgCheckCents: 0 },
  previousSummary: null,
  comparison: null,
  payments: [],
  daily: [],
  topProducts: []
}

const formatSom = (cents: number) => `${(cents / 100).toLocaleString('uz-UZ')} so'm`

const paymentLabel = (method: string) => {
  if (method === 'cash') return 'Naqd'
  if (method === 'card') return 'Karta'
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

  const maxDaily = useMemo(() => report.daily.reduce((m, row) => Math.max(m, row.totalCents), 0), [report.daily])
  const maxTopProduct = useMemo(() => report.topProducts.reduce((m, row) => Math.max(m, row.revenueCents), 0), [report.topProducts])
  const totalPaymentsCents = useMemo(() => report.payments.reduce((sum, row) => sum + row.totalCents, 0), [report.payments])

  const monthFactorRows = useMemo(() => {
    if (!monthAReport || !monthBReport) return []
    const a = monthAReport.summary
    const b = monthBReport.summary
    return [
      { label: 'Umumiy tushum', aValue: a.totalCents, bValue: b.totalCents, format: 'money' as const },
      { label: 'Sotuvlar soni', aValue: a.salesCount, bValue: b.salesCount, format: 'count' as const },
      { label: "O'rtacha chek", aValue: a.avgCheckCents, bValue: b.avgCheckCents, format: 'money' as const },
      { label: 'Qarz ulushi', aValue: pct(a.debtCents, a.totalCents), bValue: pct(b.debtCents, b.totalCents), format: 'percent' as const },
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
        ['Umumiy tushum (so\'m)', report.summary.totalCents / 100],
        ['Chegirma (so\'m)', report.summary.discountCents / 100],
        ['Qarzga sotuv (so\'m)', report.summary.debtCents / 100],
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
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ color: 'var(--muted)' }}>Umumiy tushum</div>
          <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(report.summary.totalCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{compareText(report.comparison?.totalPct ?? null)}</div>
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
          <div style={{ color: 'var(--muted)' }}>Qarzga sotuv</div>
          <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '1.25rem' }}>{formatSom(report.summary.debtCents)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Chegirma: {formatSom(report.summary.discountCents)}</div>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Kunlik tushum diagrammasi</div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {loading && <div style={{ color: 'var(--muted)' }}>Yuklanmoqda...</div>}
            {!loading && report.daily.length === 0 && <div style={{ color: 'var(--muted)' }}>Davrda sotuv yo'q</div>}
            {!loading && report.daily.map((row) => {
              const widthPct = maxDaily > 0 ? (row.totalCents / maxDaily) * 100 : 0
              return (
                <div key={row.day} style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{row.day}</div>
                  <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${widthPct}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-strong))' }} />
                  </div>
                  <div style={{ color: '#e5e7eb', fontSize: '0.85rem' }}>{(row.totalCents / 100).toLocaleString('uz-UZ')}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>To'lov turlari ulushi</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {report.payments.length === 0 && <div style={{ color: 'var(--muted)' }}>Ma'lumot yo'q</div>}
            {report.payments.map((p) => {
              const share = totalPaymentsCents > 0 ? (p.totalCents / totalPaymentsCents) * 100 : 0
              return (
                <div key={p.method} style={{ display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span>{paymentLabel(p.method)}</span>
                    <span style={{ color: 'var(--muted)' }}>{share.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${share}%`, height: '100%', background: p.method === 'debt' ? '#fbbf24' : 'var(--success)' }} />
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{formatSom(p.totalCents)} ({p.salesCount} ta)</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-2)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Eng ko'p daromad bergan mahsulotlar (Top 10)</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {report.topProducts.length === 0 && <div style={{ color: 'var(--muted)' }}>Ma'lumot yo'q</div>}
          {report.topProducts.map((row) => {
            const widthPct = maxTopProduct > 0 ? (row.revenueCents / maxTopProduct) * 100 : 0
            return (
              <div key={row.productId} style={{ display: 'grid', gridTemplateColumns: '1.3fr 2fr auto auto', gap: 10, alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>{row.productName}</div>
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${widthPct}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #22d3ee)' }} />
                </div>
                <div style={{ color: 'var(--muted)' }}>{row.qty.toLocaleString('uz-UZ')}</div>
                <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{formatSom(row.revenueCents)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
