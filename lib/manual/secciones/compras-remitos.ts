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
  actualizado: '2026-11-19',
  pendiente: 'Se completa con la entrega H1: remitos con código propio (R-0001-01) y stock que se mueve solo.',
  novedades: [
    { fecha: '2026-11-19', texto: 'En el historial del pedido, cada remito aparece con el **número del proveedor** (por ejemplo N° 5125). Y los insumos que se miden en kg piden los **kg reales** al cargar el remito.' },
  ],
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Cada vez que llega mercadería de un pedido, la cargás como remito. Lo que registrás en el remito es lo que suma al stock.' },
      ],
    },
    {
      ancla: 'numero-del-proveedor',
      titulo: 'El número del proveedor',
      bloques: [
        { tipo: 'parrafo', texto: 'Cargá el número impreso en el remito del proveedor. Es el que se ve en el historial y en la lista de remitos del pedido, así lo encontrás sin abrir cada uno. Si un remito no lo tiene, se ve el código interno (R-0120-01).' },
      ],
    },
    {
      ancla: 'kg-reales',
      titulo: 'Kg reales',
      bloques: [
        { tipo: 'parrafo', texto: 'Los insumos que se miden en kg pero se compran en otra unidad (cajas de queso, bolsas de fécula) piden los **kg reales** que llegaron, además de la cantidad. Debajo ves el peso nominal y un aviso si lo que pesó se aleja mucho.' },
        { tipo: 'tip', texto: 'En un remito nuevo son obligatorios. El stock se sigue contando en cajas o bolsas: los kg quedan registrados para control y se ven en el historial del pedido y en la ficha del insumo.' },
      ],
    },
  ],
}
