import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
          .select('rol')
          .eq('id', user.id)
          .single()

        const redirectMap: Record<string, string> = {
          local: '/local/pedidos',
          deposito: '/deposito/pedidos',
          fabrica: '/fabrica/pedidos',
          admin: '/admin/dashboard',
        }
        const dest = profile?.rol ? redirectMap[profile.rol] : '/login'
        return NextResponse.redirect(new URL(dest, request.url))
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
      .select('rol')
      .eq('id', user.id)
      .single()

    const rol = profile?.rol

    const rolRoutes: Record<string, string[]> = {
      local: ['/local', '/ayuda'],
      deposito: ['/deposito', '/ayuda'],
      fabrica: ['/fabrica', '/ayuda'],
      admin: ['/admin', '/local', '/deposito', '/fabrica', '/ayuda'],
    }

    if (rol) {
      const allowed = rolRoutes[rol] || []
      const hasAccess = allowed.some((r) => pathname.startsWith(r))
      if (!hasAccess) {
        const redirectMap: Record<string, string> = {
          local: '/local/pedidos',
          deposito: '/deposito/pedidos',
          fabrica: '/fabrica/pedidos',
          admin: '/admin/dashboard',
        }
        return NextResponse.redirect(new URL(redirectMap[rol], request.url))
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
