import { ElectronAPI } from '@electron-toolkit/preload'

export interface Product {
  id: number
  sku: string
  name: string
  price: number
  stock: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      printBarcode: (sku: string, name: string) => void
      printReceipt: (storeName: string, items: Product[], total: string) => void
      getProducts: () => Promise<Product[]>
      addProduct: (sku: string, name: string, price: number) => Promise<boolean>
    }
  }
}
