// "Ver como" (épica roles y permisos, T7): quien gestiona usuarios ve la app como
// otra persona, en solo lectura. La cookie `ver_como` (id de la persona) la pone
// y la saca /api/ver-como; cargarAcceso() y proxy.ts solo la respetan si quien la
// tiene gestiona usuarios.
//
// Solo lectura, sin tocar pantalla por pantalla: mientras la cookie está, el
// cliente de Supabase (navegador y servidor) deja pasar lecturas y corta toda
// escritura: tablas, storage y las funciones que la base no declara de lectura
// (STABLE / IMMUTABLE, que lista rpc_de_lectura()). Las rutas /api/* que
// escriben las corta proxy.ts. Lo que se intenta guardar vuelve con este error.

export const COOKIE_VER_COMO = 'ver_como'

export const MENSAJE_SOLO_LECTURA = 'Estás viendo como otra persona: es solo lectura, no se guarda nada.'

type Fetch = typeof fetch

function solicitud(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  return { url, metodo, headers }
}

function bloqueado() {
  return new Response(JSON.stringify({ code: 'VER_COMO', message: MENSAJE_SOLO_LECTURA, details: null, hint: null }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** fetch para el cliente de Supabase: con `activo()`, lee y no escribe. */
export function fetchSoloLectura(base: Fetch, activo: () => boolean): Fetch {
  let lectura: Promise<Set<string>> | null = null

  async function cargarLectura(origen: string, headers: Headers) {
    const h = new Headers({ apikey: headers.get('apikey') ?? '', Accept: 'application/json' })
    const auth = headers.get('Authorization')
    if (auth) h.set('Authorization', auth)
    const res = await base(`${origen}/rest/v1/rpc/rpc_de_lectura`, { method: 'GET', headers: h })
    if (!res.ok) throw new Error(`rpc_de_lectura: ${res.status}`)
    return new Set<string>(await res.json())
  }

  return async (input, init) => {
    if (!activo()) return base(input, init)
    const { url, metodo, headers } = solicitud(input, init)
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return base(input, init)
    // La sesión se sigue refrescando y se puede cerrar: es de quien mira. Cambiar
    // email o contraseña (PUT /auth/v1/user), no.
    if (url.pathname === '/auth/v1/token' || url.pathname === '/auth/v1/logout') return base(input, init)
    // Un link firmado para ver un adjunto es un POST, pero solo lee.
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return base(input, init)
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1]
    if (rpc) {
      lectura ??= cargarLectura(url.origin, headers)
      try {
        if ((await lectura).has(rpc)) return base(input, init)
      } catch {
        lectura = null // se reintenta en la próxima; mientras, no deja pasar
      }
    }
    return bloqueado()
  }
}

/** En el navegador: ¿está la cookie? (no es httpOnly a propósito: la lee este fetch). */
export function verComoEnNavegador(): boolean {
  return typeof document !== 'undefined' && document.cookie.split('; ').some(c => c.startsWith(`${COOKIE_VER_COMO}=`))
}
