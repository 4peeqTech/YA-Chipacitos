import { Factory } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const fabrica: SeccionManual = {
  slug: 'fabrica',
  titulo: 'Fábrica',
  icono: Factory,
  area: 'fabrica',
  roles: ['supervisor_fabrica'],
  modulos: [],
  resumen: 'Registro diario de producción, operarios, conteo semanal de stock y reportes de fábrica.',
  actualizado: '2026-09-23',
  pendiente: 'Resumen inicial. Los pasos detallados y las capturas se suman en una próxima entrega; el conteo semanal tiene su propia sección.',
  apartados: [
    {
      ancla: 'que-puedo-hacer',
      titulo: '¿Qué puedo hacer desde mi cuenta?',
      bloques: [
        { tipo: 'parrafo', texto: 'Como supervisor de fábrica cargás el día a día de la producción: qué se produce, quién lo produce, qué vuelve y qué hay en stock. Ves solo lo que necesitás para ese trabajo.' },
      ],
    },
    {
      ancla: 'registro',
      titulo: 'Registro diario',
      bloques: [
        {
          tipo: 'lista',
          items: [
            '**Producción:** cada tanda de masa, con el operario que la hizo (es obligatorio indicarlo).',
            '**Congelados:** la masa que va a congelado, por sabor, tamaño y presentación.',
            '**Devoluciones:** lo que vuelve y por qué (por ejemplo migas o error en el pedido). Según el motivo, el formulario pide solo los datos que corresponden, y podés dejar un comentario.',
          ],
        },
        { tipo: 'tip', texto: 'Podés cargar o corregir cualquier día, no solo hoy o ayer.' },
      ],
    },
    {
      ancla: 'personal',
      titulo: 'Personal',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Personal** está el listado de operarios de fábrica. Con eso se ve la producción y el rendimiento de cada persona.' },
      ],
    },
    {
      ancla: 'stock',
      titulo: 'Stock (conteo semanal)',
      bloques: [
        { tipo: 'parrafo', texto: 'Una vez por semana contás lo que hay en **Stock**. Con ese conteo y la producción proyectada, el sistema calcula solo cuánto hay que comprar y se lo manda a Compras.' },
        { tipo: 'tip', texto: 'Si Compras rechaza la solicitud, te llega un aviso con el motivo y podés rehacer el conteo.' },
      ],
    },
    {
      ancla: 'reportes',
      titulo: 'Reportes',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Reportes** ves masa producida, fécula usada, rendimiento, congelados y devoluciones, con filtros por fechas y por operario.' },
      ],
    },
  ],
}
