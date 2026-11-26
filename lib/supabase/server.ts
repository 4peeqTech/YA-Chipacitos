import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { verificarEntornoServidor } from '@/lib/entorno'
import type { Database } from '@/lib/database.types'
import { COOKIE_VER_COMO, fetchSoloLectura } from '@/lib/permisos/verComo'

async function opcionesCookies() {
  const cookieStore = await cookies()
  return {
    // "Ver como" (T7): con la cookie, lee y no escribe (server components y server actions).
    global: { fetch: fetchSoloLectura((...a) => fetch(...a), () => !!cookieStore.get(COOKIE_VER_COMO)) },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  }
}

// No tipado genéricamente con <Database> a propósito: enchufarlo acá tipa
// ~115 archivos de golpe (todos los .from().select() sueltos del repo, hoy
// con interfaces propias más laxas que el esquema real) y rompe `tsc --noEmit`
// con ~500 errores en consumidores que nadie tocó. Para código nuevo (Server
// Actions incluidas) usar createClientTipado().
export async function createClient() {
  verificarEntornoServidor()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    await opcionesCookies()
  )
}

export async function createClientTipado() {
  verificarEntornoServidor()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    await opcionesCookies()
  )
}
