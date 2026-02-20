import { useCallback, useEffect, useState } from 'react'

export type Product = {
  id: number
  sku: string
  name: string
  price: number
  costPrice: number
  stock: number
  barcode?: string
  unit?: string
}

type State = {
  data: Product[]
  loading: boolean
  error: string | null
}

export function useProducts() {
  const [state, setState] = useState<State>({ data: [], loading: false, error: null })

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const rows = await window.api.getProducts()
      setState({ data: rows, loading: false, error: null })
    } catch (err: any) {
      setState({ data: [], loading: false, error: err?.message ?? "Ma'lumotlarni yuklab bo'lmadi" })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return {
    products: state.data,
    loading: state.loading,
    error: state.error,
    reload: load
  }
}
