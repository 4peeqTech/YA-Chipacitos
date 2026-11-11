'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { MENSAJE_NC_REPETIDA } from '@/lib/errores'
import { ALICUOTAS } from '@/lib/compras/totalesFactura'

// B4. La autorización es de las RPC (tiene_acceso_compras() / es_admin(), E15):
// estas acciones son alcanzables por POST directo. Si la RPC rechaza también se
// refresca, para que la pantalla quede con lo que hay en la base.

const Impacto = z.array(z.object({
  item_id: z.uuid(),
  nombre: z.string().nullable(),
  unidad: z.string().nullable(),
  delta: z.number(),
  cantidad_despues: z.number().nullable(),
}))
export type ImpactoDevolucion = z.infer<typeof Impacto>

const Alicuota = z.number().refine(v => (ALICUOTAS as readonly number[]).includes(v))

const NcRespuesta = z.object({
  id: z.uuid(),
  numero: z.string(),
  total: z.number(),
  gasto: z.string().nullable(),
  monto_antes: z.number().nullable().optional(),
  monto_despues: z.number().nullable().optional(),
})
export type NotaCreditoCargada = z.infer<typeof NcRespuesta>

/** El unique de número es el mismo de las facturas: acá se sabe que era una NC. */
function falloNc(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.code === '23505' && error.message?.includes('compras_facturas_numero_unique')) return fallo(null, MENSAJE_NC_REPETIDA)
  return fallo(error, fallback)
}

// ---------------------------------------------------------------------------

const Registrar = z.object({
  pedidoId: z.uuid(),
  motivoId: z.uuid(),
  repone: z.boolean(),
  items: z.array(z.object({
    itemId: z.uuid().nullable(),
    pedidoItemId: z.uuid().nullable(),
    facturaItemId: z.uuid().nullable(),
    cantidad: z.number().positive(),
    cantidadBase: z.number().positive().nullable(),
    precioCorrecto: z.number().min(0).nullable(),
  })).min(1),
  nota: z.string().trim().max(500).nullable(),
  notaCredito: z.object({
    numero: z.string().trim().min(1).max(40),
    fecha: z.iso.date(),
    totalPapel: z.number().min(0).nullable(),
    lineas: z.array(z.object({ indice: z.number().int().min(0), precioUnitario: z.number().positive(), alicuotaIva: Alicuota })).min(1),
  }).nullable(),
  diferenciaId: z.uuid().nullable(),
})

export interface DevolucionRegistrada {
  id: string
  codigo: string
  impacto: ImpactoDevolucion
  estadoRecepcion: string | null
  notaCredito: NotaCreditoCargada | null
}

export async function registrarDevolucion(entrada: z.input<typeof Registrar>): Promise<Resultado<DevolucionRegistrada>> {
  const parsed = Registrar.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Revisá la devolución: falta el motivo o alguna cantidad.')
  const d = parsed.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_registrar_devolucion', {
      p_pedido_id: d.pedidoId,
      p_motivo_id: d.motivoId,
      p_repone: d.repone,
      p_items: d.items.map(i => ({
        item_id: i.itemId,
        pedido_item_id: i.pedidoItemId,
        factura_item_id: i.facturaItemId,
        cantidad: i.cantidad,
        cantidad_base: i.cantidadBase,
        precio_correcto: i.precioCorrecto,
      })),
      p_nota: d.nota || undefined,
      p_nota_credito: d.notaCredito ? {
        numero: d.notaCredito.numero,
        fecha: d.notaCredito.fecha,
        total_papel: d.notaCredito.totalPapel,
        lineas: d.notaCredito.lineas.map(l => ({ indice: l.indice, precio_unitario: l.precioUnitario, alicuota_iva: l.alicuotaIva })),
      } : undefined,
      p_diferencia_id: d.diferenciaId ?? undefined,
    })
    if (error) { refresh(); return falloNc(error, 'No se pudo registrar la devolución.') }
    const res = z.object({
      id: z.uuid(),
      codigo: z.string(),
      impacto: Impacto,
      estado_recepcion: z.string().nullable(),
      nota_credito: NcRespuesta.nullable(),
    }).safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'La devolución se registró, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({
      id: res.data.id, codigo: res.data.codigo, impacto: res.data.impacto,
      estadoRecepcion: res.data.estado_recepcion, notaCredito: res.data.nota_credito,
    })
  } catch (e) {
    return fallo(e, 'No se pudo registrar la devolución.')
  }
}

// ---------------------------------------------------------------------------

const CargarNc = z.object({
  devolucionId: z.uuid(),
  numero: z.string().trim().min(1).max(40),
  fecha: z.iso.date(),
  totalPapel: z.number().min(0).nullable(),
  lineas: z.array(z.object({ devolucionItemId: z.uuid(), precioUnitario: z.number().positive(), alicuotaIva: Alicuota })).min(1),
})

export async function cargarNotaCredito(
  entrada: z.input<typeof CargarNc>,
): Promise<Resultado<{ notaCredito: NotaCreditoCargada; diferenciasPendientes: number }>> {
  const parsed = CargarNc.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Revisá la nota de crédito: hacen falta el número, la fecha y los precios.')
  const d = parsed.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_cargar_nota_credito', {
      p_devolucion_id: d.devolucionId,
      p_numero: d.numero,
      p_fecha: d.fecha,
      p_lineas: d.lineas.map(l => ({ devolucion_item_id: l.devolucionItemId, precio_unitario: l.precioUnitario, alicuota_iva: l.alicuotaIva })),
      p_total_papel: d.totalPapel ?? undefined,
    })
    if (error) { refresh(); return falloNc(error, 'No se pudo cargar la nota de crédito.') }
    const res = z.object({ nota_credito: NcRespuesta, diferencias_pendientes: z.number() }).safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'La nota de crédito se cargó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({ notaCredito: res.data.nota_credito, diferenciasPendientes: res.data.diferencias_pendientes })
  } catch (e) {
    return fallo(e, 'No se pudo cargar la nota de crédito.')
  }
}

// ---------------------------------------------------------------------------

const Anular = z.object({ devolucionId: z.uuid(), motivo: z.string().trim().min(1).max(300) })

export async function anularNotaCredito(
  entrada: z.input<typeof Anular>,
): Promise<Resultado<{ gasto: string | null; montoDespues: number | null }>> {
  const parsed = Anular.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Contá por qué anulás la nota de crédito.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_anular_nota_credito', {
      p_devolucion_id: parsed.data.devolucionId, p_motivo: parsed.data.motivo,
    })
    if (error) { refresh(); return fallo(error, 'No se pudo anular la nota de crédito.') }
    const res = z.object({ gasto: z.string().nullable(), monto_despues: z.number().nullable().optional() }).safeParse(data)
    refresh()
    return ok({ gasto: res.success ? res.data.gasto : null, montoDespues: res.success ? res.data.monto_despues ?? null : null })
  } catch (e) {
    return fallo(e, 'No se pudo anular la nota de crédito.')
  }
}

export async function anularDevolucion(
  entrada: z.input<typeof Anular>,
): Promise<Resultado<{ impacto: ImpactoDevolucion; estadoRecepcion: string | null; notaCreditoAnulada: boolean; gasto: string | null }>> {
  const parsed = Anular.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Contá por qué anulás la devolución: queda en el historial.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_anular_devolucion', {
      p_devolucion_id: parsed.data.devolucionId, p_motivo: parsed.data.motivo,
    })
    if (error) { refresh(); return fallo(error, 'No se pudo anular la devolución.') }
    const res = z.object({
      impacto: Impacto,
      estado_recepcion: z.string().nullable(),
      nota_credito_anulada: z.boolean(),
      gasto: z.string().nullable(),
    }).safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'La devolución se anuló, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({
      impacto: res.data.impacto, estadoRecepcion: res.data.estado_recepcion,
      notaCreditoAnulada: res.data.nota_credito_anulada, gasto: res.data.gasto,
    })
  } catch (e) {
    return fallo(e, 'No se pudo anular la devolución.')
  }
}
