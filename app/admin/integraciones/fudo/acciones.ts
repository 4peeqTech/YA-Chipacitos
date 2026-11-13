'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { probarCredencialesFudo } from '@/lib/fudo'
import { sincronizacionActiva, sincronizarFudo } from '@/lib/gastos/fudoSync'

// Acciones de Integraciones › Conexión Fudo. La autorización vive en las RPC
// (piden admin); el secret nunca vuelve al navegador: se prueba, se guarda
// cifrado y listo.

const Texto = z.string().trim().min(1)

const Claves = z.object({
  local: Texto,
  apiKey: Texto.max(200),
  apiSecret: Texto.max(200),
})

export interface ResultadoConexion {
  /** null: no se pudo probar (Fudo pidió esperar); las claves igual quedaron guardadas. */
  probada: boolean | null
  /** Gastos de Fudo que se trajeron al conectar (si la sincronización está activa en este entorno). */
  gastos: number | null
}

/**
 * Prueba las claves contra Fudo y, si no las rechaza, las guarda. Si andan,
 * trae los gastos del local en ese momento.
 */
export async function guardarConexionFudo(entrada: z.input<typeof Claves>): Promise<Resultado<ResultadoConexion>> {
  const p = Claves.safeParse(entrada)
  if (!p.success) return fallo(null, 'Cargá el API Key y el API Secret.')
  const { local, apiKey, apiSecret } = p.data
  try {
    // Antes de hablar con Fudo: la acción es alcanzable por POST directo y no
    // tiene que servir para probar claves ajenas.
    const supabase = await createClientTipado()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = user ? await supabase.from('profiles').select('rol').eq('id', user.id).single() : { data: null }
    if (perfil?.rol !== 'admin') return fallo(null, 'Solo un administrador puede cargar las claves de Fudo.')

    const prueba = await probarCredencialesFudo(apiKey, apiSecret)
    if (prueba === 'rechazada') {
      return fallo(null, 'Fudo rechazó estas claves: no se guardaron. Revisá que estén completas y que el API Key y el API Secret sean del mismo usuario.')
    }
    if (prueba === 'sin_respuesta') {
      return fallo(null, 'Fudo no respondió: no se guardaron las claves. Probá de nuevo en un rato.')
    }
    const { error } = await supabase.rpc('fudo_conexion_guardar', {
      p_local: local,
      p_api_key: apiKey,
      p_api_secret: apiSecret,
      p_probada_ok: prueba === 'ok' ? true : undefined,
      p_probada_error: prueba === 'esperar' ? 'Fudo pidió esperar: se prueban en la próxima actualización.' : undefined,
    })
    if (error) { refresh(); return fallo(error, 'No se pudieron guardar las claves.') }

    let gastos: number | null = null
    if (prueba === 'ok' && sincronizacionActiva()) {
      const r = await sincronizarFudo(supabase, { origen: 'boton', soloLocal: local }).catch(() => null)
      const res = r?.locales.find(l => l.local === local)
      if (res?.ok && res.resumen) gastos = res.resumen.leidos
    }
    refresh()
    return ok({ probada: prueba === 'ok' ? true : null, gastos })
  } catch (e) {
    return fallo(e, 'No se pudieron guardar las claves.')
  }
}

/** Deja de usar Fudo en el local: se borran sus claves; los gastos ya traídos quedan. */
export async function desconectarFudo(local: string): Promise<Resultado<null>> {
  const p = Texto.safeParse(local)
  if (!p.success) return fallo(null, 'Falta el local.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('fudo_conexion_desconectar', { p_local: p.data })
    refresh()
    if (error) return fallo(error, 'No se pudo desconectar Fudo.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo desconectar Fudo.')
  }
}

const NuevoLocal = z.object({ nombre: Texto.max(80), caja: Texto.max(80) })

/** Devuelve el nombre con el que quedó (en mayúsculas). */
export async function agregarLocal(entrada: z.input<typeof NuevoLocal>): Promise<Resultado<string>> {
  const p = NuevoLocal.safeParse(entrada)
  if (!p.success) return fallo(null, 'Poné el nombre y la caja del local.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('locales_agregar', { p_sucursal: p.data.nombre, p_caja: p.data.caja })
    refresh()
    if (error) return fallo(error, 'No se pudo agregar el local.')
    return ok(data ?? p.data.nombre)
  } catch (e) {
    return fallo(e, 'No se pudo agregar el local.')
  }
}
