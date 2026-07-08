# Notificaciones en tiempo real + push: cómo armarlo en cualquier sistema

Guía portable de lo que implementamos en YA! Chipacitos (módulo de Pedidos). Pensada para copiar/adaptar a otro proyecto Next.js + Supabase. Los nombres de tabla/columnas son genéricos a propósito.

## El problema que resuelve

Cuando un usuario necesita enterarse de un evento (pedido nuevo, tarea asignada, alerta) apenas pasa, hay dos maneras de avisarle, y **conviene usar las dos juntas, no una sola**:

| Capa | Cómo funciona | Cuándo falla |
|---|---|---|
| **Realtime en la pestaña** (Supabase Realtime / WebSocket) | El browser mantiene una conexión abierta; cuando cambia una fila, corre JS en la página y muestra sonido/banner/`Notification()` nativa | Se cae en silencio tras horas de pestaña abierta (suspensión de laptop, cambio de red, throttling del browser) y no hay ningún evento visible que lo delate |
| **Web Push real** (Service Worker + VAPID) | El *servidor* empuja la notificación a través del servicio de push del navegador/SO. El Service Worker la muestra aunque la pestaña esté cerrada o el navegador minimizado | Necesita que el usuario haya dado permiso y esté suscripto; en dev no se puede automatizar (los navegadores headless deniegan el permiso por política) |

La realtime-en-pestaña es instantánea pero fresca solo mientras la pestaña esté viva y conectada. El push es la red de seguridad que llega igual aunque la pestaña esté cerrada.

## Piezas necesarias

1. Tabla `push_subscriptions` en la base (una fila = un dispositivo/navegador).
2. Claves VAPID (par de claves pública/privada, generadas una vez para todo el proyecto).
3. Un `sw.js` (Service Worker) en `/public` que escuche el evento `push`.
4. Endpoint para guardar/reclamar una suscripción (`POST`) y para darla de baja (`DELETE`).
5. Endpoint para *enviar* el push (usa la librería `web-push` server-side).
6. En el cliente: botón que pide permiso, registra el SW, se suscribe y guarda la suscripción — y su contraparte para desactivar.
7. (Opcional pero recomendado) Reconexión resiliente del canal realtime + polling de respaldo.

## 1. Tabla

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,   -- identifica el dispositivo+navegador
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
```

`endpoint` es único **por dispositivo**, no por usuario. Un mismo dispositivo puede terminar "perteneciendo" a distintas cuentas si varias personas lo usan (ver gotcha #1).

## 2. Claves VAPID

Se generan una sola vez:

```bash
npx web-push generate-vapid-keys
```

Van a variables de entorno:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

## 3. Service Worker (`public/sw.js`)

```js
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  const title = data.title || 'Mi App'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: data.tag || 'default',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
```

Registralo una sola vez en el layout raíz (componente cliente, sin UI):

```tsx
'use client'
export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
```

## 4. Endpoint: guardar / reclamar suscripción

```ts
// app/api/push/subscribe/route.ts
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

  // Reasignación deliberada: el endpoint es del DISPOSITIVO, no de la
  // cuenta. Si otra persona usó este mismo navegador antes y activó
  // notificaciones con su usuario, este upsert "roba" el endpoint para
  // quien esté logueado ahora — es el comportamiento correcto.
  const { error } = await getAdminClient()
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// DELETE: desactivar solo ESTE dispositivo (no afecta otros del mismo usuario)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { endpoint } = await request.json()
  if (!endpoint) return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 })

  const { error } = await getAdminClient()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

## 5. Endpoint: enviar el push

```ts
// app/api/notificaciones/[algo]/route.ts
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ sent: 0, failed: 0 })
  }
  webpush.setVapidDetails('mailto:soporte@tuapp.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { userIds, title, body, url } = await request.json()
  if (!userIds?.length) return NextResponse.json({ sent: 0, failed: 0 })

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds)
  if (!subs?.length) return NextResponse.json({ sent: 0, failed: 0 })

  const payload = JSON.stringify({ title, body, url: url || '/', tag: 'default' })
  const results = await Promise.allSettled(
    subs.map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload))
  )
  const failed = results.filter(r => r.status === 'rejected').length
  return NextResponse.json({ sent: subs.length - failed, failed })
}
```

Definí quién recibe (`userIds`) del lado del **servidor** con service role (no dejes que el cliente elija a quién notificar leyendo `profiles` de otros usuarios — no tiene permiso vía RLS, y no debería tenerlo).

## 6. Cliente: activar / desactivar

```ts
// lib/push.ts — helper compartido
export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
```

```ts
async function activarNotificaciones() {
  if (!('Notification' in window)) return
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  const reg = await navigator.serviceWorker.register('/sw.js')
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

  // Forzar suscripción nueva: una vieja de otra cuenta en el mismo
  // dispositivo puede devolverse "viva" sin que el servicio de push la reconozca.
  const existente = await reg.pushManager.getSubscription()
  if (existente) await existente.unsubscribe()

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  })
  await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
}

async function desactivarNotificaciones() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) })
}
```

**Reclamo automático al cargar la página** (importante, ver gotcha #1): si ya existe una suscripción local, hay que re-mandarla al backend para que quede asociada a la cuenta actual, no asumir que ya está bien:

```ts
useEffect(() => {
  navigator.serviceWorker?.getRegistration('/sw.js').then(async reg => {
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
  }).catch(() => {})
}, [])
```

### UI recomendada

No uses un banner que "se activa y desaparece para siempre" — dejá siempre visible un control con los dos estados:

```
🔔 Aviso persistente activado    [Desactivar]
🔕 Aviso persistente desactivado [Activar]
```

Más los dos casos de borde: permiso `default` (nunca preguntado → pedirlo) y `denied` (el usuario lo bloqueó desde el navegador → avisar que hay que desbloquearlo manualmente, JS no puede forzarlo).

## 7. Realtime resiliente (la otra mitad)

Si además usás Supabase Realtime para la actualización instantánea en pestaña, dos cosas rompen con el uso real (pestaña abierta muchas horas):

**a) Reconectar cuando el canal reporta error**, y además un **polling de respaldo** para cuando se cae *sin* avisar (el caso más común):

```ts
useEffect(() => {
  let channel: ReturnType<typeof supabase.channel> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function conectar() {
    // Topic único por intento: si reconectás antes de que el `leave` del
    // canal anterior termine del lado del servidor, supabase-js devuelve
    // ESE MISMO canal (ya suscripto) al pedir el mismo topic, y `.on()`
    // explota con "cannot add callbacks after subscribe()".
    const topic = `canal-${Math.random().toString(36).slice(2)}`
    channel = supabase.channel(topic)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mi_tabla' }, (payload) => { /* ... */ })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (channel) supabase.removeChannel(channel)
          retryTimer = setTimeout(conectar, 3000)
        }
      })
  }
  conectar()

  function alVolver() { if (document.visibilityState === 'visible') refrescar() }
  document.addEventListener('visibilitychange', alVolver)
  const poll = setInterval(() => { if (document.visibilityState === 'visible') refrescar() }, 120000)

  return () => {
    document.removeEventListener('visibilitychange', alVolver)
    clearInterval(poll)
    if (retryTimer) clearTimeout(retryTimer)
    if (channel) supabase.removeChannel(channel)
  }
}, [])
```

**b)** La función de refresco manual (`refrescar`/`actualizar`) conviene que compare contra lo que ya tenías en memoria y marque como "nuevo" (beep, badge) lo que apareció sin avisar — si no, el polling corrige los datos pero el usuario no se entera de que había algo nuevo.

## Gotchas (nos mordieron, ojo con esto)

1. **Dispositivo compartido entre cuentas.** El permiso de notificaciones y la suscripción push son del *navegador+origen*, no de la cuenta logueada. Si un admin activó push en un dispositivo y después un operador se loguea ahí, `pushManager.getSubscription()` le va a devolver esa suscripción vieja como si fuera suya — pero en la base sigue apuntando al admin. Solución: reclamarla (POST) cada vez que se detecta una existente, no solo cuando el usuario toca "Activar".
2. **Topic de canal repetido al reconectar.** `supabase.channel(topic)` devuelve el canal existente si ya hay uno con ese topic (aunque esté "muerto"), y llamar `.on()` sobre un canal ya suscripto tira error. Usá un topic único por intento de conexión.
3. **`document`/`window` en el cuerpo de un componente cliente.** `useRef(document.title)` (u otro acceso directo, fuera de `useEffect`) revienta el SSR con `ReferenceError: document is not defined` — un componente `'use client'` igual se renderiza una vez en el servidor. Siempre guardalo: `useRef(typeof document !== 'undefined' ? document.title : '')`, o mejor, seteálo dentro de un `useEffect`.
4. **No se puede probar el flujo de permiso en navegadores headless/CI.** Los entornos automatizados deniegan `Notification.requestPermission()` por política. El build/typecheck/lint no lo detectan — hay que probarlo a mano en un navegador real.

## Checklist para copiar esto a otro proyecto

- [ ] Tabla `push_subscriptions` + índice por `user_id`
- [ ] Claves VAPID generadas y en env vars (públicas y privada)
- [ ] `public/sw.js` con `push` + `notificationclick`
- [ ] `SWRegister` montado una vez en el layout raíz
- [ ] `POST /api/push/subscribe` (upsert por `endpoint`, con service role)
- [ ] `DELETE /api/push/subscribe` (borra por `endpoint` + `user_id` propio)
- [ ] `POST /api/notificaciones/...` que decide destinatarios server-side y llama `web-push`
- [ ] Botón activar/desactivar persistente en la UI (no un banner que se auto-oculta para siempre)
- [ ] Efecto de "reclamo automático" al montar si ya hay suscripción local
- [ ] (si usás realtime) reconexión + topic único + polling de respaldo
- [ ] Guard de `document`/`window` en cualquier acceso fuera de `useEffect`
