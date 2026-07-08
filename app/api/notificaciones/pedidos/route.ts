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
// Body: { destino: 'deposito' | 'fabrica', title: string, body: string, url?: string }
// Notifica a todos los operadores con rol = destino (no recibe userIds: el
// cliente que crea el pedido no tiene por qué poder leer perfiles ajenos).
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

    const { destino, title, body, url } = await request.json()
    if (destino !== 'deposito' && destino !== 'fabrica') {
      return NextResponse.json({ error: 'Destino inválido' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: operadores } = await admin.from('profiles').select('id').eq('rol', destino)
    const userIds = (operadores || []).map(p => p.id)
    if (!userIds.length) return NextResponse.json({ sent: 0, failed: 0 })

    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds)
    if (!subs?.length) return NextResponse.json({ sent: 0, failed: 0 })

    const payload = JSON.stringify({ title, body, url: url || `/${destino}/pedidos`, tag: 'pedido' })

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
