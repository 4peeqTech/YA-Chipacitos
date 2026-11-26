import { createBrowserClient } from '@supabase/ssr'
import { fetchSoloLectura, verComoEnNavegador } from '@/lib/permisos/verComo'

// No tipado genéricamente con <Database> a propósito — ver el comentario en
// lib/supabase/server.ts. Para código nuevo, tipar puntual con
// createBrowserClient<Database>() en el archivo (ver lib/db.ts).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Latido de realtime cada 5 s (por defecto, 25 s). Si la conexión queda
      // "zombi" (el iPhone la suspendió al bloquearse, la señal cambió) se
      // detecta en ~10 s y se reconecta; con 25 s, el local tardaba ~48 s en ver
      // que el mayorista había cambiado el pedido (medido el 25-10).
      realtime: { heartbeatIntervalMs: 5000 },
      // "Ver como" (T7): con la cookie, lee y no escribe.
      global: { fetch: fetchSoloLectura((...a) => fetch(...a), verComoEnNavegador) },
    },
  )
}
