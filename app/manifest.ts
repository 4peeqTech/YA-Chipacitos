import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'YA! Chipacitos — Sistema de Gestión',
    short_name: 'YA! Chipacitos',
    description: 'Sistema interno de pedidos, conciliación y tareas',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#111111',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
