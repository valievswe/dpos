import React from 'react'

type Props = {
  tone?: 'muted' | 'success' | 'danger' | 'info'
  children: React.ReactNode
}

const colors: Record<NonNullable<Props['tone']>, { bg: string; text: string }> = {
  muted: { bg: 'rgba(156, 163, 175, 0.15)', text: '#d1d5db' },
  success: { bg: 'rgba(52,211,153,0.2)', text: '#a7f3d0' },
  danger: { bg: 'rgba(248,113,113,0.2)', text: '#fecdd3' },
  info: { bg: 'rgba(34,211,238,0.18)', text: '#a5f3fc' }
}

export function Badge({ tone = 'muted', children }: Props) {
  const palette = colors[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '4px 8px',
        borderRadius: 999,
        background: palette.bg,
        color: palette.text,
        fontSize: 12,
        letterSpacing: 0.2
      }}
    >
      {children}
    </span>
  )
}

export default Badge
