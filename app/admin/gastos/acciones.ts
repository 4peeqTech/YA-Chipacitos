'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'

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
  rubro: Texto,
  categoria: Texto,
  proveedorId: z.uuid().nullable(),
  monto: z.number().positive(),
  formaPago: Texto,
  observaciones: z.string().nullable(),
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
      p_rubro: d.rubro,
      p_categoria: d.categoria,
      p_proveedor_id: d.proveedorId ?? undefined,
      p_monto: d.monto,
      p_forma_pago: d.formaPago,
      p_observaciones: d.observaciones ?? undefined,
      p_pago: d.id || !d.pago ? undefined : {
        fecha_pago: d.pago.fechaPago, caja: d.pago.caja, comprobante_url: d.pago.comprobanteUrl,
      },
    })
    refresh()
    if (error) return fallo(error, 'No se pudo guardar el gasto.')
    return ok(data)
  } catch (e) {
    return fallo(e, 'No se pudo guardar el gasto.')
  }
}

export async function registrarPagoGasto(
  entrada: z.input<typeof Pago> & { id: string },
): Promise<Resultado<null>> {
  const p = Pago.extend({ id: z.uuid() }).safeParse(entrada)
  if (!p.success) return fallo(null, 'Revisá el pago: hacen falta la fecha, la forma de pago y la caja.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('gastos_registrar_pago', {
      p_id: p.data.id,
      p_fecha_pago: p.data.fechaPago,
      p_forma_pago: p.data.formaPago,
      p_caja: p.data.caja,
      p_comprobante_url: p.data.comprobanteUrl ?? undefined,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo registrar el pago.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo registrar el pago.')
  }
}

export async function deshacerPagoGasto(id: string): Promise<Resultado<null>> {
  if (!z.uuid().safeParse(id).success) return fallo(null, 'No encontramos el gasto. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('gastos_deshacer_pago', { p_id: id })
    refresh()
    if (error) return fallo(error, 'No se pudo deshacer el pago.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo deshacer el pago.')
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

const PagoFudo = Pago.extend({
  fudoExpenseId: Texto,
  sucursal: Texto,
  descripcion: z.string().nullable(),
  monto: z.number(),
  fechaGasto: z.iso.date().nullable(),
})

export async function registrarPagoFudo(entrada: z.input<typeof PagoFudo>): Promise<Resultado<null>> {
  const p = PagoFudo.safeParse(entrada)
  if (!p.success) return fallo(null, 'Revisá el pago: hacen falta la fecha, la forma de pago y la caja.')
  const d = p.data
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('fudo_registrar_pago', {
      p_fudo_expense_id: d.fudoExpenseId,
      p_sucursal: d.sucursal,
      p_descripcion: d.descripcion ?? undefined,
      p_monto: d.monto,
      p_fecha_gasto: d.fechaGasto ?? undefined,
      p_fecha_pago: d.fechaPago,
      p_forma_pago: d.formaPago,
      p_caja: d.caja,
      p_comprobante_url: d.comprobanteUrl ?? undefined,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo registrar el pago.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo registrar el pago.')
  }
}

export async function deshacerPagoFudo(id: string): Promise<Resultado<null>> {
  if (!z.uuid().safeParse(id).success) return fallo(null, 'No encontramos ese pago. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('fudo_deshacer_pago', { p_id: id })
    refresh()
    if (error) return fallo(error, 'No se pudo deshacer el pago.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo deshacer el pago.')
  }
}
