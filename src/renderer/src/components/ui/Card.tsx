import React from 'react'

type Props = {
  title?: string
  actions?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}

export function Card({ title, actions, children, style }: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '5px',
        padding: '14px',
        boxShadow: 'var(--shadow)',
        ...style
      }}
    >
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          {title && <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{actions}</div>
        </div>
      )}
      {children}
    </div>
  )
}

export default Card
