import { Undo2 } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const comprasDevoluciones: SeccionManual = {
  slug: 'compras-devoluciones',
  titulo: 'Devoluciones al proveedor',
  icono: Undo2,
  area: 'compras',
  roles: ['admin'],
  modulos: ['compras-pedidos'],
  resumen: 'Devolver mercadería con motivo y registrar la nota de crédito.',
  actualizado: '2026-09-23',
  proximamente: true,
  pendiente: 'Se completa con la entrega H3: devoluciones con motivo y nota de crédito.',
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Cuando algo llega mal, vas a poder registrar la devolución con su motivo, indicar si el proveedor repone y cargar la nota de crédito.' },
      ],
    },
  ],
}
