import { Store } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const local: SeccionManual = {
  slug: 'local',
  titulo: 'Locales',
  icono: Store,
  area: 'dia-a-dia',
  roles: ['local'],
  modulos: [],
  resumen: 'Pedidos a fábrica y depósito, recepción de lo que llega y ventas de tu sucursal.',
  actualizado: '2026-09-23',
  pendiente: 'Esta sección viene del manual anterior. Se revisa y se suman capturas en una próxima entrega.',
  apartados: [
    {
      ancla: 'que-puedo-hacer',
      titulo: '¿Qué puedo hacer desde mi cuenta?',
      bloques: [
        { tipo: 'parrafo', texto: 'Como local (sucursal) podés hacer pedidos a fábrica y depósito, consultar el historial de tus pedidos, y ver las ventas registradas en Posberry para tu sucursal.' },
      ],
    },
    {
      ancla: 'hacer-pedido',
      titulo: 'Cómo hacer un pedido',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Ingresá a **Pedir ＋** desde el menú inferior.' },
            { texto: 'Encontrarás dos pestañas: **Fábrica** (chipacitos y productos elaborados) y **Depósito** (insumos y packaging). Usá el buscador o los botones **＋ / −** para seleccionar cantidades.' },
            { texto: 'Para agregar rápido por código, escribí **código*cantidad** en el buscador (ej: `12*5`) y presioná Enter.' },
            { texto: 'Si tenés alguna aclaración, escribila en **Nota para el pedido**.' },
            { texto: 'Tocá **Enviar pedido**. Si el pedido tiene productos de los dos destinos, se crean automáticamente dos órdenes separadas.' },
          ],
        },
        { tipo: 'tip', texto: 'El pedido llega al instante. No hace falta llamar para confirmar.' },
        { tipo: 'alerta', texto: 'Si algún destino no se pudo enviar (por ejemplo, por un problema de conexión), te avisamos con un mensaje y esos productos quedan en tu carrito para que reintentes — no se pierden.' },
      ],
    },
    {
      ancla: 'estados',
      titulo: 'Estados del pedido',
      bloques: [
        {
          tipo: 'estados',
          dominio: 'pedidos',
          estados: [
            { estado: 'pendiente', texto: 'El pedido fue recibido y está en espera.' },
            { estado: 'preparando', texto: 'Fábrica o depósito está armando el pedido.' },
            { estado: 'enviado', texto: 'El pedido fue despachado. Aparece el botón para confirmar recepción.' },
            { estado: 'recibido', texto: 'Confirmaste que recibiste el pedido. El ciclo está completo.' },
          ],
        },
      ],
    },
    {
      ancla: 'confirmar-recepcion',
      titulo: 'Confirmar recepción',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Cuando el pedido pase a **Enviado**, te aparece un botón **✓ Confirmar recepción**.' },
            { texto: 'Se abre el remito con los productos del pedido. Para cada uno podés corregir la **cantidad recibida** y cargar el **valor ($ total)** — por ejemplo, si llegó menos cantidad de la pedida o el precio final fue distinto.' },
            { texto: 'Si llegó algún producto que **no estaba en el pedido original**, buscalo en "+ Agregar producto no pedido...", seleccionalo de la lista y cargale cantidad y valor. Podés agregar más de uno.' },
            { texto: 'Tocá **Confirmar recepción**. El pedido pasa a **Recibido** con todos los ítems (los originales editados y los que agregaste) guardados en el remito.' },
          ],
        },
        { tipo: 'alerta', texto: 'Confirmá la recepción solo cuando el pedido efectivamente llegó y revisaste las cantidades. Una vez confirmado no se puede reabrir el remito.' },
      ],
    },
    {
      ancla: 'mensajes',
      titulo: 'Mensajes dentro del pedido',
      bloques: [
        { tipo: 'parrafo', texto: 'Dentro de cada pedido podés enviar y recibir mensajes con fábrica o depósito. Es útil para aclaraciones sin tener que llamar.' },
        { tipo: 'tip', texto: 'Los mensajes quedan guardados en el historial del pedido.' },
      ],
    },
    {
      ancla: 'historial',
      titulo: 'Historial de pedidos',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Pedidos 📋** ves todos tus pedidos anteriores. Podés filtrar por estado o buscar por número de pedido y ver el detalle completo de cada uno.' },
      ],
    },
    {
      ancla: 'ventas',
      titulo: 'Mis ventas',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Ventas** ves el resumen de ventas del día para tu sucursal, tal como lo registra Posberry. Los datos los importa el administrador.' },
        { tipo: 'tip', texto: 'Si no ves datos, significa que el admin todavía no importó la información del día.' },
      ],
    },
  ],
}
