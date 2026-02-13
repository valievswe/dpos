import React, { useCallback, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import { ProductManager } from './components/ProductManager'
import { SalesPage } from './components/SalesPage'
import { SalesHistory } from './components/SalesHistory'

function App(): React.ReactElement {
  const [activeSection, setActiveSection] = useState<'sales' | 'inventory' | 'history'>('sales')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sections = [
    { id: 'sales', label: "Sotuv oynasi" },
    { id: 'inventory', label: 'Mahsulotlar' },
    { id: 'history', label: "Sotuv tarixi" }
  ]

  const handleNavigate = useCallback((id: string) => {
    setActiveSection(id as 'sales' | 'inventory' | 'history')
  }, [])

  const pageTitle = useMemo(() => {
    switch (activeSection) {
      case 'inventory':
        return 'Mahsulot boshqaruvi'
      case 'history':
        return "So'nggi sotuvlar"
      default:
        return 'Operativ sotuv'
    }
  }, [activeSection])

  const pageSubtitle = useMemo(() => {
    switch (activeSection) {
      case 'inventory':
        return "Mahsulot qo'shish, birliklarni sozlash va qoldiqni boshqarish"
      case 'history':
        return "Cheklarni qayta chiqarish va oxirgi operatsiyalarni kuzatish"
      default:
        return "Skanner, qidiruv va mijoz qarzlari bilan tez sotuv"
    }
  }, [activeSection])

  const renderView = () => {
    if (activeSection === 'inventory') return <ProductManager />
    if (activeSection === 'history') return <SalesHistory />
    return <SalesPage />
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#e5e7eb' }}>
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
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        <header>
          <h1 style={{ margin: 0, fontSize: '1.6rem', color: '#111827' }}>{pageTitle}</h1>
          <p style={{ marginTop: '6px', color: '#4b5563' }}>{pageSubtitle}</p>
        </header>
        <section style={{ flex: 1, minHeight: 0 }}>{renderView()}</section>
      </main>
    </div>
  )
}

export default App
