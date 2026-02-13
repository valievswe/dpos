import React from 'react'

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
}

export function Input({ label, hint, style, ...rest }: Props) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      {label && (
        <span style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: 0.1 }}>{label}</span>
      )}
      <input
        {...rest}
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          borderRadius: '8px',
          padding: '10px 12px',
          outline: 'none',
          width: '100%',
          ...style
        }}
      />
      {hint && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</span>}
    </label>
  )
}

export default Input
