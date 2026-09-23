import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { verificarEntornoServidor } from '@/lib/entorno'
import type { Database } from '@/lib/database.types'

async function opcionesCookies() {
  const cookieStore = await cookies()
  return {
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
