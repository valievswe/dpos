import React from 'react'

type SidebarProps = {
  title: string
  sections: { id: string; label: string }[]
  activeSection: string
  collapsed: boolean
  onNavigate: (id: string) => void
  onToggle: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ title, sections, activeSection, collapsed, onNavigate, onToggle }) => {
  const width = collapsed ? '70px' : '220px'
  return (
    <aside
      style={{
        width,
        background: '#111827',
        color: '#f3f4f6',
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '16px 10px' : '20px',
        gap: '18px',
        minHeight: '100vh'
      }}
    >
      <div style={{ display: 'flex', justifyContent: collapsed ? 'center' : 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{collapsed ? 'DP' : title}</div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            border: 'none',
            background: '#1f2937',
            color: '#f9fafb',
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            cursor: 'pointer'
          }}
        >
          {collapsed ? '›' : '‹'}
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
                background: active ? '#1f2937' : 'transparent',
                border: active ? '1px solid #6ee7b7' : '1px solid #374151',
                borderRadius: '6px',
                padding: collapsed ? '10px 8px' : '10px',
                color: '#f9fafb',
                cursor: 'pointer'
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
