import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ROLE_HOME, getModuloPorPath, MODULOS } from '@/lib/modulos'

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
        const { data: profile } = await supabase
          .from('profiles')
          .select('rol, modulos_permitidos')
          .eq('id', user.id)
          .single()

        let dest = profile?.rol ? ROLE_HOME[profile.rol as keyof typeof ROLE_HOME] : '/login'
        // Squad no tiene un home fijo: depende de qué módulos tiene asignados.
        if (profile?.rol === 'squad') {
          const modulosPermitidos: string[] = profile.modulos_permitidos || []
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('rol, modulos_permitidos')
      .eq('id', user.id)
      .single()

    const rol = profile?.rol
    const modulosPermitidos: string[] = profile?.modulos_permitidos || []

    // /tareas es transversal a todos los roles: el acceso real lo decide
    // modulos_permitidos (o ser admin), no el rol en sí.
    if (pathname.startsWith('/tareas')) {
      if (rol !== 'admin' && !modulosPermitidos.includes('tareas')) {
        return NextResponse.redirect(new URL(rol ? ROLE_HOME[rol as keyof typeof ROLE_HOME] : '/login', request.url))
      }
      return supabaseResponse
    }

    const rolRoutes: Record<string, string[]> = {
      local: ['/local', '/ayuda'],
      deposito: ['/deposito', '/ayuda'],
      fabrica: ['/fabrica', '/ayuda'],
      admin: ['/admin', '/local', '/deposito', '/fabrica', '/ayuda'],
      squad: ['/admin', '/ayuda'],
    }

    if (rol) {
      const allowed = rolRoutes[rol] || []
      const hasAccess = allowed.some((r) => pathname.startsWith(r))
      if (!hasAccess) {
        return NextResponse.redirect(new URL(ROLE_HOME[rol as keyof typeof ROLE_HOME], request.url))
      }

      // Squad: dentro de /admin/*, solo puede entrar a los módulos que
      // tiene asignados en modulos_permitidos.
      if (rol === 'squad' && pathname.startsWith('/admin')) {
        const modulo = getModuloPorPath(pathname)
        const tieneAcceso = modulo && modulosPermitidos.includes(modulo.key)
        if (!tieneAcceso) {
          const primerModulo = MODULOS.find(m => modulosPermitidos.includes(m.key))
          // Si no tiene NINGÚN módulo asignado, '/ayuda' es la única ruta que
          // rolRoutes.squad permite sin permisos — evita un loop con /login.
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
