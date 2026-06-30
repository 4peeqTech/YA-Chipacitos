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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/tareas'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
