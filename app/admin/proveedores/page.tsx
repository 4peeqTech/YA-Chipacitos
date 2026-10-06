import { createClientTipado } from '@/lib/supabase/server'
import { consultarProveedores } from './datos'
import { redirect } from 'next/navigation'
import { aEstadoFacturacion, aEstadoRecepcion, pedidoAbierto } from '@/lib/compras/estadoPedido'
import type { PestanaProveedor } from '@/lib/compras/rutas'
import ProveedoresClient from './ProveedoresClient'
import { CLAVE, leerConfigAvisos } from '@/lib/compras/avisos'

export const metadata = { title: 'Proveedores | YA! Chipacitos' }

const PESTANAS: PestanaProveedor[] = ['pedidos', 'remitos', 'cuenta', 'insumos']

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedor?: string; pestana?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { proveedor, pestana } = await searchParams

  const [{ data: perfil }, { data: proveedores }, { data: pares }, { data: pedidos }, { data: locales }, { data: config }] = await Promise.all([
    supabase.from('profiles').select('rol').eq('id', user.id).single(),
    consultarProveedores(supabase),
    supabase.from('compras_item_proveedores').select('proveedor_id').eq('activo', true),
    supabase.from('compras_pedidos').select('proveedor_id, estado_recepcion, estado_facturacion, compras_remitos(count)'),
    supabase.from('locales_facturacion').select('id, nombre').eq('activo', true).order('orden'),
    // B5: "demorado" en la ficha con los días de Compras › Avisos.
    supabase.from('compras_config').select('clave, valor').eq('clave', CLAVE.diasDemora),
  ])

  // Insumos activos y pedidos abiertos por proveedor (las columnas de la lista).
  const insumos: Record<string, number> = {}
  for (const p of pares ?? []) insumos[p.proveedor_id] = (insumos[p.proveedor_id] ?? 0) + 1
  const abiertos: Record<string, number> = {}
  for (const p of pedidos ?? []) {
    const abierto = pedidoAbierto({
      estado_recepcion: aEstadoRecepcion(p.estado_recepcion),
      estado_facturacion: aEstadoFacturacion(p.estado_facturacion),
      recibioAlgo: (p.compras_remitos[0]?.count ?? 0) > 0,
    })
    if (abierto) abiertos[p.proveedor_id] = (abiertos[p.proveedor_id] ?? 0) + 1
  }

  return (
    <ProveedoresClient
      proveedores={proveedores ?? []}
      insumosPorProveedor={insumos}
      abiertosPorProveedor={abiertos}
      localesFacturacion={locales ?? []}
      esAdmin={perfil?.rol === 'admin'}
      diasDemora={leerConfigAvisos(config ?? []).diasDemora}
      proveedorInicial={proveedor}
      pestanaInicial={PESTANAS.find(p => p === pestana)}
    />
  )
}
