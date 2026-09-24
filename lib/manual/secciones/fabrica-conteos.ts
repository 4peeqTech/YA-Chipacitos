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
  actualizado: '2026-09-24',
  pendiente: 'La parte de diferencias con el stock del sistema se completa con la entrega H4. El sobrestock ya está.',
  novedades: [
    { fecha: '2026-09-24', texto: 'El conteo avisa cuando sobra un insumo: la tarjeta se pone ámbar con "Sobrestock" y Compras recibe el aviso.' },
  ],
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Fábrica cuenta una vez por semana lo que tiene. Con ese conteo el sistema calcula qué comprar y avisa cuando sobra algún insumo, para que Compras pida menos. A partir de la entrega H4 también va a mostrar las diferencias con el stock del sistema.' },
      ],
    },
    {
      ancla: 'sobrestock',
      titulo: 'Qué es el sobrestock',
      bloques: [
        { tipo: 'parrafo', texto: 'Hay sobrestock cuando lo que contaste supera lo que hace falta para las masas proyectadas por **1 unidad de compra entera o más** (por ejemplo, 1 bolsa de fécula). Si sobra menos de una unidad, no se avisa.' },
        {
          tipo: 'lista',
          titulo: 'Cómo se ve cada tarjeta del conteo',
          items: [
            'Roja con **sugerido N**: falta, Compras va a pedir.',
            'Verde con **✓ cubre con stock actual**: alcanza.',
            'Ámbar con **Sobrestock +N**: sobra. Compras recibe el aviso al cerrar.',
            'Gris con **A demanda**: el insumo se pide según se necesite (Sal, Leche en polvo, Pategrás) y no avisa sobrestock.',
          ],
        },
        { tipo: 'tip', texto: 'El número de sobrestock se calcula en vivo mientras cargás. Si cambiás las masas proyectadas, se recalcula.' },
      ],
    },
    {
      ancla: 'cerrar',
      titulo: 'Cerrar el conteo con sobrestock',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Cargá las masas proyectadas y lo que contaste de cada insumo.' },
            { texto: 'Revisá las tarjetas ámbar: el encabezado del conteo muestra cuántas tienen sobrestock.', captura: { src: '/manual/fabrica-conteos/tiles-sobrestock.png', alt: 'Conteo Global en el celular: tarjetas ámbar con Sobrestock +2 Caja, +3,5 Pote y +2 Bolsa; Queso Pategrás en gris con A demanda', ancho: 375, alto: 812 } },
            { texto: 'Tocá **Cerrar control y pedir a Compras**. La ventana te muestra "Vas a avisar a Compras que sobran:" con la lista.', captura: { src: '/manual/fabrica-conteos/cerrar-con-sobrestock.png', alt: 'Ventana Cerrar control con la lista de lo que sobra: Fécula +6 Bolsa, Margarina +2 Caja, Polvo de Hornear +3,5 Pote y Sal +2 Bolsa', ancho: 375, alto: 812 } },
            { texto: 'Tocá **Cerrar y pedir**. Compras recibe dos avisos: la solicitud de compra y el sobrestock.' },
          ],
        },
        { tipo: 'alerta', texto: 'El sobrestock no cambia nada solo: Compras decide si pide menos en el próximo pedido base.' },
      ],
    },
    {
      ancla: 'que-hago-si',
      titulo: '¿Qué hago si…?',
      bloques: [
        {
          tipo: 'queHagoSi',
          casos: [
            { situacion: 'Un insumo sale con sobrestock y no debería', camino: 'Revisá la cantidad que cargaste y las masas proyectadas antes de cerrar. Si ya cerraste, pedile a Compras que descarte la solicitud y volvé a contar.' },
            { situacion: 'La Sal, la Leche o el Pategrás se acumulan y no avisa nada', camino: 'Son insumos "a demanda": no avisan salvo que tengan un tope. Pedile a Compras que le cargue un **Stock máximo** en la ficha del insumo; desde el próximo conteo, si lo pasás, avisa.' },
            { situacion: 'Un insumo nunca avisa sobrestock', camino: 'Puede que le falte la unidad de compra o la receta. Compras lo ve avisado en **Insumos**.' },
          ],
        },
      ],
    },
  ],
}
