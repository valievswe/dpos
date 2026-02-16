import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 1. Define the interface directly here to avoid import path issues
export interface Product {
  id: number
  sku: string
  name: string
  price: number
  stock: number
  barcode?: string
  unit?: string
}

export interface DebtItem {
  productName: string
  unitPriceCents: number
  quantity: number
  lineTotalCents: number
}

export interface DebtRecord {
  id: number
  customerId: number
  customerName: string
  saleId?: number
  description: string
  debtDate: string
  paymentDate?: string
  status: 'paid' | 'unpaid'
  totalCents: number
  paidCents: number
  remainingCents: number
  items: DebtItem[]
}

export interface AnalyticsPaymentRow {
  method: string
  salesCount: number
  totalCents: number
}

export interface AnalyticsDailyRow {
  day: string
  salesCount: number
  totalCents: number
}

export interface AnalyticsTopProductRow {
  productId: number
  productName: string
  qty: number
  revenueCents: number
  avgPriceCents: number
}

export interface AnalyticsInventoryRow {
  productId: number
  barcode: string
  name: string
  unit: string
  stock: number
  minStock: number
  priceCents: number
  stockValueCents: number
  soldQty: number
  soldCents: number
}

export interface AnalyticsReport {
  period: { from?: string; to?: string }
  summary: {
    salesCount: number
    totalCents: number
    discountCents: number
    debtCents: number
    avgCheckCents: number
  }
  previousSummary: null | {
    salesCount: number
    totalCents: number
    discountCents: number
    debtCents: number
    avgCheckCents: number
  }
  comparison: null | {
    totalPct: number | null
    salesCountPct: number | null
    avgCheckPct: number | null
  }
  payments: AnalyticsPaymentRow[]
  daily: AnalyticsDailyRow[]
  topProducts: AnalyticsTopProductRow[]
  inventory: AnalyticsInventoryRow[]
}

export interface AuthStatus {
  hasOwner: boolean
  authenticated: boolean
  username: string | null
}

// 2. Define the API object with explicit types
const api = {
  printBarcode: (sku: string, name: string): void => {
    ipcRenderer.send('trigger-print', sku, name)
  },

  printReceipt: (storeName: string, items: Product[], total: string): void => {
    ipcRenderer.send('trigger-receipt', storeName, items, total)
  },

  printBarcodeByProduct: (productId: number, copies = 1, printerName?: string): Promise<boolean> => {
    return ipcRenderer.invoke('print-barcode-product', productId, copies, printerName)
  },

  printReceiptBySale: (saleId: number, printerName?: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('print-receipt-sale', saleId, printerName)
  },

  getProducts: (): Promise<Product[]> => {
    return ipcRenderer.invoke('get-products')
  },

  deleteProduct: (productId: number, force = false): Promise<{
    success: boolean
    requiresConfirmation?: boolean
    saleCount?: number
    movementCount?: number
  }> => {
    return ipcRenderer.invoke('delete-product', productId, force)
  },

  addProduct: (
    sku: string,
    name: string,
    price: number,
    unit = 'dona',
    qty = 0,
    barcode?: string
  ): Promise<{ success: boolean; productId?: number; barcode?: string }> => {
    return ipcRenderer.invoke('add-product', sku, name, price, unit, qty, barcode)
  },

  updateProduct: (productId: number, payload: { sku?: string; name: string; price: number; unit?: string; barcode?: string }) => {
    return ipcRenderer.invoke('update-product', productId, payload)
  },

  findProduct: (code: string) => {
    return ipcRenderer.invoke('find-product', code)
  },

  setStock: (productId: number, qty: number) => {
    return ipcRenderer.invoke('set-stock', productId, qty)
  },

  createSale: (payload: {
    items: { productId: number; qty: number }[]
    paymentMethod: 'cash' | 'card' | 'mixed' | 'debt'
    discountCents?: number
    customer?: { name: string; phone?: string }
  }) => {
    return ipcRenderer.invoke('create-sale', payload)
  },

  getSales: () => {
    return ipcRenderer.invoke('get-sales')
  },

  getSalesAll: () => {
    return ipcRenderer.invoke('get-sales-all')
  },

  getSaleItems: (saleId: number) => {
    return ipcRenderer.invoke('get-sale-items', saleId)
  },

  clearSalesRecords: (): Promise<boolean> => {
    return ipcRenderer.invoke('clear-sales-records')
  },

  getAnalyticsReport: (filter?: { from?: string; to?: string }): Promise<AnalyticsReport> => {
    return ipcRenderer.invoke('get-analytics-report', filter)
  },

  payDebt: (customerId: number, amountCents: number) => {
    return ipcRenderer.invoke('pay-debt', customerId, amountCents)
  },

  getDebts: (): Promise<DebtRecord[]> => {
    return ipcRenderer.invoke('get-debts')
  },

  payDebtRecord: (debtId: number, amountCents: number): Promise<{ success: boolean; appliedCents: number; fullyPaid: boolean }> => {
    return ipcRenderer.invoke('pay-debt-record', debtId, amountCents)
  },

  deleteDebtRecord: (debtId: number): Promise<boolean> => {
    return ipcRenderer.invoke('delete-debt-record', debtId)
  },

  clearDebtsRecords: (): Promise<boolean> => {
    return ipcRenderer.invoke('clear-debts-records')
  },

  exportSalesExcel: (payload: {
    headers: string[]
    rows: (string | number)[][]
    fileName?: string
    sheetName?: string
  }) => {
    return ipcRenderer.invoke('export-sales-excel', payload)
  },

  getAuthStatus: (): Promise<AuthStatus> => {
    return ipcRenderer.invoke('auth-status')
  },

  setupOwner: (username: string, password: string): Promise<boolean> => {
    return ipcRenderer.invoke('auth-setup-owner', { username, password })
  },

  login: (username: string, password: string): Promise<boolean> => {
    return ipcRenderer.invoke('auth-login', { username, password })
  },

  logout: (): Promise<boolean> => {
    return ipcRenderer.invoke('auth-logout')
  },

  changePassword: (currentPassword: string, newPassword: string): Promise<boolean> => {
    return ipcRenderer.invoke('auth-change-password', { currentPassword, newPassword })
  }
}

// 3. Expose to the world
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
