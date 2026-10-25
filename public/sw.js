// La versión nueva toma el control enseguida (si no, quedaba esperando a que se
// cerraran todas las pestañas y el cambio al tocar la notificación no llegaba).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  const title = data.title || 'YA! Chipacitos'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/chipacitos-logo.png',
      badge: '/chipacitos-logo.png',
      tag: data.tag || 'tarea',
      data: { url: data.url || '/tareas' },
    })
  )
})

// Al tocar la notificación: si la app ya está abierta, se enfoca y va a esa
// dirección (por ejemplo /local/historial?pedido=<id> abre el pedido); si no,
// se abre ahí.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/tareas', self.location.origin).href
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const abierta = ventanas.find(c => new URL(c.url).origin === self.location.origin)
    if (abierta) {
      try {
        if (abierta.url !== url && 'navigate' in abierta) await abierta.navigate(url)
        return await abierta.focus()
      } catch {
        // Si no se pudo navegar esa ventana (no la controla este worker), se abre una nueva.
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
