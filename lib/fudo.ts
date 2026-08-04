const FUDO_AUTH_URL = 'https://auth.fu.do/api'
const FUDO_API_URL = 'https://api.fu.do/v1alpha1'

function slugSucursal(sucursal: string): string {
  return sucursal.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// Credenciales por sucursal: viven en variables de entorno (FUDO_API_KEY_<SLUG> /
// FUDO_API_SECRET_<SLUG>), no en la base de datos, para poder rotarlas sin tocar
// código ni migraciones.
export function getFudoCredentials(sucursal: string): { apiKey: string; apiSecret: string } | null {
  const slug = slugSucursal(sucursal)
  const apiKey = process.env[`FUDO_API_KEY_${slug}`]
  const apiSecret = process.env[`FUDO_API_SECRET_${slug}`]
  if (!apiKey || !apiSecret) return null
  return { apiKey, apiSecret }
}

export async function getFudoToken(apiKey: string, apiSecret: string): Promise<string> {
  const res = await fetch(FUDO_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ apiKey, apiSecret }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Fudo auth failed: ${res.status}`)
  const data = await res.json()
  return data.token
}

export async function fudoGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${FUDO_API_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Fudo API error ${res.status}: ${path}`)
  return res.json()
}

export function normalizeJsonApi(data: {
  data: Array<{ id: string; type: string; attributes?: Record<string, unknown>; relationships?: Record<string, unknown> }>;
  included?: Array<{ id: string; type: string; attributes?: Record<string, unknown> }>;
}): Array<Record<string, unknown>> {
  const includedMap = new Map<string, Record<string, unknown>>()
  for (const item of data.included ?? []) {
    includedMap.set(`${item.type}:${item.id}`, item.attributes ?? {})
  }

  return data.data.map(item => {
    const attrs: Record<string, unknown> = { id: item.id, ...item.attributes }
    const rels = item.relationships as Record<string, { data: { type: string; id: string } | Array<{ type: string; id: string }> | null }> | undefined
    if (rels) {
      for (const [key, rel] of Object.entries(rels)) {
        if (!rel.data) continue
        if (Array.isArray(rel.data)) {
          attrs[key] = rel.data.map(r => ({ id: r.id, ...includedMap.get(`${r.type}:${r.id}`) }))
        } else {
          attrs[key] = { id: rel.data.id, ...includedMap.get(`${rel.data.type}:${rel.data.id}`) }
        }
      }
    }
    return attrs
  })
}
