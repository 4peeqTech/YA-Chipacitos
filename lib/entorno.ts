// Única fuente de verdad de a qué proyecto de Supabase apunta cada entorno.
//
// Sin imports de next/* ni React: se usa desde next.config.ts (build, Node),
// proxy.ts (edge) y lib/supabase/server.ts (runtime del servidor).
//
// Los refs están hardcodeados a propósito: no son secretos (viajan en el
// bundle de todas formas) y si vivieran en una env var, el mismo tipo de
// error que causó el incidente del 2026-09-01 (env vars de prod apuntando
// a dev) desactivaría esta guardia en silencio.
export const REF_PROD = 'ahlpthzsjipdpcnjbfdk'
export const REF_DEV = 'fafckqysyvtlslfnpzrh'

export function refDeUrl(url: string | undefined | null): string | null {
  if (!url) return null
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i)
  return m ? m[1].toLowerCase() : null
}

function base64UrlDecode(segment: string): string | null {
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return atob(padded)
  } catch {
    return null
  }
}

// Las keys legacy de Supabase son JWT (header.payload.signature) con un
// claim `ref`. Las keys nuevas (sb_secret_…/sb_publishable_…) no lo tienen:
// en ese caso devolvemos null ("no verificable") en vez de romper.
export function refDeKey(key: string | undefined | null): string | null {
  if (!key) return null
  const parts = key.split('.')
  if (parts.length !== 3) return null
  const payloadJson = base64UrlDecode(parts[1])
  if (!payloadJson) return null
  try {
    const payload = JSON.parse(payloadJson) as { ref?: string }
    return payload.ref ? payload.ref.toLowerCase() : null
  } catch {
    return null
  }
}

export interface EntornoInput {
  vercelEnv: string | undefined
  url: string | undefined
  anonKey: string | undefined
  serviceRoleKey?: string | undefined
}

export interface EntornoResultado {
  ok: boolean
  ref: string | null
  problemas: string[]
}

export function verificarEntorno({ vercelEnv, url, anonKey, serviceRoleKey }: EntornoInput): EntornoResultado {
  const problemas: string[] = []
  const refUrl = refDeUrl(url)
  const refAnon = refDeKey(anonKey)
  const refService = refDeKey(serviceRoleKey)

  if (!refUrl) {
    problemas.push(`No se pudo determinar el proyecto de Supabase desde NEXT_PUBLIC_SUPABASE_URL (${url || 'vacía'}).`)
  }

  if (refAnon && refUrl && refAnon !== refUrl) {
    problemas.push(`La anon key es del proyecto ${refAnon} pero la URL apunta a ${refUrl}.`)
  }

  if (refService && refUrl && refService !== refUrl) {
    problemas.push(`La service role key es del proyecto ${refService} pero la URL apunta a ${refUrl}.`)
  }

  if (vercelEnv === 'production' && refUrl && refUrl !== REF_PROD) {
    problemas.push(
      `BUILD ABORTADO: en producción la URL apunta a ${refUrl}, esto es la base de DEV (${REF_DEV}). Tiene que apuntar a ${REF_PROD}.`
    )
  }

  return { ok: problemas.length === 0, ref: refUrl, problemas }
}

export function mensajeEntorno(resultado: EntornoResultado): string {
  if (resultado.ok) return `✅ Supabase: proyecto ${resultado.ref}`
  return `❌ Supabase: ${resultado.problemas.join(' ')}`
}

let cache: EntornoResultado | null = null

// Memoizado por proceso: el chequeo cruza NEXT_PUBLIC_* (inlineados en build)
// contra SUPABASE_SERVICE_ROLE_KEY (leída en runtime), así que detecta env
// vars cambiadas sin redeploy. Falla cerrado en producción.
export function verificarEntornoServidor(): EntornoResultado {
  if (cache) return cache
  const resultado = verificarEntorno({
    vercelEnv: process.env.VERCEL_ENV,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  cache = resultado
  if (!resultado.ok) {
    if (process.env.VERCEL_ENV === 'production') {
      throw new Error(mensajeEntorno(resultado))
    }
    console.error(mensajeEntorno(resultado))
  }
  return resultado
}
