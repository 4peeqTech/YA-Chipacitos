import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SolicitudesClient from './SolicitudesClient'

export const metadata = { title: 'Solicitudes | YA! Chipacitos' }

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ solicitud?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { solicitud } = await searchParams

  const [{ data: solicitudes }, { data: proveedores }, { data: itemsProveedores }] = await Promise.all([
    supabase
      .from('compras_solicitudes')
      // compras_pedidos: los que generó cada solicitud convertida. Embebidos, se
      // traen solo los de las solicitudes listadas (sin un tope de filas aparte).
      .select('*, fabrica_conteos(semana_desde, semana_hasta, masas_proyectadas), compras_solicitud_items(*), compras_pedidos(id, numero, proveedores(nombre))')
      .order('created_at', { ascending: false }),
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre'),
    supabase.from('compras_item_proveedores').select('item_id, proveedor_id').eq('activo', true),
  ])

  type PedidoGenerado = { id: string; numero: number; proveedores: { nombre: string } | null }
  const pedidosPorSolicitud: Record<string, { id: string; numero: number; proveedor: string }[]> = {}
  for (const s of solicitudes ?? []) {
    const pedidos = (s.compras_pedidos ?? []) as PedidoGenerado[]
    if (!pedidos.length) continue
    pedidosPorSolicitud[s.id] = [...pedidos]
      .sort((a, b) => a.numero - b.numero)
      .map(p => ({ id: p.id, numero: p.numero, proveedor: p.proveedores?.nombre ?? '—' }))
  }

  const proveedoresPorItem: Record<string, string[]> = {}
  for (const ip of itemsProveedores ?? []) {
    proveedoresPorItem[ip.item_id] ??= []
    proveedoresPorItem[ip.item_id].push(ip.proveedor_id)
  }

  // Sobrestock de los conteos que originaron solicitudes complementarias (F8):
  // clave `${conteo_id}:${item_id}` → exceso en unidades de compra.
  // Solo las filas con sobrestock (pocas): sin filtrar por la lista de conteos,
  // que crece con el historial y terminaría pasando el largo de la URL.
  const { data: sobrantes } = await supabase
    .from('fabrica_conteo_items')
    .select('conteo_id, item_id, exceso')
    .eq('sobrestock', true)
  const sobrestockPorConteoItem: Record<string, number> = {}
  for (const s of sobrantes ?? []) sobrestockPorConteoItem[`${s.conteo_id}:${s.item_id}`] = Number(s.exceso)

  return (
    <SolicitudesClient
      solicitudesIniciales={solicitudes ?? []}
      proveedores={proveedores ?? []}
      proveedoresPorItem={proveedoresPorItem}
      sobrestockPorConteoItem={sobrestockPorConteoItem}
      pedidosPorSolicitud={pedidosPorSolicitud}
      solicitudInicial={solicitud}
    />
  )
}
