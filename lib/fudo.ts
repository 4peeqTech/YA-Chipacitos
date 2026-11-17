import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const FUDO_AUTH_URL = 'https://auth.fu.do/api'
const FUDO_API_URL = 'https://api.fu.do/v1alpha1'

/** 'YA! SAENZ PEÑA' → 'YA_SAENZ_PENA': sin tildes ni Ñ, que no van en el nombre de una variable. */
export function slugSucursal(sucursal: string): string {
  return sucursal.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// Credenciales por sucursal (13-11): las que se cargan en Integraciones ›
// Conexión Fudo viven en la base, con el secret cifrado en Vault, y solo las
// lee el servidor (fudo_conexion_leer pide service role). Las variables de
// entorno (FUDO_API_KEY_<SLUG> / FUDO_API_SECRET_<SLUG>) quedan de respaldo
// para un local que todavía no tenga claves cargadas ahí.
function clienteServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function getFudoCredentials(sucursal: string): Promise<{ apiKey: string; apiSecret: string } | null> {
  const db = clienteServidor()
  if (db) {
    const { data, error } = await db.rpc('fudo_conexion_leer', { p_local: sucursal })
    if (error) console.error(`[fudo] no se pudieron leer las claves de ${sucursal}:`, error.message)
    const fila = data?.[0]
    if (fila?.api_key && fila.api_secret) return { apiKey: fila.api_key, apiSecret: fila.api_secret }
  }
  const slug = slugSucursal(sucursal)
  const apiKey = process.env[`FUDO_API_KEY_${slug}`]
  const apiSecret = process.env[`FUDO_API_SECRET_${slug}`]
  if (!apiKey || !apiSecret) return null
  return { apiKey, apiSecret }
}

export type PruebaFudo = 'ok' | 'rechazada' | 'esperar' | 'sin_respuesta'

/** Prueba un par de claves pidiendo un token (no lee ni escribe nada en Fudo). */
export async function probarCredencialesFudo(apiKey: string, apiSecret: string): Promise<PruebaFudo> {
  try {
    const res = await fetch(FUDO_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ apiKey, apiSecret }),
      cache: 'no-store',
    })
    if (res.status === 429) return 'esperar'
    if (res.status === 401 || res.status === 403) return 'rechazada'
    if (!res.ok) return 'sin_respuesta'
    const data = await res.json() as { token?: string; exp?: number }
    if (data.token) {
      const vence = typeof data.exp === 'number' ? data.exp * 1000 - 5 * 60_000 : Date.now() + 30 * 60_000
      tokens.set(apiKey, { token: data.token, vence })
      await clienteServidor()?.from('fudo_tokens').upsert({ api_key: apiKey, token: data.token, vence: new Date(vence).toISOString() })
    }
    return 'ok'
  } catch {
    return 'sin_respuesta'
  }
}

// El token dura ~24 h y Fudo limita cuántas veces se pide (429 si se pide seguido):
// se reusa hasta 5 minutos antes de que venza.
const tokens = new Map<string, { token: string; vence: number }>()

/** Espera lo que pidió Fudo con Retry-After (en segundos), con un tope. */
function esperaPedida(res: Response, tope = 15_000): number | null {
  const s = Number(res.headers.get('retry-after'))
  if (!Number.isFinite(s) || s <= 0) return 5_000
  return s * 1000 <= tope ? s * 1000 : null
}

/**
 * El token de una API Key. Se reusa hasta 5 minutos antes de que venza: primero
 * el de este proceso, después el guardado en la base (fudo_tokens, lo comparten
 * todos los procesos de Vercel) y recién si no hay, se le pide uno a Fudo.
 */
export async function getFudoToken(apiKey: string, apiSecret: string): Promise<string> {
  const guardado = tokens.get(apiKey)
  if (guardado && guardado.vence > Date.now()) return guardado.token

  const db = clienteServidor()
  if (db) {
    const { data } = await db.from('fudo_tokens').select('token, vence').eq('api_key', apiKey).maybeSingle()
    const vence = data ? Date.parse(data.vence) : 0
    if (data && vence > Date.now()) {
      tokens.set(apiKey, { token: data.token, vence })
      return data.token
    }
  }

  const pedir = () => fetch(FUDO_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ apiKey, apiSecret }),
    cache: 'no-store',
  })
  let res = await pedir()
  if (res.status === 429) {
    const espera = esperaPedida(res)
    if (espera != null) {
      await new Promise(r => setTimeout(r, espera))
      res = await pedir()
    }
  }
  if (res.status === 429) throw new Error('Fudo pidió esperar un rato antes de volver a consultar (429).')
  if (!res.ok) throw new Error(`Fudo auth failed: ${res.status}`)
  const data = await res.json() as { token: string; exp?: number }
  const vence = typeof data.exp === 'number' ? data.exp * 1000 - 5 * 60_000 : Date.now() + 30 * 60_000
  tokens.set(apiKey, { token: data.token, vence })
  if (db) {
    const { error } = await db.from('fudo_tokens').upsert({ api_key: apiKey, token: data.token, vence: new Date(vence).toISOString() })
    if (error) console.error('[fudo] no se pudo guardar el token:', error.message)
  }
  return data.token
}

/** Para cuando Fudo rechaza un token guardado (401): el próximo getFudoToken pide uno nuevo. */
export async function olvidarFudoToken(apiKey: string): Promise<void> {
  tokens.delete(apiKey)
  await clienteServidor()?.from('fudo_tokens').delete().eq('api_key', apiKey)
}

export async function fudoGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${FUDO_API_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Fudo API error ${res.status}: ${path}`)
  return res.json()
}

type Ref = { type: string; id: string }
type Relaciones = Record<string, { data?: Ref | Ref[] | null }>
type Recurso = { id: string; type: string; attributes?: Record<string, unknown>; relationships?: Relaciones }

export function normalizeJsonApi(data: {
  data: Array<{ id: string; type: string; attributes?: Record<string, unknown>; relationships?: Record<string, unknown> }>;
  included?: Array<{ id: string; type: string; attributes?: Record<string, unknown>; relationships?: Record<string, unknown> }>;
}): Array<Record<string, unknown>> {
  const includedMap = new Map<string, Recurso>()
  for (const item of data.included ?? []) {
    includedMap.set(`${item.type}:${item.id}`, item as Recurso)
  }

  // Resuelve las relaciones de un recurso contra lo incluido. `nivel` limita la
  // profundidad: con 2 llega, por ejemplo, venta → pagos → forma de pago
  // (include=payments.paymentMethod), que antes quedaba sin nombre.
  function resolver(rels: Relaciones | undefined, nivel: number): Record<string, unknown> {
    const res: Record<string, unknown> = {}
    if (!rels || nivel <= 0) return res
    const uno = (r: Ref) => {
      const inc = includedMap.get(`${r.type}:${r.id}`)
      return { id: r.id, ...inc?.attributes, ...resolver(inc?.relationships, nivel - 1) }
    }
    for (const [key, rel] of Object.entries(rels)) {
      if (!rel?.data) continue
      res[key] = Array.isArray(rel.data) ? rel.data.map(uno) : uno(rel.data)
    }
    return res
  }

  return data.data.map(item => ({
    id: item.id,
    ...item.attributes,
    ...resolver(item.relationships as Relaciones | undefined, 2),
  }))
}
