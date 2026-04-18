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
  const width = collapsed ? '52px' : '200px'
  return (
    <aside
      style={{
        width,
        background: 'var(--surface)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '10px 6px' : '14px',
        gap: '10px',
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
        {!collapsed && (
          <div style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.4px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {title}
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          style={{
            border: 'none',
            background: 'var(--surface-3)',
            color: '#f9fafb',
            borderRadius: '6px',
            width: '28px',
            height: '28px',
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {sections.map((section) => {
          const active = section.id === activeSection
          return (
            <button
              key={section.id}
              onClick={() => onNavigate(section.id)}
              title={collapsed ? section.label : undefined}
              style={{
                textAlign: 'left',
                background: active ? 'var(--surface-3)' : 'rgba(255,255,255,0.03)',
                border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: '6px',
                padding: collapsed ? '8px 6px' : '9px 10px',
                color: '#f9fafb',
                cursor: 'pointer',
                fontSize: collapsed ? 13 : 12,
                transition: 'all 120ms ease',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis'
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
