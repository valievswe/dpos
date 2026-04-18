import React, { useEffect, useState } from 'react'
import { Button } from './ui/Button'

type PrinterRowProps = {
  label: string
  value: string
  onChange: (v: string) => void
  installedPrinters: string[]
  onTest: () => void
  testing: boolean
  testResult: { ok: boolean; msg: string } | null
}

function PrinterRow({ label, value, onChange, installedPrinters, onTest, testing, testResult }: PrinterRowProps) {
  const isKnown = installedPrinters.length === 0 || installedPrinters.includes(value.trim())
  const selectVal = installedPrinters.includes(value.trim()) ? value.trim() : '__manual__'

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
        {!isKnown && value.trim() && (
          <span style={{ fontSize: 11, background: 'rgba(251,191,36,0.15)', color: 'var(--warning)', border: '1px solid var(--warning)', borderRadius: 4, padding: '1px 6px' }}>
            Windows-da topilmadi
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {installedPrinters.length > 0 ? (
          <select
            value={selectVal}
            onChange={(e) => {
              if (e.target.value !== '__manual__') onChange(e.target.value)
              else onChange('')
            }}
            style={{
              flex: 1,
              padding: '9px 10px',
              borderRadius: 6,
              border: `1px solid ${isKnown ? 'var(--border)' : 'var(--warning)'}`,
              background: 'var(--surface-3)',
              color: '#f9fafb',
              cursor: 'pointer'
            }}
          >
            <option value="__manual__" disabled>— tanlang —</option>
            {installedPrinters.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="printer nomi"
            style={{
              flex: 1,
              padding: '9px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          />
        )}

        <button
          type="button"
          onClick={onTest}
          disabled={testing || !value.trim()}
          style={{
            padding: '9px 14px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface-3)',
            color: 'var(--accent)',
            cursor: testing || !value.trim() ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            opacity: testing || !value.trim() ? 0.5 : 1
          }}
        >
          {testing ? '...' : 'Test'}
        </button>
      </div>

      {/* Manual input shown when selected value is not in list */}
      {installedPrinters.length > 0 && !installedPrinters.includes(value.trim()) && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Qo'lda printer nomi kiriting"
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid var(--warning)',
            background: 'var(--surface-3)',
            color: '#f9fafb',
            fontSize: 13
          }}
        />
      )}

      {testResult && (
        <div style={{ fontSize: 12, color: testResult.ok ? 'var(--success)' : 'var(--danger)', padding: '4px 0' }}>
          {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
        </div>
      )}
    </div>
  )
}

type Props = {
  ownerUsername: string | null
  onLogout: () => Promise<void>
}

export function SecuritySettings({ ownerUsername, onLogout }: Props): React.ReactElement {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const [labelPrinter, setLabelPrinter] = useState('label')
  const [receiptPrinter, setReceiptPrinter] = useState('receipt')
  const [installedPrinters, setInstalledPrinters] = useState<string[]>([])
  const [printerSaving, setPrinterSaving] = useState(false)
  const [printerMessage, setPrinterMessage] = useState<string | null>(null)
  const [printerError, setPrinterError] = useState<string | null>(null)
  const [labelTesting, setLabelTesting] = useState(false)
  const [receiptTesting, setReceiptTesting] = useState(false)
  const [labelTestResult, setLabelTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [receiptTestResult, setReceiptTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    window.api.getPrinterSettings().then((s) => {
      setLabelPrinter(s.labelPrinter)
      setReceiptPrinter(s.receiptPrinter)
    }).catch(() => {})
    window.api.getInstalledPrinters().then(setInstalledPrinters).catch(() => {})
  }, [])

  const savePrinterSettings = async () => {
    setPrinterMessage(null)
    setPrinterError(null)
    if (!labelPrinter.trim() || !receiptPrinter.trim()) {
      setPrinterError("Printer nomini kiriting")
      return
    }
    setPrinterSaving(true)
    try {
      await window.api.setPrinterSettings({ labelPrinter: labelPrinter.trim(), receiptPrinter: receiptPrinter.trim() })
      setPrinterMessage("Printer sozlamalari saqlandi")
    } catch (e: any) {
      setPrinterError(e?.message ?? "Saqlashda xatolik")
    } finally {
      setPrinterSaving(false)
    }
  }

  const testReceipt = async () => {
    setReceiptTesting(true)
    setReceiptTestResult(null)
    try {
      const res = await window.api.testPrintReceipt(receiptPrinter.trim())
      setReceiptTestResult(res.success ? { ok: true, msg: 'Test chek yuborildi' } : { ok: false, msg: res.error ?? 'Xatolik' })
    } catch (e: any) {
      setReceiptTestResult({ ok: false, msg: e?.message ?? 'Xatolik' })
    } finally {
      setReceiptTesting(false)
    }
  }

  const testLabel = async () => {
    setLabelTesting(true)
    setLabelTestResult(null)
    try {
      const res = await window.api.testPrintLabel(labelPrinter.trim())
      setLabelTestResult(res.success ? { ok: true, msg: 'Test yorliq yuborildi' } : { ok: false, msg: res.error ?? 'Xatolik' })
    } catch (e: any) {
      setLabelTestResult({ ok: false, msg: e?.message ?? 'Xatolik' })
    } finally {
      setLabelTesting(false)
    }
  }

  const changePassword = async () => {
    setMessage(null)
    setError(null)
    if (!currentPassword || !newPassword) {
      setError('Joriy va yangi parolni kiriting')
      return
    }
    if (newPassword.length < 4) {
      setError('Yangi parol kamida 4 belgidan iborat bo\'lsin')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Yangi parol tasdig\'i mos emas')
      return
    }

    setSaving(true)
    try {
      await window.api.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Parol muvaffaqiyatli yangilandi')
    } catch (e: any) {
      setError(e?.message ?? 'Parolni yangilashda xatolik')
    } finally {
      setSaving(false)
    }
  }

  const logout = async () => {
    setLoggingOut(true)
    try {
      await onLogout()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--surface-2)',
        boxShadow: 'var(--shadow-sm)',
        padding: 16,
        display: 'grid',
        gap: 12,
        maxWidth: 720
      }}
    >
      <h3 style={{ margin: 0, color: '#f9fafb' }}>Xavfsizlik sozlamalari</h3>
      <div style={{ color: 'var(--muted)' }}>Do'kondor login: <strong style={{ color: '#f9fafb' }}>{ownerUsername ?? '-'}</strong></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6, color: 'var(--muted)' }}>
          Joriy parol
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={{
              padding: '12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6, color: 'var(--muted)' }}>
          Yangi parol
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{
              padding: '12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 6, color: 'var(--muted)' }}>
        Yangi parol tasdiqlash
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{
            padding: '12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface-3)',
            color: '#f9fafb'
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="outline" size="sm" onClick={changePassword} disabled={saving}>
          {saving ? 'Saqlanmoqda...' : 'Parolni yangilash'}
        </Button>
        <Button variant="ghost" size="sm" onClick={logout} disabled={loggingOut}>
          {loggingOut ? 'Chiqilmoqda...' : 'Tizimdan chiqish'}
        </Button>
      </div>

      {message && <div style={{ color: 'var(--success)' }}>{message}</div>}
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

      <h3 style={{ margin: 0, color: '#f9fafb' }}>Printer sozlamalari</h3>

      <div style={{ display: 'grid', gap: 14 }}>
        <PrinterRow
          label="Yorliq printer (barcode)"
          value={labelPrinter}
          onChange={setLabelPrinter}
          installedPrinters={installedPrinters}
          onTest={testLabel}
          testing={labelTesting}
          testResult={labelTestResult}
        />
        <PrinterRow
          label="Chek printer (receipt)"
          value={receiptPrinter}
          onChange={setReceiptPrinter}
          installedPrinters={installedPrinters}
          onTest={testReceipt}
          testing={receiptTesting}
          testResult={receiptTestResult}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="outline" size="sm" onClick={savePrinterSettings} disabled={printerSaving}>
          {printerSaving ? 'Saqlanmoqda...' : 'Sozlamalarni saqlash'}
        </Button>
      </div>

      {printerMessage && <div style={{ color: 'var(--success)', fontSize: 13 }}>{printerMessage}</div>}
      {printerError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{printerError}</div>}
    </div>
  )
}
