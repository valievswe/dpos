import React from 'react'
import { Button } from './Button'

type PaginationProps = {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

export function Pagination({ page, totalPages, onChange }: PaginationProps): React.ReactElement | null {
  if (totalPages <= 1) return null
  const canPrev = page > 1
  const canNext = page < totalPages
  const go = (p: number) => onChange(Math.min(Math.max(p, 1), totalPages))

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 }}>
      <Button variant="ghost" size="sm" disabled={!canPrev} onClick={() => go(page - 1)} style={{ opacity: canPrev ? 1 : 0.4 }}>
        Oldingi
      </Button>
      <div style={{ color: '#e5e7eb', fontWeight: 700 }}>
        {page} / {totalPages}
      </div>
      <Button variant="ghost" size="sm" disabled={!canNext} onClick={() => go(page + 1)} style={{ opacity: canNext ? 1 : 0.4 }}>
        Keyingi
      </Button>
    </div>
  )
}

export default Pagination
