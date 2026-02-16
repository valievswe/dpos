import React, { useEffect, useMemo, useState } from 'react'
import { DateRangeFilter } from './ui/DateRangeFilter'
import { Modal } from './ui/Modal'
import { Pagination } from './ui/Pagination'
import { Button } from './ui/Button'

type DebtRecord = {
  id: number
  customerId: number
  customerName: string
  saleId?: number
  description: string
  debtDate: string
  paymentDate?: string
  status: 'paid' | 'unpaid'
  totalCents: number
  paidCents: number
  remainingCents: number
  items: {
    productName: string
    unitPriceCents: number
    quantity: number
    lineTotalCents: number
  }[]
}

type DebtStatusFilter = 'all' | 'paid' | 'unpaid'

const TASHKENT_TZ = 'Asia/Tashkent'

const parseDate = (raw?: string): Date | null => {
  if (!raw) return null
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized)
  const parsed = new Date(hasZone ? normalized : `${normalized}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function Debts(): React.ReactElement {
  const [rows, setRows] = useState<DebtRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DebtStatusFilter>('all')
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})

  const [page, setPage] = useState(1)
  const pageSize = 10

  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [paying, setPaying] = useState(false)

  const [clearModalOpen, setClearModalOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deletingDebtId, setDeletingDebtId] = useState<number | null>(null)

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

  const statusLabel = (status: DebtRecord['status']) => {
    return status === 'paid' ? "To'langan" : 'To\'lanmagan'
  }

  const loadDebts = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.getDebts()
      setRows(data)
    } catch (e: any) {
      setError(e?.message ?? "Qarz yozuvlarini yuklab bo'lmadi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDebts()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, dateRange])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()

    return rows.filter((r) => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter
      const rowDateKey = dateKey(r.debtDate)
      const matchesFrom = !dateRange.from || (rowDateKey && rowDateKey >= dateRange.from)
      const matchesTo = !dateRange.to || (rowDateKey && rowDateKey <= dateRange.to)

      const productNames = r.items.map((i) => i.productName.toLowerCase()).join(' ')
      const matchesSearch =
        !term ||
        r.customerName.toLowerCase().includes(term) ||
        String(r.id).includes(term) ||
        String(r.saleId ?? '').includes(term) ||
        r.description.toLowerCase().includes(term) ||
        productNames.includes(term)

      return matchesStatus && matchesFrom && matchesTo && matchesSearch
    })
  }, [rows, search, statusFilter, dateRange, tzDateKeyFormatter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  const buildExportRows = (sourceRows: DebtRecord[]) => {
    const exportRows: (string | number)[][] = []

    sourceRows.forEach((debt) => {
      if (debt.items.length === 0) {
        exportRows.push([
          debt.id,
          debt.customerName,
          formatDateTime(debt.debtDate),
          statusLabel(debt.status),
          formatDateTime(debt.paymentDate),
          '',
          '',
          '',
          '',
          debt.totalCents / 100,
          debt.paidCents / 100,
          debt.remainingCents / 100
        ])
        return
      }

      debt.items.forEach((item) => {
        exportRows.push([
          debt.id,
          debt.customerName,
          formatDateTime(debt.debtDate),
          statusLabel(debt.status),
          formatDateTime(debt.paymentDate),
          item.productName,
          item.unitPriceCents / 100,
          item.quantity,
          item.lineTotalCents / 100,
          debt.totalCents / 100,
          debt.paidCents / 100,
          debt.remainingCents / 100
        ])
      })
    })

    return exportRows
  }

  const exportDebts = async (sourceRows: DebtRecord[], filePrefix: string) => {
    if (exporting) return false
    setExporting(true)
    setError(null)
    try {
      const headers = [
        'Qarz ID',
        'Mijoz',
        'Qarz sanasi',
        'Holat',
        "To'lov sanasi",
        'Mahsulot',
        'Birlik narx (so\'m)',
        'Miqdor',
        'Mahsulot jami (so\'m)',
        'Qarz jami (so\'m)',
        "To'langan (so'm)",
        "Qoldiq (so'm)"
      ]

      const rowsForExport = buildExportRows(sourceRows)
      if (rowsForExport.length === 0) {
        setError("Eksport uchun qarz yozuvi yo'q")
        return false
      }

      const fileName = `${filePrefix}_${tzDateKeyFormatter.format(new Date())}.xlsx`
      const res = await window.api.exportSalesExcel({
        headers,
        rows: rowsForExport,
        fileName,
        sheetName: 'Debts'
      })

      if (!res.success && !res.cancelled) {
        setError('Excel eksportda xatolik')
        return false
      }

      if (res.success) {
        setMessage('Excel eksport tayyor')
      }

      return res.success
    } catch {
      setError('Excel eksportda xatolik')
      return false
    } finally {
      setExporting(false)
    }
  }

  const openPaymentModal = (debt: DebtRecord) => {
    setSelectedDebt(debt)
    setPayAmount((debt.remainingCents / 100).toString())
    setError(null)
    setMessage(null)
  }

  const closePaymentModal = () => {
    setSelectedDebt(null)
    setPayAmount('')
    setPaying(false)
  }

  const submitDebtPayment = async () => {
    if (!selectedDebt) return

    const amountSom = Number(payAmount)
    if (!Number.isFinite(amountSom) || amountSom <= 0) {
      setError("To'lov summasini to'g'ri kiriting")
      return
    }

    setPaying(true)
    setError(null)
    setMessage(null)

    try {
      const result = await window.api.payDebtRecord(selectedDebt.id, Math.round(amountSom * 100))
      if (result.success) {
        setMessage(
          `${(result.appliedCents / 100).toLocaleString('uz-UZ')} so'm to'lov qabul qilindi${result.fullyPaid ? " (qarz yopildi)" : ''}`
        )
      }
      closePaymentModal()
      await loadDebts()
    } catch (e: any) {
      setError(e?.message ?? "To'lovni yozishda xatolik")
    } finally {
      setPaying(false)
    }
  }

  const deleteDebtRecord = async (debt: DebtRecord) => {
    const ok = window.confirm(
      `Qarz #${debt.id} yozuvini o'chirasizmi? Bu faqat qarz yozuvini tozalaydi.`
    )
    if (!ok) return

    setDeletingDebtId(debt.id)
    setError(null)
    setMessage(null)

    try {
      await window.api.deleteDebtRecord(debt.id)
      setMessage(`Qarz #${debt.id} o'chirildi`)
      await loadDebts()
    } catch (e: any) {
      setError(e?.message ?? "Qarz yozuvini o'chirib bo'lmadi")
    } finally {
      setDeletingDebtId(null)
    }
  }

  const clearAllDebts = async () => {
    const finalOk = window.confirm(
      "Barcha qarz va qarz to'lov yozuvlarini tozalaysizmi? Bu amalni ortga qaytarib bo'lmaydi."
    )
    if (!finalOk) return

    setClearing(true)
    setError(null)
    setMessage(null)

    try {
      await window.api.clearDebtsRecords()
      setMessage("Barcha qarz yozuvlari tozalandi")
      setClearModalOpen(false)
      await loadDebts()
    } catch (e: any) {
      setError(e?.message ?? "Qarz yozuvlarini tozalashda xatolik")
    } finally {
      setClearing(false)
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
        <h3 style={{ margin: 0, color: '#f9fafb' }}>Qarzlar</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qarz ID / mijoz / mahsulot"
            style={{
              padding: '10px 12px',
              borderRadius: '5px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb',
              minWidth: 220
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DebtStatusFilter)}
            style={{
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          >
            <option value="all">Barcha holatlar</option>
            <option value="unpaid">To'lanmagan</option>
            <option value="paid">To'langan</option>
          </select>
          <Button variant="ghost" size="sm" onClick={loadDebts}>
            Yangilash
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportDebts(filteredRows, 'debts_filtered')} disabled={exporting}>
            {exporting ? 'Eksport...' : 'Excel eksport'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setClearModalOpen(true)} disabled={clearing}>
            Qarzlarni tozalash
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <DateRangeFilter from={dateRange.from} to={dateRange.to} onChange={(range) => setDateRange(range)} />
      </div>

      {message && <div style={{ color: 'var(--success)', marginTop: 10 }}>{message}</div>}
      {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}

      <div style={{ border: '1px solid var(--border)', borderRadius: '5px', marginTop: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1300 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1.2fr 1.2fr 0.9fr 1.2fr 2fr 0.9fr 1.1fr 1fr',
                padding: '12px 14px',
                color: 'var(--muted)',
                fontWeight: 700,
                background: 'var(--surface-3)',
                borderBottom: '1px solid var(--border-soft)',
                gap: 8
              }}
            >
              <div>Qarz ID</div>
              <div>Mijoz</div>
              <div>Qarz sanasi</div>
              <div>Holat</div>
              <div>To'lov sanasi</div>
              <div>Mahsulotlar</div>
              <div>Miqdor</div>
              <div>Mahsulot jami</div>
              <div>Amallar</div>
            </div>

            <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 16, color: 'var(--muted)' }}>Yuklanmoqda...</div>
              ) : pageRows.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--muted)' }}>Mos qarz yozuvi topilmadi.</div>
              ) : (
                pageRows.map((r) => {
                  const totalQty = r.items.reduce((sum, item) => sum + item.quantity, 0)
                  const totalProductsCents = r.items.reduce((sum, item) => sum + item.lineTotalCents, 0)
                  const productInfo =
                    r.items.length > 0
                      ? r.items
                          .map(
                            (item) =>
                              `${item.productName} (${(item.unitPriceCents / 100).toLocaleString('uz-UZ')} so'm x ${item.quantity})`
                          )
                          .join(', ')
                      : r.description || '-'

                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '0.7fr 1.2fr 1.2fr 0.9fr 1.2fr 2fr 0.9fr 1.1fr 1fr',
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--border-soft)',
                        gap: 8,
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{r.id}</div>
                      <div>{r.customerName}</div>
                      <div>{formatDateTime(r.debtDate)}</div>
                      <div>
                        <span
                          style={{
                            padding: '6px 10px',
                            borderRadius: 5,
                            border: '1px solid var(--border)',
                            background:
                              r.status === 'paid' ? 'rgba(52,211,153,0.14)' : 'rgba(251,191,36,0.14)',
                            color: r.status === 'paid' ? '#bbf7d0' : '#fef3c7',
                            fontWeight: 700
                          }}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </div>
                      <div>{formatDateTime(r.paymentDate)}</div>
                      <div style={{ color: '#e5e7eb' }}>{productInfo}</div>
                      <div>{totalQty.toLocaleString('uz-UZ')}</div>
                      <div style={{ color: 'var(--accent)', fontWeight: 800 }}>
                        {(totalProductsCents / 100).toLocaleString('uz-UZ')} so'm
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={r.status === 'paid'}
                          onClick={() => openPaymentModal(r)}
                        >
                          To'lash
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingDebtId === r.id}
                          onClick={() => deleteDebtRecord(r)}
                        >
                          O'chirish
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <Modal
        open={!!selectedDebt}
        onClose={closePaymentModal}
        title={selectedDebt ? `Qarz #${selectedDebt.id} to'lovi` : ''}
        width={520}
      >
        {selectedDebt && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 5,
                background: 'var(--surface-3)',
                padding: 12,
                display: 'grid',
                gap: 6
              }}
            >
              <div style={{ color: 'var(--muted)' }}>Mijoz</div>
              <div style={{ fontWeight: 700 }}>{selectedDebt.customerName}</div>
              <div style={{ color: 'var(--muted)', marginTop: 6 }}>Qoldiq</div>
              <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.1rem' }}>
                {(selectedDebt.remainingCents / 100).toLocaleString('uz-UZ')} so'm
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--muted)' }}>
              To'lov summasi (so'm)
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                style={{
                  padding: '12px',
                  borderRadius: '5px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-3)',
                  color: '#f9fafb'
                }}
              />
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={closePaymentModal}>
                Bekor qilish
              </Button>
              <Button variant="outline" size="sm" disabled={paying} onClick={submitDebtPayment}>
                {paying ? 'Saqlanmoqda...' : "To'lovni saqlash"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={clearModalOpen} onClose={() => setClearModalOpen(false)} title="Qarzlarni tozalash" width={560}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
            Tozalashdan oldin barcha qarz yozuvlarini Excelga eksport qilasizmi? Tavsiya: avval eksport qiling,
            keyin tozalang.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportDebts(rows, 'debts_all_before_clear')}
              disabled={exporting || clearing}
            >
              {exporting ? 'Eksport...' : 'Avval eksport qilish'}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAllDebts} disabled={clearing || exporting}>
              {clearing ? 'Tozalanmoqda...' : 'Eksportsiz tozalash'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setClearModalOpen(false)} disabled={clearing || exporting}>
              Bekor qilish
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
