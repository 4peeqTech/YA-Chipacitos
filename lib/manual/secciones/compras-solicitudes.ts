import { Inbox } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const comprasSolicitudes: SeccionManual = {
  slug: 'compras-solicitudes',
  titulo: 'Solicitudes de fábrica',
  icono: Inbox,
  area: 'compras',
  roles: ['admin'],
  modulos: ['compras-pedidos'],
  resumen: 'Lo que fábrica calculó que hay que comprar, listo para convertir en pedidos.',
  actualizado: '2026-09-24',
  novedades: [
    { fecha: '2026-09-24', texto: 'Las solicitudes marcan el sobrestock, y el pedido base trae la sugerencia "pedir N menos" con Aplicar y Deshacer.' },
  ],
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'Cuando fábrica cierra el conteo semanal, el sistema calcula qué hay que comprar y te llega como solicitud. Desde acá la revisás, la ajustás y la convertís en pedidos a cada proveedor.' },
      ],
    },
    {
      ancla: 'sobrestock',
      titulo: 'Sobrestock en las solicitudes',
      bloques: [
        { tipo: 'parrafo', texto: 'Si fábrica contó de más, la línea muestra **Sobrestock +N** en ámbar. En la lista, la solicitud lleva un aviso con cuántos insumos sobran.' },
        { tipo: 'parrafo', texto: 'En la solicitud del **pedido base**, cada línea con sobrestock trae "Sugerencia: pedir N menos", con el conteo de donde sale. La cantidad no cambia sola.' },
      ],
    },
    {
      ancla: 'aplicar-sugerencia',
      titulo: 'Aplicar una sugerencia',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Abrí la solicitud del pedido base.', captura: { src: '/manual/compras-solicitudes/sugerencias-base.png', alt: 'Solicitud del pedido base con el aviso 4 sugerencias por sobrestock, el botón Aplicar todas y cada línea con Sugerencia: pedir N menos', ancho: 1440, alto: 900 } },
            { texto: 'En la línea, tocá **Aplicar sugerencia**: la cantidad baja lo sugerido (por ejemplo, de 50 a 44).' },
            { texto: 'Si te arrepentís, tocá **Deshacer**: vuelve a la cantidad de la plantilla.' },
            { texto: 'Para todas juntas, usá **Aplicar todas** arriba de la tabla. Se deshace con **Deshacer todas**.', captura: { src: '/manual/compras-solicitudes/sugerencias-aplicadas.png', alt: 'Las mismas líneas con la sugerencia aplicada: Fécula pasó de 50 a 44 y el botón dice Deshacer todas', ancho: 1440, alto: 900 } },
            { texto: 'Cuando esté bien, tocá **Generar pedidos**.' },
          ],
        },
        { tipo: 'tip', texto: 'La sugerencia nunca descuenta más de lo que pide la plantilla: si sobran 6 y la plantilla pide 2, sugiere pedir 2 menos, o sea no pedir esa semana.' },
      ],
    },
    {
      ancla: 'que-hago-si',
      titulo: '¿Qué hago si…?',
      bloques: [
        {
          tipo: 'queHagoSi',
          casos: [
            { situacion: 'Apliqué una sugerencia por error', camino: 'Tocá **Deshacer** en la línea. Mientras la solicitud no se convirtió en pedidos, siempre se puede.' },
            { situacion: 'Hay sobrestock pero el pedido base de la semana ya se generó', camino: 'La sugerencia se guarda para el próximo pedido base. Si el de esta semana todavía está en Solicitudes, podés bajar la cantidad a mano.' },
            { situacion: 'Fábrica contó mal', camino: 'Tocá **Descartar**, escribí el motivo y fábrica vuelve a contar.' },
          ],
        },
      ],
    },
  ],
}
