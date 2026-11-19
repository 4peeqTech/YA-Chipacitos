export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { exigirArea } from '@/lib/permisos/servidor'
import PedidosMayoristaClient from '@/components/pedidos/mayorista/PedidosMayoristaClient'
import type { Pedido, Producto } from '@/lib/types'

export default async function MayoristaPedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await exigirArea('mayorista')
  const [{ data: productos }, { data: pedidos }, { data: locales }, { data: inicioVersion }] = await Promise.all([
    supabase.from('productos').select('*').eq('tipo', 'producto').eq('destino', 'fabrica').order('nombre'),
    // Todos los activos, sin límite: los cerrados van al historial paginado.
    supabase.from('pedidos').select('*, pedido_items(*), pedido_mensajes(*)')
      .eq('destino', 'fabrica').in('estado', ['pendiente', 'preparando', 'enviado']).order('created_at'),
    // Sucursales para los filtros (también las que hoy no tienen pedidos activos).
    supabase.from('pedidos').select('local_nombre').eq('destino', 'fabrica')
      .order('created_at', { ascending: false }).limit(1000),
    supabase.rpc('pedidos_inicio_version'),
  ])

  // Pedidos es del mayorista (el layout ya lo controla; esto cubre un acceso directo).

  const sucursales = [...new Set((locales ?? []).map(l => l.local_nombre as string))].sort((a, b) => a.localeCompare(b, 'es'))

  return (
    <PedidosMayoristaClient
      pedidosIniciales={(pedidos ?? []) as Pedido[]}
      productos={(productos ?? []) as Producto[]}
      sucursales={sucursales}
      inicioVersion={(inicioVersion as string | null) ?? null}
      usuarioId={user!.id}
    />
  )
}
