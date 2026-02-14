import React from 'react'
import { Button } from './Button'

type Props = {
  from?: string
  to?: string
  onChange: (range: { from?: string; to?: string }) => void
}

export function DateRangeFilter({ from, to, onChange }: Props): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--muted)' }}>
        Boshlanish
        <input
          type="date"
          value={from ?? ''}
          onChange={(e) => onChange({ from: e.target.value || undefined, to })}
          style={{
            padding: '10px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface-3)',
            color: '#f9fafb'
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--muted)' }}>
        Tugash
        <input
          type="date"
          value={to ?? ''}
          onChange={(e) => onChange({ from, to: e.target.value || undefined })}
          style={{
            padding: '10px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface-3)',
            color: '#f9fafb'
          }}
        />
      </label>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange({ from: undefined, to: undefined })}
        style={{ height: 'fit-content', alignSelf: 'flex-end' }}
      >
        Tozalash
      </Button>
    </div>
  )
}

export default DateRangeFilter
