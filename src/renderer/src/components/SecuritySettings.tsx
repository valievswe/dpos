import React, { useState } from 'react'
import { Button } from './ui/Button'

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
    </div>
  )
}
