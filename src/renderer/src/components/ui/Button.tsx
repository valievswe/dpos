import React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md'
  block?: boolean
}

const base: React.CSSProperties = {
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 120ms ease',
  border: '1px solid transparent'
}

const variants: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
    color: '#0b1224',
    boxShadow: 'var(--shadow-sm)',
    border: 'none'
  },
  ghost: {
    background: 'rgba(255,255,255,0.04)',
    color: '#f9fafb',
    border: '1px solid var(--border)'
  },
  outline: {
    background: 'transparent',
    color: '#e5e7eb',
    border: '1px solid var(--border)'
  },
  danger: {
    background: 'rgba(239,68,68,0.14)',
    color: '#fecdd3',
    border: '1px solid var(--border)'
  }
}

const sizes: Record<NonNullable<ButtonProps['size']>, React.CSSProperties> = {
  sm: { padding: '8px 12px', fontSize: '0.95rem' },
  md: { padding: '12px 16px', fontSize: '1rem' }
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  style,
  children,
  ...rest
}: ButtonProps): React.ReactElement {
  return (
    <button
      {...rest}
      style={{
        ...base,
        ...variants[variant],
        ...sizes[size],
        width: block ? '100%' : undefined,
        ...style
      }}
    >
      {children}
    </button>
  )
}

export default Button
