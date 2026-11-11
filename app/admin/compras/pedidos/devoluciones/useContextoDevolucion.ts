'use client'

import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { mensajeError } from '@/lib/errores'
import { aEstadoFacturacion, aEstadoRecepcion, type EstadoFacturacion, type EstadoRecepcion } from '@/lib/compras/estadoPedido'
import { esCobraPor, type CobraPor } from '@/lib/compras/unidades'
import { armarDevoluciones, armarMotivos, type DevolucionVista } from './datos'
import type { FacturaDev, LineaPedidoDev, Motivo, RecibidoInsumo } from '@/lib/compras/devoluciones'

export interface InsumoDev {
  id: string
  nombre: string
  unidad: string | null
  unidad_base: string | null
  cantidad_por_unidad: number | null
  archivado: boolean
}

export interface FacturaContexto extends FacturaDev {
  gastoId: string | null
  gastoEstado: string | null
  gastoMonto: number | null
}

export interface ContextoDevolucion {
  pedido: {
    id: string
    numero: number
    proveedor: string
    estadoRecepcion: EstadoRecepcion
    estadoFacturacion: EstadoFacturacion
    hayRemitos: boolean
  }
  lineas: LineaPedidoDev[]
  recibidos: RecibidoInsumo[]
  devoluciones: DevolucionVista[]
  motivos: Motivo[]
  /** Solo para admin y si el pedido tiene factura confirmada. */
  factura: FacturaContexto | null
  insumos: Map<string, InsumoDev>
  stock: Record<string, number>
}

/**
 * Todo lo que necesita el modal de la devolución, pedido al abrirlo (como el
 * historial del pedido): así se abre igual desde el pedido, la factura o una
 * diferencia, sin que cada pantalla cargue remitos y facturas de todo.
 */
export function useContextoDevolucion(pedidoId: string, esAdmin: boolean) {
  const supabase = useMemo(() => createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])
  const [estado, setEstado] = useState<{ ctx: ContextoDevolucion | null; error: string | null } | null>(null)

  useEffect(() => {
    let vigente = true
    async function cargar(): Promise<ContextoDevolucion> {
      const [ped, lineas, remitos, devs, motivos] = await Promise.all([
        supabase.from('compras_pedidos').select('id, numero, estado_recepcion, estado_facturacion, proveedores(nombre), compras_remitos(id)').eq('id', pedidoId).single(),
        supabase.from('v_compras_pedido_pendiente').select('*').eq('pedido_id', pedidoId).order('orden'),
        supabase.from('compras_remito_items').select('item_id, descripcion, cantidad, compras_remitos!inner(pedido_id)').eq('compras_remitos.pedido_id', pedidoId).not('item_id', 'is', null),
        supabase.from('v_compras_devoluciones').select('*').eq('pedido_id', pedidoId),
        supabase.from('compras_devolucion_motivos').select('id, nombre, devuelve_mercaderia, corrige_precio, orden, activo'),
      ])
      for (const r of [ped, lineas, remitos, devs, motivos]) if (r.error) throw r.error
      if (!ped.data) throw new Error('No encontramos el pedido. Recargá la página.')

      let factura: FacturaContexto | null = null
      if (esAdmin) {
        const { data: f, error } = await supabase.from('v_compras_facturas')
          .select('id, numero, total, gasto_id, gasto_estado, gasto_monto, notas_credito_total')
          .eq('pedido_id', pedidoId).eq('tipo_comprobante', 'factura').eq('estado', 'confirmada').maybeSingle()
        if (error) throw error
        if (f?.id) {
          const [items, ncs] = await Promise.all([
            supabase.from('compras_factura_items').select('id, item_id, pedido_item_id, descripcion, unidad, cantidad, cantidad_base, precio_unitario, precio_por, alicuota_iva, orden').eq('factura_id', f.id),
            supabase.from('compras_facturas').select('id, compras_factura_items(item_id, cantidad)').eq('factura_origen_id', f.id).eq('tipo_comprobante', 'nota_credito').eq('estado', 'confirmada'),
          ])
          if (items.error) throw items.error
          if (ncs.error) throw ncs.error
          factura = {
            id: f.id,
            numero: f.numero ?? '',
            total: f.total ?? 0,
            gastoId: f.gasto_id,
            gastoEstado: f.gasto_estado,
            gastoMonto: f.gasto_monto,
            notasCreditoTotal: f.notas_credito_total ?? 0,
            lineas: (items.data ?? []).map(i => ({
              id: i.id, itemId: i.item_id, pedidoItemId: i.pedido_item_id, descripcion: i.descripcion, unidad: i.unidad,
              cantidad: i.cantidad, cantidadBase: i.cantidad_base, precioUnitario: i.precio_unitario,
              precioPor: (esCobraPor(i.precio_por) ? i.precio_por : 'unidad') as CobraPor, alicuotaIva: i.alicuota_iva, orden: i.orden,
            })),
            acreditado: (ncs.data ?? []).flatMap(nc => nc.compras_factura_items
              .filter(i => i.item_id)
              .map(i => ({ itemId: i.item_id as string, cantidad: i.cantidad }))),
          }
        }
      }

      const ids = new Set<string>()
      for (const l of lineas.data ?? []) if (l.item_id) ids.add(l.item_id)
      for (const r of remitos.data ?? []) if (r.item_id) ids.add(r.item_id)
      for (const l of factura?.lineas ?? []) if (l.itemId) ids.add(l.itemId)
      const lista = [...ids]
      const [insumos, stock] = lista.length
        ? await Promise.all([
          supabase.from('compras_items').select('id, nombre, unidad, unidad_base, cantidad_por_unidad, estado').in('id', lista),
          supabase.from('compras_stock_actual').select('item_id, cantidad').in('item_id', lista),
        ])
        : [{ data: [], error: null }, { data: [], error: null }]
      if (insumos.error) throw insumos.error
      if (stock.error) throw stock.error

      const mapaInsumos = new Map((insumos.data ?? []).map(i => [i.id, {
        id: i.id, nombre: i.nombre, unidad: i.unidad, unidad_base: i.unidad_base,
        cantidad_por_unidad: i.cantidad_por_unidad, archivado: i.estado !== 'activo',
      }]))

      const recibidosPorItem = new Map<string, RecibidoInsumo>()
      for (const r of remitos.data ?? []) {
        if (!r.item_id) continue
        const previo = recibidosPorItem.get(r.item_id)
        if (previo) previo.cantidad += r.cantidad
        else recibidosPorItem.set(r.item_id, {
          itemId: r.item_id, descripcion: mapaInsumos.get(r.item_id)?.nombre ?? r.descripcion,
          unidad: mapaInsumos.get(r.item_id)?.unidad ?? null, cantidad: r.cantidad,
        })
      }

      return {
        pedido: {
          id: ped.data.id,
          numero: ped.data.numero,
          proveedor: ped.data.proveedores?.nombre ?? '—',
          estadoRecepcion: aEstadoRecepcion(ped.data.estado_recepcion),
          estadoFacturacion: aEstadoFacturacion(ped.data.estado_facturacion),
          hayRemitos: ped.data.compras_remitos.length > 0,
        },
        lineas: (lineas.data ?? []).flatMap((l): LineaPedidoDev[] => l.pedido_item_id ? [{
          pedidoItemId: l.pedido_item_id,
          itemId: l.item_id,
          descripcion: l.descripcion ?? '',
          unidad: l.unidad,
          cantidad: l.cantidad ?? 0,
          recibido: l.recibido ?? 0,
          devuelto: l.devuelto ?? 0,
          devueltoSinRepone: l.devuelto_sin_repone ?? 0,
          cobraPor: esCobraPor(l.cobra_por) ? l.cobra_por : null,
        }] : []),
        recibidos: [...recibidosPorItem.values()],
        devoluciones: armarDevoluciones(devs.data ?? []),
        motivos: armarMotivos(motivos.data ?? []),
        factura,
        insumos: mapaInsumos,
        stock: Object.fromEntries((stock.data ?? []).map(s => [s.item_id, s.cantidad])),
      }
    }
    cargar()
      .then(ctx => { if (vigente) setEstado({ ctx, error: null }) })
      .catch(e => { if (vigente) setEstado({ ctx: null, error: mensajeError(e, 'No se pudieron cargar los datos de la devolución.') }) })
    return () => { vigente = false }
  }, [supabase, pedidoId, esAdmin])

  return { ctx: estado?.ctx ?? null, error: estado?.error ?? null, cargando: estado == null }
}
