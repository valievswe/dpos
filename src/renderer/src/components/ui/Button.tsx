import React from 'react'
import classNames from '../../lib/classNames'

type ButtonVariant = 'primary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'padding:6px 10px;font-size:13px;',
  md: 'padding:10px 14px;font-size:14px;'
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'background: linear-gradient(135deg, var(--accent), var(--accent-strong)); color:#0b1224; border:none;',
  ghost: 'background: rgba(255,255,255,0.04); color: var(--text); border:1px solid var(--border);',
  danger: 'background: rgba(248,113,113,0.12); color:#fecdd3; border:1px solid #f87171;'
}

export function Button({ variant = 'primary', size = 'md', loading, children, style, ...rest }: Props) {
  return (
    <button
      {...rest}
      style={{
        borderRadius: '8px',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        opacity: loading ? 0.7 : 1,
        ...inlineStyle(sizeClasses[size]),
        ...inlineStyle(variantStyles[variant]),
        ...style
      }}
      disabled={loading || rest.disabled}
    >
      {loading ? '...' : children}
    </button>
  )
}

function inlineStyle(str: string): React.CSSProperties {
  return str
    .split(';')
    .filter(Boolean)
    .reduce((acc: any, part: string) => {
      const [k, v] = part.split(':')
      const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      acc[key] = v.trim()
      return acc
    }, {})
}

export default Button
