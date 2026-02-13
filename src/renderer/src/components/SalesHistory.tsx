import React, { useEffect, useState } from 'react'

type SaleRow = {
  id: number
  sale_date: string
  total_cents: number
  payment_method: string
  customer_name?: string
}

export function SalesHistory(): React.ReactElement {
  const [rows, setRows] = useState<SaleRow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [items, setItems] = useState<
    { product_name: string; quantity: number; unit_price_cents: number; line_total_cents: number }[]
  >([])

  const load = async () => {
    const data = await window.api.getSales()
    setRows(data)
  }

  useEffect(() => {
    load()
  }, [])

  const selectSale = async (id: number) => {
    setSelected(id)
    const its = await window.api.getSaleItems(id)
    setItems(its)
  }

  const print = async (id: number) => {
    const res = await window.api.printReceiptBySale(id)
    if (!res.success) {
      alert(res.error || 'Chop etilmadi')
    }
  }

  return (
    <div style={{ padding: '12px', border: '1px solid #ddd', marginTop: '12px' }}>
      <h3>So'nggi sotuvlar</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th>ID</th>
            <th>Sana</th>
            <th>Jami</th>
            <th>To'lov</th>
            <th>Mijoz</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
              onClick={() => selectSale(r.id)}
            >
              <td>{r.id}</td>
              <td>{new Date(r.sale_date).toLocaleString('uz-UZ')}</td>
              <td>{(r.total_cents / 100).toLocaleString('uz-UZ')} so'm</td>
              <td>{r.payment_method}</td>
              <td>{r.customer_name ?? '-'}</td>
              <td>
                <button onClick={(e) => { e.stopPropagation(); print(r.id) }}>
                  Chek chiqarish
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div style={{ marginTop: '10px' }}>
          <strong>Sotuv #{selected}</strong>
          <ul>
            {items.map((i, idx) => (
              <li key={idx}>
                {i.product_name} x {i.quantity} = {(i.line_total_cents / 100).toLocaleString('uz-UZ')} so'm
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
