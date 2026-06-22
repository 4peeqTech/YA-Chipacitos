const FUDO_AUTH_URL = 'https://auth.fu.do/api'
const FUDO_API_URL = 'https://api.fu.do/v1alpha1'

export interface FudoCredential {
  sucursal: string
  apiKey: string
  apiSecret: string
}

export const FUDO_LOCALES: FudoCredential[] = [
  {
    sucursal: 'YA! PARAGUAY',
    apiKey: process.env.FUDO_PARAGUAY_API_KEY ?? '',
    apiSecret: process.env.FUDO_PARAGUAY_API_SECRET ?? '',
  },
  // Agregar más locales a medida que se configuren:
  // { sucursal: 'YA! SAN LORENZO', apiKey: process.env.FUDO_SANLORENZO_API_KEY ?? '', apiSecret: process.env.FUDO_SANLORENZO_API_SECRET ?? '' },
]

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

// Normaliza la respuesta JSON:API a un array plano
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

    // Resolver relationships
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
