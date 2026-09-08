import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RemitosClient from './RemitosClient'

export const metadata = { title: 'Remitos | YA! Chipacitos' }

export default async function RemitosPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { pedido } = await searchParams

  const [{ data: remitos }, { data: pedidos }] = await Promise.all([
    supabase
      .from('compras_remitos')
      .select('*, compras_pedidos(proveedor_id, proveedores(nombre)), compras_remito_items(*)')
      .order('fecha', { ascending: false }),
    supabase
      .from('compras_pedidos')
      .select('id, estado, enviado_en, proveedores(nombre), compras_pedido_items(id, item_id, descripcion, cantidad, orden)')
      .neq('estado', 'borrador')
      .order('enviado_en', { ascending: false }),
  ])

  const pedidosNormalizados = (pedidos ?? []).map(p => ({
    ...p,
    proveedores: Array.isArray(p.proveedores) ? p.proveedores[0] ?? null : p.proveedores,
  }))

  const idsConRemito = new Set((remitos ?? []).map(r => r.pedido_id))
  const pedidosSinRemito = pedidosNormalizados
    .filter(p => p.estado === 'enviado' && !idsConRemito.has(p.id))
    .map(p => ({ id: p.id, proveedorNombre: p.proveedores?.nombre ?? '—' }))

  return (
    <RemitosClient
      remitosIniciales={remitos ?? []}
      pedidos={pedidosNormalizados}
      pedidosSinRemito={pedidosSinRemito}
      usuarioId={user.id}
      pedidoPreseleccionado={pedido}
    />
  )
}
