import { Store } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const local: SeccionManual = {
  slug: 'local',
  titulo: 'Locales',
  icono: Store,
  area: 'dia-a-dia',
  roles: ['local'],
  modulos: [],
  resumen: 'Pedidos al mayorista, seguimiento, mensajes y recepción de lo que llega.',
  actualizado: '2026-10-21',
  novedades: [
    { fecha: '2026-10-21', texto: 'Pantalla **Pedir** nueva: carrito que no se pierde, **Repetir mi último pedido** y resumen antes de enviar. Se pueden pedir cantidades con decimales (por ejemplo 1,5).' },
    { fecha: '2026-10-21', texto: 'En **Pedidos** ves en vivo en qué está cada pedido y si el mayorista cambió algo antes de mandarlo.' },
    { fecha: '2026-10-21', texto: 'La recepción se confirma con un toque (**Llegó todo bien**) o indicando qué llegó distinto. El $ es opcional.' },
    { fecha: '2026-10-21', texto: 'Los pedidos anteriores a esta versión quedan marcados como **Versión anterior**: los que estaban en camino se cerraron como recibidos automáticamente y pueden no reflejar lo que llegó.' },
  ],
  apartados: [
    {
      ancla: 'que-puedo-hacer',
      titulo: '¿Qué puedo hacer desde mi cuenta?',
      bloques: [
        { tipo: 'parrafo', texto: 'Como local (sucursal) le pedís productos al mayorista, seguís cada pedido hasta que llega, hablás con el mayorista dentro del pedido y confirmás lo que recibiste.' },
        { tipo: 'lista', items: [
          '**Pedir**: armar y mandar un pedido nuevo.',
          '**Pedidos**: tus pedidos, en curso y anteriores. El número en el menú te dice cuántos están en camino sin confirmar.',
        ] },
      ],
    },
    {
      ancla: 'hacer-pedido',
      titulo: 'Cómo hacer un pedido',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Entrá a **Pedir** desde el menú.' },
            { texto: 'Buscá por nombre o código, o filtrá por categoría. Cargá la cantidad con **−** y **+** o escribiéndola; se aceptan decimales con coma o punto (por ejemplo 1,5).' },
            { texto: 'Para cargar rápido por código, escribí **código*cantidad** en el buscador (por ejemplo `12*3`) y apretá Enter.' },
            { texto: '¿Pedís casi siempre lo mismo? Tocá **Repetir mi último pedido** y ajustá lo que cambie. Si algún producto ya no se puede pedir, te avisamos cuál quedó afuera.' },
            { texto: 'Revisá **Tu pedido** (en el celular, tocá la barra de abajo) y escribí las **Observaciones** si hace falta.' },
            { texto: 'Tocá **Enviar pedido**, revisá el resumen y confirmá. Te aparece el número del pedido y un enlace para verlo en Mis pedidos.' },
          ],
        },
        { tipo: 'tip', texto: 'El carrito se guarda en este dispositivo: si se te cierra la página, lo encontrás como lo dejaste.' },
        { tipo: 'alerta', texto: 'Si se corta la conexión al enviar, te avisamos y el carrito queda igual. No se manda nada a medias: probá de nuevo.' },
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
            { estado: 'pendiente', texto: 'Lo mandaste y el mayorista todavía no lo empezó a preparar.' },
            { estado: 'preparando', texto: 'El mayorista lo está armando. Puede ajustar cantidades si falta algo: lo vas a ver marcado.' },
            { estado: 'enviado', texto: 'Salió para tu local. Cuando llegue, confirmá la recepción.' },
            { estado: 'recibido', texto: 'Confirmaste lo que llegó. El pedido queda cerrado.' },
            { estado: 'cancelado', texto: 'Se canceló antes de salir, por vos o por el mayorista. Se ve el motivo si lo dejaron.' },
          ],
        },
      ],
    },
    {
      ancla: 'seguimiento',
      titulo: 'Seguir un pedido y ver qué cambió',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Entrá a **Pedidos**. Arriba elegís **En curso**, **Recibidos**, **Cancelados** o todos, y podés buscar por número o producto, o filtrar por fecha.' },
            { texto: 'Tocá un pedido para ver el detalle: los productos, en qué estado está y los **Movimientos** (quién hizo qué y cuándo).' },
            { texto: 'Si el mayorista cambió algo antes de mandarlo (otra cantidad, sacó o agregó un producto), el pedido muestra **Fábrica cambió el pedido** y en el detalle ves lo que pediste y lo que se manda.' },
          ],
        },
        { tipo: 'tip', texto: 'La lista se actualiza sola: no hace falta recargar para ver si tu pedido salió.' },
      ],
    },
    {
      ancla: 'cancelar',
      titulo: 'Cancelar un pedido',
      bloques: [
        { tipo: 'parrafo', texto: 'Se puede cancelar hasta que salga en camino. Abrí el pedido, tocá **Cancelar pedido** y, si querés, escribí el motivo. Al mayorista le llega el aviso.' },
        { tipo: 'alerta', texto: 'Cuando el pedido ya está **En camino** no se puede cancelar: está yendo para tu local. Si hay un problema, avisá por los mensajes del pedido.' },
      ],
    },
    {
      ancla: 'confirmar-recepcion',
      titulo: 'Confirmar la recepción',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Cuando el pedido está **En camino**, abrilo: te pregunta **¿Llegó el pedido?**' },
            { texto: 'Si llegó todo lo que se mandó, tocá **Llegó todo bien** y confirmá. Listo.' },
            { texto: 'Si algo llegó distinto, elegí la opción de diferencias: corregí lo que **Llegó** de cada producto, cargá el **$** si lo tenés (es opcional) y dejá una nota. Si vino un producto que no pediste, agregalo en **Agregar un producto que llegó sin pedirse**.' },
            { texto: 'Tocá **Guardar recepción**. El pedido queda **Recibido** (o **Recibido con diferencias**) y al mayorista le llega el aviso.' },
          ],
        },
        { tipo: 'tip', texto: 'Las cantidades a corregir vienen cargadas con lo que se mandó: solo cambiás lo que no coincide.' },
      ],
    },
    {
      ancla: 'mensajes',
      titulo: 'Mensajes dentro del pedido',
      bloques: [
        { tipo: 'parrafo', texto: 'Dentro de cada pedido tenés **Mensajes con el mayorista**. Podés escribir desde que lo mandaste, por ejemplo para avisar algo urgente o pedir un cambio. Al otro le llega el aviso y los mensajes se ven en vivo.' },
      ],
    },
    {
      ancla: 'version-anterior',
      titulo: 'Pedidos de la versión anterior',
      bloques: [
        { tipo: 'parrafo', texto: 'Los pedidos hechos antes de esta versión del sistema llevan la marca **Versión anterior**. Los que estaban en camino sin confirmar se cerraron como recibidos automáticamente (**Cerrado automáticamente**), así que pueden no reflejar lo que llegó de verdad.' },
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
