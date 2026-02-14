import React, { useCallback, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import { ProductManager } from './components/ProductManager'
import { SalesPage } from './components/SalesPage'
import { SalesHistory } from './components/SalesHistory'
import { Debts } from './components/Debts'

type SectionId = 'sales' | 'inventory' | 'history' | 'debts'

function App(): React.ReactElement {
  const [activeSection, setActiveSection] = useState<SectionId>('sales')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sections = [
    { id: 'sales', label: 'Sotuv oynasi' },
    { id: 'inventory', label: 'Mahsulotlar' },
    { id: 'history', label: 'Sotuv tarixi' },
    { id: 'debts', label: 'Qarzlar' }
  ]

  const handleNavigate = useCallback((id: string) => {
    setActiveSection(id as SectionId)
  }, [])

  const pageTitle = useMemo(() => {
    switch (activeSection) {
      case 'inventory':
        return 'Mahsulot boshqaruvi'
      case 'history':
        return "So'nggi sotuvlar"
      case 'debts':
        return 'Qarzlar va to‘lovlar'
      default:
        return 'Operativ sotuv'
    }
  }, [activeSection])

  const pageSubtitle = useMemo(() => {
    switch (activeSection) {
      case 'inventory':
        return "Mahsulot qo'shish, birliklarni sozlash, qoldiq va barkodlarni boshqarish"
      case 'history':
        return 'Cheklarni qayta chiqarish, filtrlash va tafsilotlarni ko‘rish'
      case 'debts':
        return "Mijoz qarzlari, to'lovlarni qayd qilish va balanslarni ko‘rish"
      default:
        return 'Skanner, qidiruv va mijoz qarzlari bilan tezkor savdo'
    }
  }, [activeSection])

  const renderView = () => {
    if (activeSection === 'inventory') return <ProductManager />
    if (activeSection === 'history') return <SalesHistory />
    if (activeSection === 'debts') return <Debts />
    return <SalesPage />
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar
        title="Do'kondor POS"
        sections={sections}
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        onNavigate={handleNavigate}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
      />
      <main
        style={{
          flex: 1,
          padding: '26px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-sm)'
          }}
        ></header>

        <section style={{ flex: 1, minHeight: 0 }}>{renderView()}</section>
      </main>
    </div>
  )
}

export default App
