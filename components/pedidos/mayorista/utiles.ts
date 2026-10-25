import type { Pedido, PedidoItem, PedidoMensaje } from '@/lib/types'

// Utilidades de la pantalla del mayorista: alertas de pedido nuevo (sonido y
// notificación del navegador, igual que el tablero viejo), tiempos relativos,
// sumas con decimales y mensajes sin leer.

// El sonido vive en lib/sonido (se despierta con el primer toque: Safari).
export { sonarAviso } from '@/lib/sonido'

export function notificarNavegador(pedido: Pedido) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  const items = (pedido.pedido_items ?? []).map(i => `${cantidadAEnviar(i)}× ${i.producto_nombre}`).join(', ')
  try {
    const notif = new Notification(`Nuevo pedido #${pedido.numero}`, {
      body: `${pedido.local_nombre}${items ? `\n${items}` : ''}`,
      icon: '/chipacitos-logo.png',
      tag: pedido.id,
      requireInteraction: true,
    })
    notif.onclick = () => { window.focus(); notif.close() }
  } catch {}
}

/** Lo que sale: enviada si el mayorista la fijó, si no lo pedido (D3). */
export function cantidadAEnviar(i: Pick<PedidoItem, 'cantidad' | 'cantidad_enviada'>): number {
  return Number(i.cantidad_enviada ?? i.cantidad)
}

/** Suma sin arrastrar errores de coma flotante (0,1 + 0,2 = 0,3). */
export function sumar(a: number, b: number): number {
  return Math.round((a + b) * 1000) / 1000
}

export function haceCuanto(iso: string, ahora: number): string {
  const min = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ''}`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d > 1 ? 's' : ''}`
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ROLES_OPERADOR = new Set(['mayorista', 'admin', 'fabrica'])

/**
 * Mensajes del local que todavía no se vieron: los posteriores a la última
 * respuesta del operador y a la última vez que se abrió el pedido acá.
 */
export function mensajesSinLeer(mensajes: PedidoMensaje[] | undefined, usuarioId: string, vistoEn?: number): number {
  if (!mensajes?.length) return 0
  const ordenados = [...mensajes].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  let desde = vistoEn ?? 0
  for (const m of ordenados) {
    if (m.autor_id === usuarioId || ROLES_OPERADOR.has(m.autor_rol)) desde = Math.max(desde, new Date(m.created_at).getTime())
  }
  return ordenados.filter(m =>
    m.autor_id !== usuarioId && !ROLES_OPERADOR.has(m.autor_rol) && new Date(m.created_at).getTime() > desde,
  ).length
}

const CLAVE_VISTOS = 'mayorista-pedidos-vistos'

export function leerVistos(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CLAVE_VISTOS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** Marca el pedido como visto ahora y lo guarda. Devuelve el mapa nuevo. */
export function marcarVisto(vistos: Record<string, number>, pedidoId: string): Record<string, number> {
  const siguientes = { ...vistos, [pedidoId]: Date.now() }
  guardarVistos(siguientes)
  return siguientes
}

function guardarVistos(vistos: Record<string, number>) {
  try {
    // Solo los últimos 300 para que no crezca para siempre.
    const recientes = Object.entries(vistos).sort((a, b) => b[1] - a[1]).slice(0, 300)
    localStorage.setItem(CLAVE_VISTOS, JSON.stringify(Object.fromEntries(recientes)))
  } catch {}
}
