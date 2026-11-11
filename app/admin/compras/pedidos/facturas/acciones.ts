'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { ALICUOTAS } from '@/lib/compras/totalesFactura'

// La autorización es de las RPC (es_admin()): estas acciones son alcanzables
// por POST directo, así que la UI nunca es la que decide. Si la RPC rechaza
// también se refresca, para que la pantalla quede con lo que hay en la base.

const Impacto = z.array(z.object({
  item_id: z.uuid(),
  nombre: z.string().nullable(),
  unidad: z.string().nullable(),
  delta: z.number(),
  cantidad_despues: z.number().nullable(),
}))

export type ImpactoStock = z.infer<typeof Impacto>

const Linea = z.object({
  id: z.uuid().nullable(),
  pedidoItemId: z.uuid().nullable(),
  itemId: z.uuid().nullable(),
  descripcion: z.string().trim().min(1),
  unidad: z.string().nullable(),
  cantidad: z.number().min(0),
  precioUnitario: z.number().min(0),
  alicuotaIva: z.number().refine(v => (ALICUOTAS as readonly number[]).includes(v)),
  // A2b: kg facturados (obligatorios si se cobra por kg) y en qué unidad es el precio.
  cantidadBase: z.number().positive().nullable(),
  precioPor: z.enum(['unidad', 'base']),
})

const GuardarFactura = z.object({
  facturaId: z.uuid().nullable(),
  pedidoId: z.uuid().nullable(),
  numero: z.string().trim().min(1),
  fecha: z.iso.date(),
  vencimiento: z.iso.date().nullable(),
  totalPapel: z.number().min(0).nullable(),
  observaciones: z.string().nullable(),
  lineas: z.array(Linea).min(1),
  /**
   * Las líneas que la pantalla tenía al abrir la factura. La RPC borra lo que
   * no viene en `lineas`, así que necesita saber que el cliente las conocía
   * todas: si no, frena en vez de borrar algo que nadie vio.
   */
  idsConocidos: z.array(z.uuid()),
})

export interface FacturaGuardada {
  id: string
  subtotal: number
  iva: number
  total: number
  /** Ids de las líneas guardadas, en el mismo orden en que se mandaron. */
  items: string[]
}

export async function guardarFactura(
  entrada: z.input<typeof GuardarFactura>,
): Promise<Resultado<FacturaGuardada>> {
  const parsed = GuardarFactura.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Revisá la factura: hacen falta el número, la fecha y al menos una línea.')
  const { facturaId, pedidoId, numero, fecha, vencimiento, totalPapel, observaciones, lineas, idsConocidos } = parsed.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_guardar_factura', {
      p_factura_id: facturaId ?? undefined,
      p_pedido_id: pedidoId ?? undefined,
      p_numero: numero,
      p_fecha: fecha,
      p_vencimiento: vencimiento ?? undefined,
      p_total_papel: totalPapel ?? undefined,
      p_observaciones: observaciones ?? undefined,
      p_items: lineas.map(l => ({
        id: l.id,
        pedido_item_id: l.pedidoItemId,
        item_id: l.itemId,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantidad,
        precio_unitario: l.precioUnitario,
        alicuota_iva: l.alicuotaIva,
        cantidad_base: l.cantidadBase,
        precio_por: l.precioPor,
      })),
      p_ids_conocidos: idsConocidos,
    })
    if (error) { refresh(); return fallo(error, 'No se pudo guardar la factura.') }
    const res = z.object({
      id: z.uuid(), subtotal: z.number(), iva: z.number(), total: z.number(), items: z.array(z.uuid()),
    }).safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'La factura se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, 'No se pudo guardar la factura.')
  }
}

const ConfirmarFactura = z.object({
  facturaId: z.uuid(),
  /** FA1/FA2: obligatorio solo cuando el pedido no tiene remitos. */
  mercaderiaLlego: z.boolean().nullable(),
  actualizarPrecios: z.boolean(),
  /** FA10: un gasto cargado a mano que es esta factura. Si viene, no se crea otro. */
  gastoExistenteId: z.uuid().nullable(),
  /** Local del gasto nuevo (se elige al confirmar). */
  gastoLocal: z.string().trim().min(1).nullable(),
})

export interface FacturaConfirmada {
  remitoGenerado: string | null
  impacto: ImpactoStock
  gastoCreado: boolean
  /** Diferencias con lo recibido que dejó la confirmación. */
  diferencias: number
  /** A2b: pares cuyo precio de referencia (o cómo cobran) se actualizó. */
  preciosActualizados: number
}

export async function confirmarFactura(
  entrada: z.input<typeof ConfirmarFactura>,
): Promise<Resultado<FacturaConfirmada>> {
  const parsed = ConfirmarFactura.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'No encontramos la factura. Recargá la página.')
  const { facturaId, mercaderiaLlego, actualizarPrecios, gastoExistenteId, gastoLocal } = parsed.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_confirmar_factura', {
      p_factura_id: facturaId,
      p_mercaderia_llego: mercaderiaLlego ?? undefined,
      p_actualizar_precios: actualizarPrecios,
      p_gasto_existente_id: gastoExistenteId ?? undefined,
      p_gasto_local: gastoLocal ?? undefined,
    })
    if (error) { refresh(); return fallo(error, 'No se pudo confirmar la factura.') }
    const res = z.object({
      remito_generado: z.string().nullable(),
      impacto: Impacto,
      gasto_creado: z.boolean(),
      diferencias: z.number(),
      precios_actualizados: z.number().optional(),
    }).safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'La factura se confirmó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({
      remitoGenerado: res.data.remito_generado,
      impacto: res.data.impacto,
      gastoCreado: res.data.gasto_creado,
      diferencias: res.data.diferencias,
      preciosActualizados: res.data.precios_actualizados ?? 0,
    })
  } catch (e) {
    return fallo(e, 'No se pudo confirmar la factura.')
  }
}

const AnularFactura = z.object({ facturaId: z.uuid(), motivo: z.string().trim().min(1) })

export interface FacturaAnulada {
  remitoEliminado: string | null
  impacto: ImpactoStock
  /** Qué pasó con su gasto: se borró (lo había creado la factura) o se desvinculó. */
  gasto: 'eliminado' | 'desvinculado' | null
}

export async function anularFactura(
  entrada: z.input<typeof AnularFactura>,
): Promise<Resultado<FacturaAnulada>> {
  const parsed = AnularFactura.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Contá por qué anulás la factura: queda registrado.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_anular_factura', {
      p_factura_id: parsed.data.facturaId,
      p_motivo: parsed.data.motivo,
    })
    if (error) { refresh(); return fallo(error, 'No se pudo anular la factura.') }
    const res = z.object({
      remito_eliminado: z.string().nullable(),
      impacto: Impacto,
      gasto: z.enum(['eliminado', 'desvinculado']).nullable(),
    }).safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'La factura se anuló, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({ remitoEliminado: res.data.remito_eliminado, impacto: res.data.impacto, gasto: res.data.gasto })
  } catch (e) {
    return fallo(e, 'No se pudo anular la factura.')
  }
}

export async function descartarFactura(facturaId: string): Promise<Resultado<null>> {
  if (!z.uuid().safeParse(facturaId).success) return fallo(null, 'No encontramos la factura. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('compras_descartar_factura', { p_factura_id: facturaId })
    if (error) { refresh(); return fallo(error, 'No se pudo descartar el borrador.') }
    refresh()
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo descartar el borrador.')
  }
}

// ---------------------------------------------------------------------------
// F5: gasto de la factura y diferencias con lo recibido.
// ---------------------------------------------------------------------------

const BuscarGasto = z.object({ proveedorId: z.uuid(), monto: z.number().positive(), fecha: z.iso.date() })

export interface GastoCandidato {
  id: string
  fecha: string
  monto: number
  estado: string
  local: string
  categoria: string
  observaciones: string | null
}

/** FA10: gastos del proveedor cargados a mano que podrían ser esta factura. Solo lee: no refresca. */
export async function buscarGastosCandidatos(
  entrada: z.input<typeof BuscarGasto>,
): Promise<Resultado<GastoCandidato[]>> {
  const parsed = BuscarGasto.safeParse(entrada)
  if (!parsed.success) return ok([])
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_buscar_gasto_candidato', {
      p_proveedor_id: parsed.data.proveedorId,
      p_monto: parsed.data.monto,
      p_fecha: parsed.data.fecha,
    })
    if (error) return fallo(error, 'No pudimos buscar los gastos cargados a mano.')
    return ok((data ?? []).map(g => ({ ...g, observaciones: g.observaciones ?? null })))
  } catch (e) {
    return fallo(e, 'No pudimos buscar los gastos cargados a mano.')
  }
}

const ResolverDiferencia = z.object({
  diferenciaId: z.uuid(),
  resolucion: z.enum(['ajusta_stock', 'reclamo_proveedor', 'ignorada']),
  nota: z.string().trim().max(500).nullable(),
})

const RespuestaDiferencia = z.object({ delta: z.number().nullable(), cantidad_despues: z.number().nullable() })

export interface CambioDiferencia { delta: number | null; cantidadDespues: number | null }

export async function resolverDiferencia(
  entrada: z.input<typeof ResolverDiferencia>,
): Promise<Resultado<CambioDiferencia>> {
  const parsed = ResolverDiferencia.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Elegí qué hacer con la diferencia.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_resolver_diferencia', {
      p_diferencia_id: parsed.data.diferenciaId,
      p_resolucion: parsed.data.resolucion,
      p_nota: parsed.data.nota || undefined,
    })
    if (error) { refresh(); return fallo(error, 'No se pudo resolver la diferencia.') }
    const res = RespuestaDiferencia.safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'La diferencia se resolvió, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({ delta: res.data.delta, cantidadDespues: res.data.cantidad_despues })
  } catch (e) {
    return fallo(e, 'No se pudo resolver la diferencia.')
  }
}

export async function revertirDiferencia(diferenciaId: string): Promise<Resultado<CambioDiferencia>> {
  if (!z.uuid().safeParse(diferenciaId).success) return fallo(null, 'No encontramos la diferencia. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_revertir_diferencia', { p_diferencia_id: diferenciaId })
    if (error) { refresh(); return fallo(error, 'No se pudo revertir.') }
    const res = RespuestaDiferencia.safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'Se revirtió, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({ delta: res.data.delta, cantidadDespues: res.data.cantidad_despues })
  } catch (e) {
    return fallo(e, 'No se pudo revertir.')
  }
}
