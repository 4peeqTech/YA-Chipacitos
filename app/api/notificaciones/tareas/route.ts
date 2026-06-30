import { createClient } from '@/lib/supabase/server'
import webpush from 'web-push'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/notificaciones/tareas
// Body: { userIds: string[], title: string, body: string, url?: string }
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

    const { userIds, title, body, url } = await request.json()
    if (!userIds?.length) return NextResponse.json({ sent: 0, failed: 0 })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)

    if (!subs?.length) return NextResponse.json({ sent: 0, failed: 0 })

    const payload = JSON.stringify({ title, body, url: url || '/tareas', tag: 'tarea' })

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
