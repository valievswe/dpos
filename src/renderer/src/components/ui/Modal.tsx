import React from 'react'
import { Button } from './Button'

type Props = {
  open: boolean
  title?: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}

export function Modal({ open, title, onClose, children, width = 520 }: Props): React.ReactElement | null {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: '90vw',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg)',
          padding: 18,
          color: '#f9fafb'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Yopish">
            Yopish
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal
