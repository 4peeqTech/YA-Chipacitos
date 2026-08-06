import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RemitosClient from './RemitosClient'

export const metadata = { title: 'Remitos | YA! Chipacitos' }

export default async function RemitosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: remitos }, { data: pedidosEnviados }] = await Promise.all([
    supabase
      .from('compras_remitos')
      .select('*, compras_pedidos(proveedor_id, proveedores(nombre)), compras_remito_items(*)')
      .order('fecha', { ascending: false }),
    supabase
      .from('compras_pedidos')
      .select('id, enviado_en, proveedores(nombre)')
      .eq('estado', 'enviado')
      .order('enviado_en', { ascending: true }),
  ])

  const idsConRemito = new Set((remitos ?? []).map(r => r.pedido_id))
  const pedidosSinRemito = (pedidosEnviados ?? [])
    .filter(p => !idsConRemito.has(p.id))
    .map(p => {
      const proveedor = Array.isArray(p.proveedores) ? p.proveedores[0] : p.proveedores
      return { id: p.id, proveedorNombre: proveedor?.nombre ?? '—' }
    })

  return <RemitosClient remitosIniciales={remitos ?? []} pedidosSinRemito={pedidosSinRemito} />
}
