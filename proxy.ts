import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { accesoDesdeRpc, areaDeRuta, homeDe, puede, puedeEntrarRuta } from '@/lib/permisos/acceso'
import { ACCIONES } from '@/lib/permisos/catalogo'
import { COOKIE_VER_COMO, MENSAJE_SOLO_LECTURA } from '@/lib/permisos/verComo'
import { verificarEntorno } from '@/lib/entorno'

const COOKIE_AREA = 'area'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // /api/entorno tiene que quedar accesible incluso con el entorno roto:
  // es el propio endpoint de diagnóstico, y devuelve su 503 con detalle.
  if (pathname === '/api/entorno') {
    return NextResponse.next({ request })
  }

  // Fail-closed: si el entorno de Supabase no verifica (env vars faltantes,
  // cruzadas entre proyectos, o prod apuntando a dev), no se sirve nada.
  // Cubre además el caso "promote/rollback a un deployment viejo", que el
  // guard de next.config.ts (que corre en build) no puede ver.
  const entorno = verificarEntorno({
    vercelEnv: process.env.VERCEL_ENV,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  if (!entorno.ok) {
    return new NextResponse('Servicio no disponible: configuración de entorno inválida.', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    })
  }

  // El mayorista se mudó a /mayorista (25-10). Las direcciones viejas (favoritos,
  // notificaciones ya mandadas) redirigen conservando el resto y la query (?pedido=).
  const mudado = pathname.match(/^\/fabrica\/(pedidos|catalogo)(\/.*)?$/)
  if (mudado) {
    const destino = request.nextUrl.clone()
    destino.pathname = `/mayorista/${mudado[1]}${mudado[2] ?? ''}`
    return NextResponse.redirect(destino)
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(
      // `entorno.ok` ya garantizó en runtime que están definidas y son del
      // mismo proyecto — el `!` es sobre eso, no una suposición nueva.
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // Las rutas de API siempre pasan. En "ver como" (T7), solo para leer: lo que
    // escribe se corta acá (salir del modo es /api/ver-como).
    const verComo = request.cookies.get(COOKIE_VER_COMO)?.value
    if (pathname.startsWith('/api/')) {
      if (verComo && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && pathname !== '/api/ver-como') {
        return NextResponse.json({ error: MENSAJE_SOLO_LECTURA }, { status: 403 })
      }
      return supabaseResponse
    }

    // Acceso efectivo (áreas, pantallas, acciones) calculado por la base: misma
    // regla que sus reglas. Épica roles y permisos, T3.
    // Con "ver como", el de la otra persona si quien mira gestiona usuarios (como cargarAcceso() del servidor).
    const cargarAcceso = async () => {
      const { data, error } = await supabase.rpc('mi_acceso')
      const propio = error ? null : accesoDesdeRpc(data)
      if (propio && verComo && verComo !== propio.id && puede(propio, ACCIONES.gestionarUsuarios)) {
        const { data: otro } = await supabase.rpc('acceso_de', { p_persona: verComo })
        const ajeno = accesoDesdeRpc(otro)
        if (ajeno) return { ...ajeno, quienMira: { id: propio.id, nombre: propio.nombre } }
      }
      return propio
    }

    // Última área en la que estuvo (selector de área, T4): / la lleva ahí.
    const areaPreferida = request.cookies.get(COOKIE_AREA)?.value ?? null

    if (pathname === '/') {
      if (user) {
        const acceso = await cargarAcceso()
        return NextResponse.redirect(new URL(acceso ? homeDe(acceso, areaPreferida) : '/login', request.url))
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (pathname === '/login') {
      // Con sesión pero sin acceso (persona inactiva) se queda en el login: si no, / y /login se rebotan.
      if (user && (await cargarAcceso())) {
        return NextResponse.redirect(new URL('/', request.url))
      }
      return supabaseResponse
    }

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const acceso = await cargarAcceso()
    if (!acceso) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Una cookie de "ver como" que ya no vale (ya no gestiona usuarios, la persona no
    // está activa) se borra: si no, el navegador seguiría en solo lectura sin banner.
    if (verComo && !acceso.quienMira) supabaseResponse.cookies.delete(COOKIE_VER_COMO)

    const decision = puedeEntrarRuta(acceso, pathname, areaPreferida)
    if (!decision.ok) {
      const destino = new URL(decision.destino, request.url)
      // El rebote es invisible sin esto: el usuario abre un link (una
      // notificación, por ejemplo) y aparece en otra pantalla sin saber por
      // qué. `sinAcceso` lo cuenta con un toast (ver AvisoRedireccion).
      if (decision.sinAcceso) destino.searchParams.set('sinAcceso', decision.sinAcceso)
      return NextResponse.redirect(destino)
    }

    const area = areaDeRuta(pathname)
    if (area && area !== areaPreferida) {
      supabaseResponse.cookies.set(COOKIE_AREA, area, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
    }

    return supabaseResponse
  } catch {
    // Si algo falla en auth, redirigir al login
    if (pathname !== '/login') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next({ request })
  }
}

export const config = {
  // sw.js y manifest.webmanifest tienen que quedar accesibles sin sesión:
  // el browser los pide para evaluar instalabilidad de la PWA antes de
  // que el usuario inicie sesión, y si se redirigen a /login el navegador
  // recibe HTML en vez del manifest/SW real y nunca ofrece instalar.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
