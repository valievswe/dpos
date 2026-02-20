import React, { useCallback, useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import { ProductManager } from './components/ProductManager'
import { SalesPage } from './components/SalesPage'
import { SalesHistory } from './components/SalesHistory'
import { Debts } from './components/Debts'
import { AnalysisPage } from './components/AnalysisPage'
import { OmborReportPage } from './components/OmborReportPage'
import { AuthGate } from './components/AuthGate'
import { SecuritySettings } from './components/SecuritySettings'
import { ReturnsHistory } from './components/ReturnsHistory'

type SectionId =
  | 'sales'
  | 'inventory'
  | 'history'
  | 'refund'
  | 'returnsHistory'
  | 'debts'
  | 'analysis'
  | 'warehouse'
  | 'security'

function App(): React.ReactElement {
  const [authLoading, setAuthLoading] = useState(true)
  const [hasOwner, setHasOwner] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>('sales')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const sections = [
    { id: 'sales', label: 'Sotuv oynasi' },
    { id: 'inventory', label: 'Mahsulotlar' },
    { id: 'history', label: 'Sotuv tarixi' },
    { id: 'refund', label: 'Qaytarish' },
    { id: 'returnsHistory', label: 'Qaytishlar tarixi' },
    { id: 'debts', label: 'Qarzlar' },
    { id: 'analysis', label: 'Analitika' },
    { id: 'warehouse', label: 'Ombor hisobot' },
    { id: 'security', label: 'Xavfsizlik' }
  ]

  const refreshAuth = useCallback(async () => {
    setAuthLoading(true)
    try {
      const status = await window.api.getAuthStatus()
      setHasOwner(status.hasOwner)
      setIsAuthenticated(status.authenticated)
      setOwnerUsername(status.username)
    } finally {
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  const handleNavigate = useCallback((id: string) => {
    setActiveSection(id as SectionId)
  }, [])

  const renderView = () => {
    if (activeSection === 'inventory') return <ProductManager />
    if (activeSection === 'history') return <SalesHistory mode="history" />
    if (activeSection === 'refund') return <SalesHistory mode="refund" />
    if (activeSection === 'returnsHistory') return <ReturnsHistory />
    if (activeSection === 'debts') return <Debts />
    if (activeSection === 'analysis') return <AnalysisPage />
    if (activeSection === 'warehouse') return <OmborReportPage />
    if (activeSection === 'security') {
      return (
        <SecuritySettings
          ownerUsername={ownerUsername}
          onLogout={async () => {
            await window.api.logout()
            await refreshAuth()
          }}
        />
      )
    }
    return <SalesPage />
  }

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg)',
          color: 'var(--muted)'
        }}
      >
        Yuklanmoqda...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthGate hasOwner={hasOwner} onAuthenticated={refreshAuth} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
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
          height: '100vh',
          padding: '26px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          minWidth: 0,
          overflowX: 'auto',
          overflowY: 'hidden'
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
        />

        <section style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
          {renderView()}
        </section>
      </main>
    </div>
  )
}

export default App
