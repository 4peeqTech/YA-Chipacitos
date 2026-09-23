import { Truck } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const comprasRemitos: SeccionManual = {
  slug: 'compras-remitos',
  titulo: 'Remitos',
  icono: Truck,
  area: 'compras',
  roles: ['admin'],
  modulos: ['compras-pedidos'],
  resumen: 'Registrar lo que llega de cada pedido; el stock se suma solo.',
  actualizado: '2026-09-23',
  proximamente: true,
  pendiente: 'Se completa con la entrega H1: remitos con código propio (R-0001-01) y stock que se mueve solo.',
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Cada vez que llega mercadería de un pedido, la cargás como remito. Lo que registrás en el remito es lo que suma al stock.' },
      ],
    },
  ],
}
