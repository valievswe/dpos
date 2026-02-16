import React, { useState } from 'react'

type Props = {
  hasOwner: boolean
  onAuthenticated: () => void
}

export function AuthGate({ hasOwner, onAuthenticated }: Props): React.ReactElement {
  const [username, setUsername] = useState("Do'kondor")
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError(null)
    setLoading(true)
    try {
      const user = username.trim()
      if (user.length < 3) {
        setError('Login kamida 3 belgidan iborat bo\'lsin')
        return
      }
      if (password.length < 4) {
        setError('Parol kamida 4 belgidan iborat bo\'lsin')
        return
      }

      if (!hasOwner) {
        if (password !== confirmPassword) {
          setError('Parol tasdig\'i mos emas')
          return
        }
        await window.api.setupOwner(user, password)
      } else {
        await window.api.login(user, password)
      }

      setPassword('')
      setConfirmPassword('')
      onAuthenticated()
    } catch (e: any) {
      setError(e?.message ?? 'Autentifikatsiya xatoligi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'var(--bg)'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface-2)',
          boxShadow: 'var(--shadow-md)',
          padding: 20,
          display: 'grid',
          gap: 12
        }}
      >
        <h2 style={{ margin: 0, color: '#f9fafb' }}>{hasOwner ? 'Tizimga kirish' : "Do'kondor yaratish"}</h2>
        <div style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
          {hasOwner
            ? "Dasturdan foydalanish uchun Do'kondor login va parolni kiriting."
            : "Birinchi ishga tushirish: Do'kondor login va parol o'rnating."}
        </div>

        <label style={{ display: 'grid', gap: 6, color: 'var(--muted)' }}>
          Login
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
          Parol
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            style={{
              padding: '12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: '#f9fafb'
            }}
          />
        </label>

        {!hasOwner && (
          <label style={{ display: 'grid', gap: 6, color: 'var(--muted)' }}>
            Parol tasdiqlash
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              style={{
                padding: '12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface-3)',
                color: '#f9fafb'
              }}
            />
          </label>
        )}

        {error && <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{error}</div>}

        <button
          type="button"
          disabled={loading}
          onClick={submit}
          style={{
            border: 'none',
            borderRadius: 6,
            padding: '12px',
            fontWeight: 700,
            color: '#0b1224',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
            cursor: 'pointer',
            opacity: loading ? 0.75 : 1
          }}
        >
          {loading ? 'Tekshirilmoqda...' : hasOwner ? 'Kirish' : "Do'kondor yaratish"}
        </button>
      </div>
    </div>
  )
}
