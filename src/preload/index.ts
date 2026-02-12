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

  getProducts: (): Promise<Product[]> => {
    return ipcRenderer.invoke('get-products')
  },

  addProduct: (sku: string, name: string, price: number): Promise<boolean> => {
    return ipcRenderer.invoke('add-product', sku, name, price)
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
