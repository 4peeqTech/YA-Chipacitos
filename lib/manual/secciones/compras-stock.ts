import { Package } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const comprasStock: SeccionManual = {
  slug: 'compras-stock',
  titulo: 'Stock de insumos',
  icono: Package,
  area: 'compras',
  roles: ['admin'],
  modulos: ['compras-stock'],
  resumen: 'Cuánto hay de cada insumo, de dónde salió cada movimiento y cómo corregirlo.',
  actualizado: '2026-09-23',
  proximamente: true,
  pendiente: 'Se completa con la entrega H1: stock que se mueve solo con los remitos y ajustes con motivo.',
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Muestra cuánto hay de cada insumo y el historial de cada movimiento: qué remito lo sumó, qué ajuste lo corrigió y quién lo hizo.' },
      ],
    },
  ],
}
