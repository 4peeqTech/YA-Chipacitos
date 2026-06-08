import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
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
  const pathname = request.nextUrl.pathname

  // Las rutas de API siempre pasan — la auth la maneja cada route handler
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
    local: ['/local'],
    deposito: ['/deposito'],
    fabrica: ['/fabrica'],
    admin: ['/admin', '/local', '/deposito', '/fabrica'],
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
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
