'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import type { AdjuntoFila, GastoFila, PagoFila } from '@/lib/gastos/modelo'
import { pendientesDeLocal } from './datos'

// Acciones de la sección Gastos. La autorización y las reglas (un gasto que
// salió de una factura no cambia monto ni proveedor, ni se elimina) viven en
// las RPC: estas acciones son alcanzables por POST directo. Si la RPC rechaza,
// también se refresca, para que la pantalla quede con lo que hay en la base.

const Texto = z.string().trim().min(1)

const Pago = z.object({
  fechaPago: z.iso.date(),
  formaPago: Texto,
  caja: Texto,
  /** Ruta del archivo en el bucket privado de comprobantes. */
  comprobanteUrl: z.string().trim().min(1).max(500).nullable(),
})

const GuardarGasto = z.object({
  id: z.uuid().nullable(),
  fecha: z.iso.date(),
  local: Texto,
  // Vacíos solo en un gasto de Fudo sin clasificar: la base lo exige en el resto.
  rubro: z.string().trim(),
  categoria: z.string().trim(),
  proveedorId: z.uuid().nullable(),
  monto: z.number().positive(),
  formaPago: Texto,
  observaciones: z.string().nullable(),
  fechaVencimiento: z.iso.date().nullable(),
  /** Solo en el alta: el gasto se carga ya pagado. */
  pago: Pago.omit({ formaPago: true }).nullable(),
})

export async function guardarGasto(entrada: z.input<typeof GuardarGasto>): Promise<Resultado<string>> {
  const p = GuardarGasto.safeParse(entrada)
  if (!p.success) return fallo(null, 'Revisá el gasto: faltan datos o el monto no es válido.')
  const d = p.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('gastos_guardar', {
      p_id: d.id ?? undefined,
      p_fecha: d.fecha,
      p_local: d.local,
      p_rubro: d.rubro || undefined,
      p_categoria: d.categoria || undefined,
      p_proveedor_id: d.proveedorId ?? undefined,
      p_monto: d.monto,
      p_forma_pago: d.formaPago,
      p_observaciones: d.observaciones ?? undefined,
      p_pago: d.id || !d.pago ? undefined : {
        fecha_pago: d.pago.fechaPago, caja: d.pago.caja, comprobante_url: d.pago.comprobanteUrl,
      },
      p_fecha_vencimiento: d.fechaVencimiento ?? undefined,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo guardar el gasto.')
    return ok(data)
  } catch (e) {
    return fallo(e, 'No se pudo guardar el gasto.')
  }
}

/** monto null = lo que falta pagar (la base no deja pagar de más). */
export async function registrarPagoGasto(
  entrada: z.input<typeof Pago> & { id: string; monto?: number | null },
): Promise<Resultado<null>> {
  const p = Pago.extend({ id: z.uuid(), monto: z.number().positive().nullable().optional() }).safeParse(entrada)
  if (!p.success) return fallo(null, 'Revisá el pago: hacen falta la fecha, la forma de pago, la caja y un monto mayor a $ 0.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('gastos_registrar_pago', {
      p_id: p.data.id,
      p_fecha_pago: p.data.fechaPago,
      p_forma_pago: p.data.formaPago,
      p_caja: p.data.caja,
      p_comprobante_url: p.data.comprobanteUrl ?? undefined,
      p_monto: p.data.monto ?? undefined,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo registrar el pago.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo registrar el pago.')
  }
}

/** Anula un pago: deja de sumar, pero queda en el historial con quién, cuándo y por qué. */
export async function anularPagoGasto(pagoId: string, motivo: string | null): Promise<Resultado<null>> {
  if (!z.uuid().safeParse(pagoId).success) return fallo(null, 'No encontramos ese pago. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('gastos_anular_pago', {
      p_pago_id: pagoId,
      p_motivo: motivo?.trim().slice(0, 300) || undefined,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo anular el pago.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo anular el pago.')
  }
}

const Adjunto = z.object({
  gastoId: z.uuid(),
  ruta: z.string().trim().min(1).max(500),
  nombre: z.string().trim().min(1).max(200),
  tipo: z.string().max(100).nullable(),
  tamano: z.number().int().nonnegative().nullable(),
})

/** Registra un archivo ya subido al bucket (la factura o el ticket del gasto). */
export async function agregarAdjuntoGasto(entrada: z.input<typeof Adjunto>): Promise<Resultado<null>> {
  const p = Adjunto.safeParse(entrada)
  if (!p.success) return fallo(null, 'No se pudo registrar el archivo. Probá subirlo de nuevo.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('gastos_agregar_adjunto', {
      p_gasto_id: p.data.gastoId,
      p_ruta: p.data.ruta,
      p_nombre: p.data.nombre,
      p_tipo: p.data.tipo ?? undefined,
      p_tamano: p.data.tamano ?? undefined,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo registrar el archivo.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo registrar el archivo.')
  }
}

/** Saca el adjunto y devuelve la ruta para que el navegador borre el archivo. */
export async function quitarAdjuntoGasto(id: string): Promise<Resultado<string | null>> {
  if (!z.uuid().safeParse(id).success) return fallo(null, 'No encontramos ese archivo. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('gastos_quitar_adjunto', { p_id: id })
    refresh()
    if (error) return fallo(error, 'No se pudo quitar el archivo.')
    return ok(data ?? null)
  } catch (e) {
    return fallo(e, 'No se pudo quitar el archivo.')
  }
}

/** Pagos (vigentes y anulados) y adjuntos de un gasto, para su formulario. */
export async function detalleGasto(id: string): Promise<Resultado<{ pagos: PagoFila[]; adjuntos: AdjuntoFila[] }>> {
  if (!z.uuid().safeParse(id).success) return fallo(null, 'No encontramos el gasto. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const [pagos, adjuntos] = await Promise.all([
      supabase.from('v_gastos_pagos').select('*').eq('gasto_id', id).order('fecha', { ascending: false }),
      supabase.from('gastos_adjuntos').select('*').eq('gasto_id', id).order('created_at'),
    ])
    if (pagos.error || adjuntos.error) return fallo(pagos.error ?? adjuntos.error, 'No pudimos traer los pagos y archivos del gasto.')
    return ok({ pagos: pagos.data ?? [], adjuntos: adjuntos.data ?? [] })
  } catch (e) {
    return fallo(e, 'No pudimos traer los pagos y archivos del gasto.')
  }
}

const MasPendientes = z.object({
  local: Texto,
  desde: z.union([z.iso.date(), z.literal('')]),
  hasta: z.union([z.iso.date(), z.literal('')]),
  q: z.string().max(100),
  orden: z.enum(['viejos', 'nuevos']),
  offset: z.number().int().nonnegative(),
  cuantos: z.number().int().min(1).max(100),
})

/** "Ver más" de un local en Pendientes: la siguiente tanda, filtrada por la base. */
export async function masPendientes(entrada: z.input<typeof MasPendientes>): Promise<Resultado<GastoFila[]>> {
  const p = MasPendientes.safeParse(entrada)
  if (!p.success) return fallo(null, 'No se pudieron traer más gastos. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { local, offset, cuantos, ...f } = p.data
    const { data, error } = await pendientesDeLocal(supabase, { ...f, local: '' }, local, offset, cuantos)
    if (error) return fallo(error, 'No se pudieron traer más gastos.')
    return ok(data ?? [])
  } catch (e) {
    return fallo(e, 'No se pudieron traer más gastos.')
  }
}

export async function eliminarGasto(id: string): Promise<Resultado<null>> {
  if (!z.uuid().safeParse(id).success) return fallo(null, 'No encontramos el gasto. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('gastos_eliminar', { p_id: id })
    refresh()
    if (error) return fallo(error, 'No se pudo eliminar el gasto.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo eliminar el gasto.')
  }
}

// ---------------------------------------------------------------------------
// Gastos que se repiten (plantillas).
// ---------------------------------------------------------------------------

const Recurrente = z.object({
  id: z.uuid().nullable(),
  nombre: Texto.max(120),
  local: Texto,
  rubro: Texto,
  categoria: Texto,
  proveedorId: z.uuid().nullable(),
  monto: z.number().positive(),
  montoVariable: z.boolean(),
  formaPago: Texto,
  diaDelMes: z.number().int().min(1).max(31),
  diasParaVencer: z.number().int().min(0).max(120).nullable(),
  desde: z.iso.date(),
  hasta: z.iso.date().nullable(),
  observaciones: z.string().max(500).nullable(),
})

export async function guardarRecurrente(entrada: z.input<typeof Recurrente>): Promise<Resultado<string>> {
  const p = Recurrente.safeParse(entrada)
  if (!p.success) return fallo(null, 'Revisá el gasto que se repite: faltan datos o hay alguno inválido.')
  const d = p.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('gastos_recurrente_guardar', {
      p_id: d.id ?? undefined,
      p_nombre: d.nombre,
      p_local: d.local,
      p_rubro: d.rubro,
      p_categoria: d.categoria,
      p_proveedor_id: d.proveedorId ?? undefined,
      p_monto: d.monto,
      p_monto_variable: d.montoVariable,
      p_forma_pago: d.formaPago,
      p_dia_del_mes: d.diaDelMes,
      p_dias_para_vencer: d.diasParaVencer ?? undefined,
      p_desde: d.desde,
      p_hasta: d.hasta ?? undefined,
      p_observaciones: d.observaciones?.trim() || undefined,
    })
    if (error) { refresh(); return fallo(error, 'No se pudo guardar el gasto que se repite.') }
    // Genera ya lo que corresponda (por ejemplo, el de este mes si el día ya pasó).
    await supabase.rpc('gastos_generar_recurrentes', {})
    refresh()
    return ok(data)
  } catch (e) {
    return fallo(e, 'No se pudo guardar el gasto que se repite.')
  }
}

export async function activarRecurrente(id: string, activo: boolean): Promise<Resultado<null>> {
  if (!z.uuid().safeParse(id).success) return fallo(null, 'No encontramos ese gasto que se repite. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('gastos_recurrente_activar', { p_id: id, p_activo: activo })
    if (!error && activo) await supabase.rpc('gastos_generar_recurrentes', {})
    refresh()
    if (error) return fallo(error, activo ? 'No se pudo reactivar.' : 'No se pudo pausar.')
    return ok(null)
  } catch (e) {
    return fallo(e, activo ? 'No se pudo reactivar.' : 'No se pudo pausar.')
  }
}

export async function eliminarRecurrente(id: string): Promise<Resultado<null>> {
  if (!z.uuid().safeParse(id).success) return fallo(null, 'No encontramos ese gasto que se repite. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('gastos_recurrente_eliminar', { p_id: id })
    refresh()
    if (error) return fallo(error, 'No se pudo eliminar.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo eliminar.')
  }
}
