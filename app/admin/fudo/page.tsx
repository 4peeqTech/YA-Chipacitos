import { redirect } from 'next/navigation'

// Fudo / Caja (13-11): las ventas y la caja pasaron a Integraciones › Ventas
// Fudo y los gastos de Fudo ya están en Gastos. El link viejo lleva ahí.
export default function FudoPage() {
  redirect('/admin/integraciones/ventas')
}
