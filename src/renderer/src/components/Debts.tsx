import React, { useState } from 'react'

export function Debts(): React.ReactElement {
  const [customerId, setCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const submit = async () => {
    setResult(null)
    if (!customerId || !amount) {
      setResult("Mijoz va summa to'ldirilishi kerak")
      return
    }
    try {
      await window.api.payDebt(Number(customerId), Math.round(Number(amount) * 100))
      setResult('To‘lov muvaffaqiyatli qayd etildi')
      setAmount('')
    } catch (err: any) {
      setResult(err?.message ?? 'To‘lovni yozishda xatolik')
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px'
      }}
    >
      <div
        style={{
          padding: '16px',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          background: 'var(--surface-2)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <h3 style={{ marginTop: 0, color: '#f9fafb' }}>Qarz to‘lovi</h3>
        <p style={{ color: 'var(--muted)', marginTop: '4px' }}>
          Bu minimal forma mavjud API (`payDebt`) ustida ishlaydi. To‘liq mijoz ro‘yxati va qarz tafsilotlari keyingi
          iteratsiyada chiqariladi.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
          <span style={{ color: 'var(--muted)' }}>Mijoz ID</span>
          <input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="Masalan: 12"
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
          <span style={{ color: 'var(--muted)' }}>Summasi (so'm)</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          style={{
            marginTop: '12px',
            padding: '12px',
            width: '100%',
            borderRadius: '10px',
            border: 'none',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
            color: '#0b1224',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          To'lovni yozish
        </button>
        {result && <div style={{ marginTop: '10px', color: 'var(--accent)' }}>{result}</div>}
      </div>

      <div
        style={{
          padding: '16px',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          background: 'var(--surface-2)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <h3 style={{ marginTop: 0, color: '#f9fafb' }}>Reja</h3>
        <ul style={{ color: 'var(--muted)', paddingLeft: '18px', lineHeight: 1.6 }}>
          <li>Mijoz ro‘yxati, qarz balansi va tarixini ko‘rsatish.</li>
          <li>Qarz bo‘yicha to‘lovlarni qismlarga ajratib qayd etish.</li>
          <li>Qayta yozuvlar uchun tasdiqlash modallari va printer statuslari.</li>
          <li>Filtr: mijoz, muddat, status (ochiq/yopiq), to‘lov turi.</li>
          <li>Printerga bog‘lanadigan "Qarz kvitansiyasi" re-print.</li>
        </ul>
      </div>
    </div>
  )
}
