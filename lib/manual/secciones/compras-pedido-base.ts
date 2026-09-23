import { CalendarClock } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const comprasPedidoBase: SeccionManual = {
  slug: 'compras-pedido-base',
  titulo: 'Pedido base',
  icono: CalendarClock,
  area: 'compras',
  roles: ['admin'],
  modulos: ['compras-pedidos'],
  resumen: 'El pedido fijo de cada semana y las sugerencias por sobrestock.',
  actualizado: '2026-09-23',
  proximamente: true,
  pendiente: 'Se completa con la entrega H4: sugerencias para pedir menos cuando sobra stock.',
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'El pedido base es la lista fija de insumos que se pide todas las semanas. Desde acá lo generás y revisás antes de mandarlo.' },
      ],
    },
  ],
}
