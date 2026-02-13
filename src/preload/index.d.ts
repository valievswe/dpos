import { ElectronAPI } from '@electron-toolkit/preload'

export interface Product {
  id: number
  sku: string
  name: string
  price: number
  stock: number
  barcode?: string
  unit?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      printBarcode: (sku: string, name: string) => void
      printReceipt: (storeName: string, items: Product[], total: string) => void
      printBarcodeByProduct: (productId: number, copies?: number) => Promise<boolean>
      printReceiptBySale: (saleId: number, printerName?: string) => Promise<{ success: boolean; error?: string }>
      getProducts: () => Promise<Product[]>
      addProduct: (sku: string, name: string, price: number, unit?: string) => Promise<boolean>
      findProduct: (code: string) => Promise<Product | null>
      setStock: (productId: number, qty: number) => Promise<boolean>
      createSale: (payload: {
        items: { productId: number; qty: number }[]
        paymentMethod: 'cash' | 'card' | 'mixed' | 'debt'
        discountCents?: number
        customer?: { name: string; phone?: string }
      }) => Promise<{ saleId: number; total_cents: number }>
      getSales: () => Promise<
        { id: number; sale_date: string; total_cents: number; payment_method: string; customer_name?: string }[]
      >
      getSaleItems: (saleId: number) => Promise<
        { product_name: string; quantity: number; unit_price_cents: number; line_total_cents: number }[]
      >
      payDebt: (customerId: number, amountCents: number) => Promise<boolean>
    }
  }
}
