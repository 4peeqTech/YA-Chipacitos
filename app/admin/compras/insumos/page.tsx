import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InsumosClient, { type CompraItem, type PedidoAbierto, type ResumenInsumo } from './InsumosClient'
import type { ModoCalculo } from '@/lib/fabrica/calculoSugerido'

export const metadata = { title: 'Insumos | YA! Chipacitos' }

export default async function InsumosPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: perfil },
    { data: items },
    { data: proveedores },
    { data: categorias },
    { data: definicionItems },
    { data: resumen },
    { data: plantillaBase },
  ] = await Promise.all([
    supabase.from('profiles').select('rol').eq('id', user.id).single(),
    supabase
      .from('compras_items')
      .select('id, nombre, unidad, categoria_id, stock_minimo, cantidad_por_unidad, cantidad_por_masa, redondeo, stock_maximo, a_demanda, alicuota_iva, estado, compras_item_proveedores(proveedor_id, es_principal, activo, precio_ref, codigo_proveedor, created_at)')
      .order('nombre'),
    // A2a (C2): todos los proveedores, sin filtrar por "Sugerir cantidades al
    // pedir". Los archivados sirven para mostrar el nombre de un par viejo; el
    // selector ofrece solo los activos.
    supabase.from('proveedores').select('id, nombre, estado').order('nombre'),
    supabase.from('compras_categorias').select('id, nombre').order('orden'),
    supabase
      .from('fabrica_conteo_definicion_items')
      .select('item_id, modo_calculo, fabrica_conteo_definiciones(nombre)')
      .eq('activo', true),
    supabase.from('v_compras_insumos_resumen').select('*'),
    // Para el confirm de archivar / eliminar: "no entra en el pedido base".
    supabase.from('compras_plantilla_base').select('item_id').eq('activo', true).not('item_id', 'is', null),
  ])

  const conteosPorItem: Record<string, string[]> = {}
  // Modos de cálculo con que cada insumo participa de los conteos: definen si
  // es de reposición a demanda (por_masa sin receta, decisión X2).
  const modosPorItem: Record<string, ModoCalculo[]> = {}
  for (const di of (definicionItems ?? []) as unknown as { item_id: string; modo_calculo: ModoCalculo; fabrica_conteo_definiciones: { nombre: string } | null }[]) {
    if (!di.fabrica_conteo_definiciones) continue
    conteosPorItem[di.item_id] ??= []
    conteosPorItem[di.item_id].push(di.fabrica_conteo_definiciones.nombre)
    modosPorItem[di.item_id] ??= []
    if (!modosPorItem[di.item_id].includes(di.modo_calculo)) modosPorItem[di.item_id].push(di.modo_calculo)
  }

  const resumenPorItem: Record<string, ResumenInsumo> = {}
  for (const r of resumen ?? []) {
    if (!r.item_id) continue
    resumenPorItem[r.item_id] = {
      stock: r.stock ?? 0,
      precioRefPrincipal: r.precio_ref_principal,
      ultimoPrecio: r.ultimo_precio,
      ultimoPrecioUnidad: r.ultimo_precio_unidad,
      ultimoPrecioFecha: r.ultimo_precio_fecha,
      ultimoPrecioFacturaId: r.ultimo_precio_factura_id,
      ultimoPrecioProveedorId: r.ultimo_precio_proveedor_id,
      pedidosAbiertos: (Array.isArray(r.pedidos_abiertos) ? r.pedidos_abiertos : []) as unknown as PedidoAbierto[],
      puedeEliminar: r.puede_eliminar ?? false,
    }
  }

  return (
    <InsumosClient
      items={(items ?? []) as unknown as CompraItem[]}
      proveedores={(proveedores ?? []).map(p => ({ id: p.id, nombre: p.nombre, activo: p.estado === 'activo' }))}
      categorias={categorias ?? []}
      conteosPorItem={conteosPorItem}
      modosPorItem={modosPorItem}
      resumenPorItem={resumenPorItem}
      enPedidoBase={[...new Set((plantillaBase ?? []).map(p => p.item_id).filter((id): id is string => !!id))]}
      esAdmin={perfil?.rol === 'admin'}
    />
  )
}
