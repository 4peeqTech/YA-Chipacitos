import type { createClientTipado } from '@/lib/supabase/server'
import { FORMAS_PAGO } from '@/lib/gastos-constants'

type Cliente = Awaited<ReturnType<typeof createClientTipado>>

/**
 * Cajas y formas de pago activas (Parámetros › Cajas / Formas de pago). Si la
 * tabla de formas de pago está vacía, se cae a la lista fija histórica para que
 * nunca quede un formulario sin opciones.
 */
export async function consultarCatalogosPago(supabase: Cliente): Promise<{ cajas: string[]; formasPago: string[] }> {
  const [{ data: cajas }, { data: formas }] = await Promise.all([
    supabase.from('cajas').select('nombre, activo').order('nombre'),
    supabase.from('formas_pago').select('nombre, activo').order('nombre'),
  ])
  const activas = (filas: { nombre: string; activo: boolean | null }[] | null) =>
    (filas ?? []).filter(f => f.activo !== false).map(f => f.nombre)
  const formasPago = activas(formas)
  return { cajas: activas(cajas), formasPago: formasPago.length ? formasPago : [...FORMAS_PAGO] }
}
