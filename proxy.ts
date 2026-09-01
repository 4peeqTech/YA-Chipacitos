import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getRoleHome, getModuloPorPath, MODULOS, esRolConModulos } from '@/lib/modulos'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Si no hay variables de entorno configuradas, pasar todo sin auth
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

    // Las rutas de API siempre pasan
    if (pathname.startsWith('/api/')) {
      return supabaseResponse
    }

    if (pathname === '/') {
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('rol, modulos_permitidos')
          .eq('id', user.id)
          .single()

        if (profileError) {
          return NextResponse.redirect(new URL('/login', request.url))
        }

        let dest = profile?.rol ? getRoleHome(profile.rol) : '/login'
        // Squad y roles personalizados no tienen un home fijo: depende de
        // qué módulos tienen asignados.
        if (esRolConModulos(profile?.rol)) {
          const modulosPermitidos: string[] = profile?.modulos_permitidos || []
          const primerModulo = MODULOS.find(m => modulosPermitidos.includes(m.key))
          dest = primerModulo?.href || '/ayuda'
        }
        return NextResponse.redirect(new URL(dest || '/login', request.url))
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (pathname === '/login') {
      if (user) {
        return NextResponse.redirect(new URL('/', request.url))
      }
      return supabaseResponse
    }

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('rol, modulos_permitidos')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const rol = profile?.rol
    const modulosPermitidos: string[] = profile?.modulos_permitidos || []

    // /tareas es transversal a todos los roles: el acceso real lo decide
    // modulos_permitidos (o ser admin), no el rol en sí.
    if (pathname.startsWith('/tareas')) {
      if (rol !== 'admin' && !modulosPermitidos.includes('tareas')) {
        return NextResponse.redirect(new URL(rol ? getRoleHome(rol) : '/login', request.url))
      }
      return supabaseResponse
    }

    const rolRoutes: Record<string, string[]> = {
      local: ['/local', '/ayuda'],
      deposito: ['/deposito', '/ayuda'],
      supervisor_fabrica: ['/fabrica', '/ayuda'],
      mayorista: ['/fabrica/pedidos', '/fabrica/catalogo', '/ayuda'],
      admin: ['/admin', '/local', '/deposito', '/fabrica', '/ayuda'],
    }

    if (rol) {
      // Squad y roles personalizados: mismo árbol de rutas que admin
      // dentro de /admin, pero sin acceso a los portales operativos.
      const allowed = rolRoutes[rol] || (esRolConModulos(rol) ? ['/admin', '/ayuda'] : [])
      const hasAccess = allowed.some((r) => pathname.startsWith(r))
      if (!hasAccess) {
        return NextResponse.redirect(new URL(getRoleHome(rol), request.url))
      }

      // Squad y roles personalizados: dentro de /admin/*, solo pueden
      // entrar a los módulos que tienen asignados en modulos_permitidos.
      if (esRolConModulos(rol) && pathname.startsWith('/admin')) {
        const modulo = getModuloPorPath(pathname)
        const tieneAcceso = modulo && !modulo.soloAdmin && modulosPermitidos.includes(modulo.key)
        if (!tieneAcceso) {
          const primerModulo = MODULOS.find(m => modulosPermitidos.includes(m.key))
          // Si no tiene NINGÚN módulo asignado, '/ayuda' es la única ruta
          // permitida sin permisos — evita un loop con /login.
          return NextResponse.redirect(new URL(primerModulo?.href || '/ayuda', request.url))
        }
      }
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
