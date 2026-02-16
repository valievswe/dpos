import React from 'react'

type SidebarProps = {
  title: string
  sections: { id: string; label: string }[]
  activeSection: string
  collapsed: boolean
  onNavigate: (id: string) => void
  onToggle: () => void
}

const Sidebar: React.FC<SidebarProps> = ({
  title,
  sections,
  activeSection,
  collapsed,
  onNavigate,
  onToggle
}) => {
  const width = collapsed ? '72px' : '230px'
  return (
    <aside
      style={{
        width,
        background: 'var(--surface)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '14px 10px' : '20px',
        gap: '18px',
        height: '100vh',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        borderRight: '1px solid var(--border-soft)',
        boxShadow: 'var(--shadow-md)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'space-between',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <div style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.4px' }}>
          {collapsed ? 'DP' : title}
        </div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            border: 'none',
            background: 'var(--surface-3)',
            color: '#f9fafb',
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            cursor: 'pointer'
          }}
        >
          {collapsed ? '>' : '<'}
        </button>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sections.map((section) => {
          const active = section.id === activeSection
          return (
            <button
              key={section.id}
              onClick={() => onNavigate(section.id)}
              style={{
                textAlign: 'left',
                background: active ? 'var(--surface-3)' : 'rgba(255,255,255,0.03)',
                border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: '8px',
                padding: collapsed ? '10px 8px' : '12px',
                color: '#f9fafb',
                cursor: 'pointer',
                transition: 'all 120ms ease'
              }}
              type="button"
            >
              {collapsed ? section.label[0] : section.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

export default Sidebar
