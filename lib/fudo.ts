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
