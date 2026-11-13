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
    }
    return 'ok'
  } catch {
    return 'sin_respuesta'
  }
}

// El token dura ~24 h y Fudo limita cuántas veces se pide (429 si se pide seguido):
// se reusa hasta 5 minutos antes de que venza.
const tokens = new Map<string, { token: string; vence: number }>()

export async function getFudoToken(apiKey: string, apiSecret: string): Promise<string> {
  const guardado = tokens.get(apiKey)
  if (guardado && guardado.vence > Date.now()) return guardado.token
  const res = await fetch(FUDO_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ apiKey, apiSecret }),
    cache: 'no-store',
  })
  if (res.status === 429) throw new Error('Fudo pidió esperar un rato antes de volver a consultar (429).')
  if (!res.ok) throw new Error(`Fudo auth failed: ${res.status}`)
  const data = await res.json() as { token: string; exp?: number }
  const vence = typeof data.exp === 'number' ? data.exp * 1000 - 5 * 60_000 : Date.now() + 30 * 60_000
  tokens.set(apiKey, { token: data.token, vence })
  return data.token
}

/** Para cuando Fudo rechaza un token guardado (401): el próximo getFudoToken pide uno nuevo. */
export function olvidarFudoToken(apiKey: string): void {
  tokens.delete(apiKey)
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
