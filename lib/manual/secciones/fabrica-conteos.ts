import { ClipboardCheck } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const fabricaConteos: SeccionManual = {
  slug: 'fabrica-conteos',
  titulo: 'Conteo semanal y sobrestock',
  icono: ClipboardCheck,
  area: 'fabrica',
  roles: ['admin', 'supervisor_fabrica'],
  modulos: ['fabrica-conteos'],
  resumen: 'Contar el stock de fábrica, ver las diferencias y los avisos de sobrestock.',
  actualizado: '2026-09-23',
  proximamente: true,
  pendiente: 'Se completa con la entrega H4: el conteo muestra diferencias en vez de pisar el stock, y avisa cuando sobra.',
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Fábrica cuenta una vez por semana lo que tiene. Con ese conteo el sistema calcula qué comprar y, a partir de la entrega H4, muestra las diferencias con el stock del sistema y avisa cuando sobra algún insumo.' },
      ],
    },
  ],
}
