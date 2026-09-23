import { Warehouse } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const deposito: SeccionManual = {
  slug: 'deposito',
  titulo: 'Depósito',
  icono: Warehouse,
  area: 'dia-a-dia',
  roles: ['deposito'],
  modulos: [],
  resumen: 'Pedidos de insumos y packaging de los locales: prepararlos, despacharlos y hablar con el local.',
  actualizado: '2026-09-23',
  pendiente: 'Esta sección viene del manual anterior. Se revisa y se suman capturas en una próxima entrega.',
  apartados: [
    {
      ancla: 'que-puedo-hacer',
      titulo: '¿Qué puedo hacer desde mi cuenta?',
      bloques: [
        { tipo: 'parrafo', texto: 'Como operador de depósito ves en tiempo real todos los pedidos de insumos y packaging que te corresponden, podés cambiar su estado y comunicarte con el local.' },
      ],
    },
    {
      ancla: 'pedidos-recibidos',
      titulo: 'Ver pedidos recibidos',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Al ingresar entrás directamente a la lista de pedidos pendientes de depósito.' },
            { texto: 'Cada tarjeta muestra el local, la fecha, el número de pedido y los productos solicitados con sus cantidades.' },
            { texto: 'Los pedidos más recientes aparecen primero.' },
          ],
        },
      ],
    },
    {
      ancla: 'cambiar-estado',
      titulo: 'Cambiar el estado de un pedido',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Abrí el pedido tocando sobre la tarjeta.' },
            { texto: 'Avanzá entre estados: **Pendiente → En preparación → Enviado**.' },
            { texto: 'El local ve el cambio de estado al instante.' },
          ],
        },
        { tipo: 'tip', texto: 'Cambiá a "En preparación" cuando empieces a armar el pedido para que el local sepa que está siendo atendido.' },
        {
          tipo: 'estados',
          dominio: 'pedidos',
          estados: [
            { estado: 'pendiente', texto: 'El local lo envió y todavía nadie lo empezó a armar.' },
            { estado: 'preparando', texto: 'Lo estás armando.' },
            { estado: 'enviado', texto: 'Lo despachaste; el local confirma cuando llega.' },
            { estado: 'recibido', texto: 'El local confirmó que lo recibió.' },
          ],
        },
      ],
    },
    {
      ancla: 'mensajes',
      titulo: 'Mensajes dentro del pedido',
      bloques: [
        { tipo: 'parrafo', texto: 'Dentro de cada pedido podés leer y responder mensajes del local. Se muestra la fecha y el remitente de cada mensaje.' },
      ],
    },
    {
      ancla: 'catalogo',
      titulo: 'Catálogo de insumos',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Catálogo** podés consultar la lista completa de insumos y packaging disponibles del depósito, con sus códigos y unidades.' },
      ],
    },
  ],
}
