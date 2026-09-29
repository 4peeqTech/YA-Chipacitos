import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FacturasClient from './FacturasClient'
import {
  consultarDiferencias, consultarFacturaItems, consultarFacturas, consultarInsumosFactura,
  consultarLocalGastoDefault, consultarPedidosFactura, consultarPreciosRef,
} from './datos'

export const metadata = { title: 'Facturas | YA! Chipacitos' }

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; factura?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Solo admin (P1). La RLS ya devolvería listas vacías, pero una pantalla
  // vacía no explica nada: mejor rebotar a Pedidos con el mismo aviso que usa
  // proxy.ts cuando falta el permiso.
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') redirect('/admin/compras/pedidos?sinAcceso=Facturas')

  const { pedido, factura } = await searchParams

  const [
    { data: facturas },
    { data: items },
    { data: pedidos },
    { data: lineas },
    { data: precios },
    { data: insumos },
    { data: stock },
    { data: diferencias },
    localGasto,
  ] = await Promise.all([
    consultarFacturas(supabase),
    consultarFacturaItems(supabase),
    consultarPedidosFactura(supabase),
    supabase.from('v_compras_pedido_pendiente').select('*').order('orden'),
    consultarPreciosRef(supabase),
    consultarInsumosFactura(supabase),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
    consultarDiferencias(supabase),
    consultarLocalGastoDefault(supabase),
  ])

  return (
    <FacturasClient
      facturas={facturas ?? []}
      items={items ?? []}
      pedidos={pedidos ?? []}
      lineas={lineas ?? []}
      precios={precios ?? []}
      insumos={insumos ?? []}
      stock={stock ?? []}
      diferencias={diferencias ?? []}
      localGasto={localGasto}
      pedidoInicial={pedido}
      facturaInicial={factura}
    />
  )
}
