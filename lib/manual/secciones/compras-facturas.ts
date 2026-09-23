import { Receipt } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const comprasFacturas: SeccionManual = {
  slug: 'compras-facturas',
  titulo: 'Facturas de proveedores',
  icono: Receipt,
  area: 'compras',
  roles: ['admin'],
  modulos: [],
  resumen: 'Cargar la factura de cada pedido, con IVA calculado y el gasto creado solo.',
  actualizado: '2026-09-23',
  proximamente: true,
  pendiente: 'Se completa con la entrega H2: carga de facturas, diferencias con lo recibido y gasto automático.',
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Acá vas a cargar la factura de cada pedido: número, fecha, vencimiento y líneas. El sistema calcula el IVA y crea el gasto pendiente de pago.' },
      ],
    },
  ],
}
