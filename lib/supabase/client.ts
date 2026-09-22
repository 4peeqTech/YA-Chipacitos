import { createBrowserClient } from '@supabase/ssr'

// No tipado genéricamente con <Database> a propósito — ver el comentario en
// lib/supabase/server.ts. Para código nuevo, tipar puntual con
// createBrowserClient<Database>() en el archivo (ver lib/db.ts).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
