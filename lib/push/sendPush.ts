import { createClient as createAdminClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Envía una notificación push a un conjunto de usuarios, en proceso (sin pasar
// por HTTP), para poder llamarla tanto desde rutas con sesión de usuario como
// desde el cron (que no tiene cookies). También deja el registro en
// `notificaciones` para el panel in-app, independientemente de si el
// destinatario tiene push activado o no.
export async function enviarPush({ userIds, title, body, url, tipo = 'general' }: { userIds: string[]; title: string; body: string; url?: string; tipo?: string }) {
  if (!userIds?.length) return { sent: 0, failed: 0 }

  const admin = getAdminClient()

  const { error: notifError } = await admin.from('notificaciones').insert(
    userIds.map(user_id => ({ user_id, titulo: title, cuerpo: body, url: url || null, tipo }))
  )
  if (notifError) console.error('No se pudo insertar la notificación in-app', notifError)

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { sent: 0, failed: 0 }
  }

  webpush.setVapidDetails(
    'mailto:soporte@chipacitos.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  // RLS de push_subscriptions solo deja a cada usuario leer la suya —
  // acá necesitamos leer la de los destinatarios, así que va con el
  // cliente de service role.
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds)

  if (!subs?.length) return { sent: 0, failed: 0 }

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
  return { sent: subs.length - failed, failed }
}
