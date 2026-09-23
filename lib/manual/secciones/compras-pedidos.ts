import { ClipboardList } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const comprasPedidos: SeccionManual = {
  slug: 'compras-pedidos',
  titulo: 'Pedidos a proveedores',
  icono: ClipboardList,
  area: 'compras',
  roles: ['admin'],
  modulos: ['compras-pedidos'],
  resumen: 'Armar un pedido, mandarlo por WhatsApp y seguir qué llegó y qué falta.',
  actualizado: '2026-09-23',
  proximamente: true,
  pendiente: 'Se completa con la entrega H1: pedidos con número (P-0001), estados y qué falta recibir.',
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Acá armás los pedidos a cada proveedor, los mandás por WhatsApp con el mensaje ya listo y seguís qué llegó y qué falta.' },
      ],
    },
  ],
}
