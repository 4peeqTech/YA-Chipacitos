'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { CLAVES_AVISOS, RANGO, configAFilas, leerConfigAvisos, type ConfigAvisos } from '@/lib/compras/avisos'
import { correrAvisos } from '@/lib/compras/avisosServidor'

const Dias = z.number().int().min(RANGO.dias.min).max(RANGO.dias.max)

const Config = z.object({
  diasDemora: Dias,
  repetirDias: z.number().int().min(RANGO.repetir.min).max(RANGO.repetir.max),
  diasDiferencias: Dias,
  diasNc: Dias,
  activo: z.object({
    remito_listo: z.boolean(),
    pedido_demorado: z.boolean(),
    diferencias: z.boolean(),
    nc_pendiente: z.boolean(),
    stock_bajo: z.boolean(),
  }),
})

async function exigirAdmin() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: 'Iniciá sesión.' }
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).maybeSingle()
  if (perfil?.rol !== 'admin') return { supabase, user: null, error: 'Solo un administrador puede cambiar los avisos.' }
  return { supabase, user, error: null }
}

/** Guarda los 9 parámetros de Compras › Avisos. La RLS (es_admin()) es el respaldo. */
export async function guardarConfigAvisos(entrada: ConfigAvisos): Promise<Resultado<{ cambios: number }>> {
  const parsed = Config.safeParse(entrada)
  if (!parsed.success) {
    return fallo(null, `Revisá los días: van de ${RANGO.dias.min} a ${RANGO.dias.max}, y repetir de ${RANGO.repetir.min} a ${RANGO.repetir.max}.`)
  }
  try {
    const { supabase, error: noAdmin } = await exigirAdmin()
    if (noAdmin) return fallo(null, noAdmin)

    const { data: actuales, error: errLeer } = await supabase.from('compras_config').select('clave, valor').in('clave', CLAVES_AVISOS)
    if (errLeer) return fallo(errLeer, 'No se pudieron leer los avisos.')
    const antes = configAFilas(leerConfigAvisos(actuales ?? []))
    const presentes = new Set((actuales ?? []).map(f => f.clave))
    const ahora = new Date().toISOString()
    // Lo que cambió, y las claves que todavía no estaban en la base (se guardan con el valor elegido).
    const cambios = configAFilas(parsed.data).filter((f, i) => f.valor !== antes[i].valor || !presentes.has(f.clave))
    if (cambios.length === 0) return ok({ cambios: 0 })

    const { error } = await supabase
      .from('compras_config')
      .upsert(cambios.map(f => ({ clave: f.clave, valor: f.valor, updated_at: ahora })), { onConflict: 'clave' })
    if (error) return fallo(error, 'No se pudieron guardar los avisos.')

    revalidatePath('/admin/compras/avisos')
    revalidatePath('/admin/compras/pedidos')
    revalidatePath('/admin/proveedores')
    revalidatePath('/admin/dashboard')
    return ok({ cambios: cambios.length })
  } catch (e) {
    return fallo(e, 'No se pudieron guardar los avisos.')
  }
}

/** "Revisar ahora": corre los mismos chequeos que el aviso diario. */
export async function revisarAvisosAhora(): Promise<Resultado<{ texto: string }>> {
  try {
    const { user, error: noAdmin } = await exigirAdmin()
    if (noAdmin || !user) return fallo(null, noAdmin ?? 'Iniciá sesión.')
    const resumen = await correrAvisos({ origen: 'manual', por: user.id })
    revalidatePath('/admin/compras/avisos')
    if (resumen.error) return fallo(null, 'No se pudo revisar los avisos. Probá de nuevo en un rato.')
    return ok({ texto: resumen.texto })
  } catch (e) {
    return fallo(e, 'No se pudo revisar los avisos.')
  }
}
