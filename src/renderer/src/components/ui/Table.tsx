import React from 'react'

type TableProps = {
  columns: { key: string; title: string; width?: string | number; align?: 'left' | 'right' }[]
  rows: React.ReactNode
}

export function Table({ columns, rows }: TableProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                textAlign: c.align ?? 'left',
                width: c.width,
                color: 'var(--muted)',
                fontWeight: 500,
                borderBottom: '1px solid var(--border)'
              }}
            >
              {c.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  )
}

export default Table
