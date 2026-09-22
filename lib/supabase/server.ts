import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { verificarEntornoServidor } from '@/lib/entorno'

// No tipado genéricamente con <Database> a propósito: enchufarlo acá tipa
// ~115 archivos de golpe (todos los .from().select() sueltos del repo, hoy
// con interfaces propias más laxas que el esquema real) y rompe `tsc --noEmit`
// con ~500 errores en consumidores que nadie tocó. Para código nuevo, tipar
// puntual con createClient<Database>() en el archivo (ver lib/db.ts).
export async function createClient() {
  verificarEntornoServidor()
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
