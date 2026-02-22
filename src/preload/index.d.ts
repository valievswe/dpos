import { ElectronAPI } from '@electron-toolkit/preload'

export interface Product {
  id: number
  sku: string
  name: string
  price: number
  costPrice: number
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
  saleTotalCents?: number
  salePaidCents?: number
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
  costCents: number
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
    returnedCents: number
    netSalesCents: number
    discountCents: number
    debtCents: number
    refundCents: number
    debtReducedByReturnsCents: number
    grossProfitCents: number
    netProfitCents: number
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

export interface SaleRecord {
  id: number
  sale_date: string
  total_cents: number
  paid_cents: number
  debt_added_cents: number
  debt_reduced_cents: number
  debt_cents: number
  returned_cents: number
  refund_cents: number
  payment_method: string
  customer_name?: string
  customer_phone?: string
}

export interface SaleItemRow {
  sale_item_id: number
  product_name: string
  barcode?: string
  unit?: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  returned_qty?: number
  returnable_qty?: number
}

export interface SaleReturnItem {
  productName: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
}

export interface SaleReturnRecord {
  id: number
  saleId: number
  customerId?: number
  customerName: string
  returnDate: string
  totalCents: number
  debtReducedCents: number
  refundCents: number
  refundMethod?: 'cash' | 'card'
  note?: string
  items: SaleReturnItem[]
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      printBarcode: (sku: string, name: string) => void
      printReceipt: (storeName: string, items: Product[], total: string) => void
      printBarcodeByProduct: (productId: number, copies?: number, printerName?: string) => Promise<boolean>
      printReceiptBySale: (saleId: number, printerName?: string) => Promise<{ success: boolean; error?: string }>
      getProducts: () => Promise<Product[]>
      deleteProduct: (
        productId: number,
        force?: boolean
      ) => Promise<{
        success: boolean
        requiresConfirmation?: boolean
        saleCount?: number
        movementCount?: number
      }>
      addProduct: (
        sku: string,
        name: string,
        price: number,
        unit?: string,
        qty?: number,
        barcode?: string,
        costPrice?: number
      ) => Promise<{ success: boolean; productId?: number; barcode?: string }>
      updateProduct: (
        productId: number,
        payload: { sku?: string; name: string; price: number; costPrice?: number; unit?: string; barcode?: string }
      ) => Promise<boolean>
      findProduct: (code: string) => Promise<Product | null>
      setStock: (productId: number, qty: number) => Promise<boolean>
      createSale: (payload: {
        items: { productId: number; qty: number }[]
        paymentMethod: 'cash' | 'card' | 'mixed' | 'debt'
        discountCents?: number
        customer?: { name: string; phone?: string }
        paidCents?: number
        paidMethod?: 'cash' | 'card'
      }) => Promise<{ saleId: number; total_cents: number }>
      getSales: () => Promise<SaleRecord[]>
      getSalesAll: () => Promise<SaleRecord[]>
      getSaleItems: (saleId: number) => Promise<SaleItemRow[]>
      createSaleReturn: (payload: {
        saleId: number
        items: { saleItemId: number; qty: number }[]
        refundMethod?: 'cash' | 'card'
        note?: string
      }) => Promise<{
        success: boolean
        returnId: number
        totalReturnedCents: number
        debtReducedCents: number
        refundCents: number
        refundMethod?: 'cash' | 'card'
      }>
      getSaleReturns: () => Promise<SaleReturnRecord[]>
      printReturnReceiptById: (returnId: number, printerName?: string) => Promise<{ success: boolean; error?: string }>
      clearSalesRecords: () => Promise<boolean>
      getAnalyticsReport: (filter?: { from?: string; to?: string }) => Promise<AnalyticsReport>
      payDebt: (customerId: number, amountCents: number) => Promise<boolean>
      getDebts: () => Promise<DebtRecord[]>
      payDebtRecord: (debtId: number, amountCents: number) => Promise<{ success: boolean; appliedCents: number; fullyPaid: boolean }>
      deleteDebtRecord: (debtId: number) => Promise<boolean>
      clearDebtsRecords: () => Promise<boolean>
      exportSalesExcel: (payload: {
        headers: string[]
        rows: (string | number)[][]
        fileName?: string
        sheetName?: string
      }) => Promise<{ success: boolean; cancelled?: boolean; path?: string }>
      getAuthStatus: () => Promise<AuthStatus>
      setupOwner: (username: string, password: string) => Promise<boolean>
      login: (username: string, password: string) => Promise<boolean>
      logout: () => Promise<boolean>
      changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>
    }
  }
}
