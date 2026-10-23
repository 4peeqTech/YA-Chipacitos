import { Truck } from 'lucide-react'
import type { SeccionManual } from '../tipos'

// Los pedidos de los locales a fábrica y el catálogo de productos elaborados
// los maneja el rol Mayorista (pantalla /fabrica/pedidos).
export const mayorista: SeccionManual = {
  slug: 'mayorista',
  titulo: 'Pedidos a fábrica',
  icono: Truck,
  area: 'dia-a-dia',
  roles: ['mayorista'],
  modulos: [],
  resumen: 'Los pedidos de los locales: prepararlos, ajustarlos antes de mandar, despacharlos y hablar con el local.',
  actualizado: '2026-10-23',
  novedades: [
    { fecha: '2026-10-23', texto: 'Cada producto tiene **su propio ícono** (masa, queso, jamón…), el mismo que ven los locales al pedir.' },
    { fecha: '2026-10-22', texto: '**Catálogo** nuevo: cada producto tiene **Con stock | Sin stock**, con la opción actual resaltada. Cuando algo se termina, tocás **Sin stock** y los locales lo ven en gris.' },
    { fecha: '2026-10-21', texto: 'Pantalla nueva en **tablero**: Nuevos, En preparación y En camino, con aviso al celular cuando entra un pedido.' },
    { fecha: '2026-10-21', texto: 'Antes de despachar podés **editar el pedido**: cambiar cantidades, sacar o agregar productos. El local ve lo que cambiaste.' },
    { fecha: '2026-10-21', texto: 'Nueva **Hoja de preparación** con el total por producto de lo que hay que armar, para imprimir.' },
    { fecha: '2026-10-21', texto: 'Los pedidos anteriores a esta versión quedan marcados como **Versión anterior**: los que estaban en camino se cerraron como recibidos automáticamente y pueden no reflejar lo que llegó.' },
  ],
  apartados: [
    {
      ancla: 'que-puedo-hacer',
      titulo: '¿Qué puedo hacer desde mi cuenta?',
      bloques: [
        { tipo: 'parrafo', texto: 'Ves en vivo los pedidos que los locales le hacen a fábrica, los preparás, ajustás lo que se manda si falta algo, los despachás y hablás con cada local dentro del pedido.' },
        { tipo: 'tip', texto: 'Activá los avisos en este dispositivo para enterarte de un pedido nuevo aunque tengas la pestaña cerrada.' },
      ],
    },
    {
      ancla: 'tablero',
      titulo: 'El tablero',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Al entrar ves el **Tablero** con tres columnas: **Nuevos**, **En preparación** y **En camino**, cada una con su contador. En la tablet y el celular son pestañas.' },
            { texto: 'Cada tarjeta muestra la sucursal, el número, hace cuánto llegó, cuántos productos tiene y si hay mensajes sin leer.' },
            { texto: 'Filtrá por sucursal o buscá por número, sucursal o producto.' },
            { texto: 'Cuando entra un pedido suena un aviso, el título de la pestaña parpadea y la tarjeta aparece marcada como nueva. Tocá **Marcar como vistos** para sacar el aviso.' },
          ],
        },
      ],
    },
    {
      ancla: 'preparar-y-enviar',
      titulo: 'Preparar y despachar un pedido',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Tocá la tarjeta para abrir el pedido: ves los productos, las **Observaciones del local**, los **Movimientos** y los **Mensajes**.' },
            { texto: 'Tocá **Empezar preparación** cuando lo empieces a armar. El local lo ve al instante.' },
            { texto: 'Si falta algo o hay que cambiar una cantidad, tocá **Editar pedido**: cambiá lo que **Se manda** de cada producto (0 para no mandarlo) o agregá un producto. Tocá **Guardar**: al local le llega el aviso con lo que cambió.' },
            { texto: 'Cuando sale, tocá **Marcar como enviado**. Te mostramos lo que sale para que lo revises; confirmá con **Sí, sale ahora**. Al local le llega el aviso y la tarjeta pasa a **En camino**.' },
          ],
        },
        { tipo: 'alerta', texto: 'Una vez que el pedido está **En camino** ya no se puede editar. Si después hubo diferencias, el local las indica al recibirlo.' },
        { tipo: 'tip', texto: 'Si un pedido no se va a preparar, usá **Cancelar pedido** y escribí el motivo: el local lo ve.' },
      ],
    },
    {
      ancla: 'hoja-preparacion',
      titulo: 'Hoja de preparación',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Hoja de preparación** ves el **Total por producto** de todos los pedidos nuevos y en preparación, y abajo el detalle **Por sucursal**. Podés filtrar por sucursal y tocar **Imprimir** para llevarla en papel, con casillas para tildar.' },
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
            { estado: 'pendiente', texto: 'El local lo mandó y todavía nadie lo empezó a preparar.' },
            { estado: 'preparando', texto: 'Lo estás armando. Todavía podés editar lo que se manda.' },
            { estado: 'enviado', texto: 'Salió de fábrica. El local confirma cuando llega.' },
            { estado: 'recibido', texto: 'El local confirmó lo que llegó. Si marcó diferencias, lo ves en el pedido.' },
            { estado: 'cancelado', texto: 'Se canceló antes de salir. Se ve quién y el motivo.' },
          ],
        },
      ],
    },
    {
      ancla: 'historial',
      titulo: 'Historial',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Historial** están los pedidos recibidos y cancelados, con filtro por fecha y sucursal. Los recibidos con diferencias tienen una marca: abrilos para ver qué llegó distinto y la nota del local.' },
        { tipo: 'parrafo', texto: 'Los pedidos de antes de esta versión llevan la marca **Versión anterior**; los que habían quedado en camino se cerraron automáticamente y pueden no reflejar lo que llegó.' },
      ],
    },
    {
      ancla: 'catalogo',
      titulo: 'Catálogo de productos',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Catálogo** ves los productos que pueden pedir los locales, por categoría y con su código. Arriba te dice cuántos están sin stock, y podés filtrar por **Todos / Con stock / Sin stock** o buscar por nombre o código.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Cada producto tiene **Con stock | Sin stock**. La opción resaltada es como está ahora.' },
            { texto: 'Cuando un producto se termina, tocá **Sin stock**: queda resaltado y los locales lo ven en gris como "Sin stock por ahora", sin poder pedirlo.' },
            { texto: 'Cuando vuelve a haber, tocá **Con stock** y lo pueden pedir de nuevo.' },
          ],
        },
        { tipo: 'tip', texto: 'Cada cambio te muestra un aviso abajo. Si no hay conexión, el producto vuelve a como estaba y te avisa que no se guardó.' },
      ],
    },
  ],
}
