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
  actualizado: '2026-09-24',
  novedades: [
    { fecha: '2026-09-24', texto: 'Arriba de la plantilla aparecen las sugerencias por sobrestock del último conteo.' },
  ],
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'El pedido base es la lista fija de insumos que se pide todas las semanas. Desde acá lo generás y revisás antes de mandarlo.' },
      ],
    },
    {
      ancla: 'sobrestock',
      titulo: 'Sugerencias por sobrestock',
      bloques: [
        { tipo: 'parrafo', texto: 'Si fábrica contó de más en un conteo cerrado después del último pedido base, arriba de la plantilla ves **Sugerencias por sobrestock del último conteo**: qué sobra y cuánto pedir de menos.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Revisá las sugerencias del recuadro ámbar.', captura: { src: '/manual/compras-pedido-base/banner-sobrestock.png', alt: 'Pedido base con el recuadro Sugerencias por sobrestock del último conteo: Polvo de Hornear, Sal, Fécula y Margarina con cuánto pedir de menos', ancho: 1440, alto: 900 } },
            { texto: 'Tocá **Generar pedido base**. La solicitud nueva trae cada sugerencia en su línea.' },
            { texto: 'En **Solicitudes**, aplicá las que quieras con **Aplicar sugerencia** o **Aplicar todas**.' },
          ],
        },
        { tipo: 'alerta', texto: 'La sugerencia no se aplica sola: si no la aplicás, se pide lo de la plantilla.' },
      ],
    },
    {
      ancla: 'que-hago-si',
      titulo: '¿Qué hago si…?',
      bloques: [
        {
          tipo: 'queHagoSi',
          casos: [
            { situacion: 'El aviso dice que llegó después de generar el pedido base de esta semana', camino: 'Ese pedido ya salió sin la sugerencia. Queda para el próximo: cuando lo generes, la trae.' },
            { situacion: 'El pedido base de esta semana todavía está en Solicitudes', camino: 'Entrá a **Solicitudes** y bajá la cantidad a mano, o esperá al próximo.' },
            { situacion: 'Un insumo nunca trae sugerencia', camino: 'Tiene que estar en la plantilla y en un conteo. Si es de reposición a demanda (Sal, Leche en polvo, Pategrás), cargale un **Stock máximo** en **Insumos**.' },
            { situacion: 'Insumos avisa que hay insumos sin unidad de compra', camino: 'Sin unidad de compra no se puede calcular el sobrestock. Completá la unidad y la cantidad por unidad en la ficha del insumo.' },
          ],
        },
      ],
    },
  ],
}
