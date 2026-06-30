import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/push/subscribe
// Body: PushSubscription del browser (endpoint, keys.p256dh, keys.auth)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sub = await request.json()
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  }

  // Un mismo dispositivo/navegador puede generar el mismo endpoint para
  // distintas cuentas (alguien se desloguea y entra con otro usuario en
  // el mismo celular). RLS no deja "robarle" la fila a otro user_id desde
  // la sesión propia, así que esta reasignación va con service role —
  // el endpoint es del dispositivo, tiene que quedar con quien esté
  // logueado ahora.
  const { error } = await getAdminClient()
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
