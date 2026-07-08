import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/notificaciones/pedidos
// Body: { destino: 'deposito' | 'fabrica', title, body, url? }
//   → notifica a todos los operadores con rol = destino.
// Body: { pedidoId: string, title, body, url? }
//   → notifica al local dueño de ESE pedido (resuelto server-side).
// No se acepta un userIds arbitrario: el llamador nunca elige a quién
// avisar directamente, solo "el destino de este pedido" o "el dueño de
// este pedido puntual", ambos resueltos acá con service role.
export async function POST(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return NextResponse.json({ sent: 0, failed: 0 })
    }

    webpush.setVapidDetails(
      'mailto:soporte@chipacitos.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { destino, pedidoId, title, body, url } = await request.json()
    const admin = getAdminClient()

    let userIds: string[]
    if (destino === 'deposito' || destino === 'fabrica') {
      const { data: operadores } = await admin.from('profiles').select('id').eq('rol', destino)
      userIds = (operadores || []).map(p => p.id)
    } else if (pedidoId) {
      const { data: pedido } = await admin.from('pedidos').select('local_id').eq('id', pedidoId).single()
      userIds = pedido?.local_id ? [pedido.local_id] : []
    } else {
      return NextResponse.json({ error: 'Falta destino o pedidoId' }, { status: 400 })
    }
    if (!userIds.length) return NextResponse.json({ sent: 0, failed: 0 })

    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds)
    if (!subs?.length) return NextResponse.json({ sent: 0, failed: 0 })

    const urlDefault = destino ? `/${destino}/pedidos` : '/local/historial'
    const payload = JSON.stringify({ title, body, url: url || urlDefault, tag: 'pedido' })

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
    )

    const failed = results.filter(r => r.status === 'rejected').length
    return NextResponse.json({ sent: subs.length - failed, failed })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
