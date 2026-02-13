import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 1. Define the interface directly here to avoid import path issues
export interface Product {
  id: number
  sku: string
  name: string
  price: number
  stock: number
}

// 2. Define the API object with explicit types
const api = {
  printBarcode: (sku: string, name: string): void => {
    ipcRenderer.send('trigger-print', sku, name)
  },

  printReceipt: (storeName: string, items: Product[], total: string): void => {
    ipcRenderer.send('trigger-receipt', storeName, items, total)
  },

  printBarcodeByProduct: (productId: number, copies = 1): Promise<boolean> => {
    return ipcRenderer.invoke('print-barcode-product', productId, copies)
  },

  printReceiptBySale: (saleId: number, printerName?: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('print-receipt-sale', saleId, printerName)
  },

  getProducts: (): Promise<Product[]> => {
    return ipcRenderer.invoke('get-products')
  },

  addProduct: (sku: string, name: string, price: number): Promise<boolean> => {
    return ipcRenderer.invoke('add-product', sku, name, price)
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

  getSaleItems: (saleId: number) => {
    return ipcRenderer.invoke('get-sale-items', saleId)
  },

  payDebt: (customerId: number, amountCents: number) => {
    return ipcRenderer.invoke('pay-debt', customerId, amountCents)
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
