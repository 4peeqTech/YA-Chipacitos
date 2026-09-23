import { Inbox } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const comprasSolicitudes: SeccionManual = {
  slug: 'compras-solicitudes',
  titulo: 'Solicitudes de fábrica',
  icono: Inbox,
  area: 'compras',
  roles: ['admin'],
  modulos: ['compras-pedidos'],
  resumen: 'Lo que fábrica calculó que hay que comprar, listo para convertir en pedidos.',
  actualizado: '2026-09-23',
  proximamente: true,
  pendiente: 'Se completa con la entrega H4: avisos de sobrestock y sugerencias en las solicitudes.',
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Cuando fábrica cierra el conteo semanal, el sistema calcula qué hay que comprar y te llega como solicitud. Desde acá la revisás, la ajustás y la convertís en pedidos a cada proveedor.' },
      ],
    },
  ],
}
