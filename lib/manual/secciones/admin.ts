import { Settings } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const admin: SeccionManual = {
  slug: 'admin',
  titulo: 'Administración',
  icono: Settings,
  area: 'administracion',
  roles: ['admin'],
  modulos: [],
  resumen: 'Gastos, ventas y conciliación, catálogo, usuarios, parámetros y tareas.',
  actualizado: '2026-09-23',
  pendiente: 'Esta sección viene del manual anterior. Se revisa módulo por módulo en próximas entregas; Compras y Fábrica tienen sus propias secciones.',
  novedades: [
    { fecha: '2026-10-23', texto: 'En **Catálogo** podés elegir el **ícono** de cada producto de fábrica. Si no elegís ninguno, sale solo del nombre.' },
  ],
  apartados: [
    {
      ancla: 'vision-general',
      titulo: 'Visión general',
      bloques: [
        { tipo: 'parrafo', texto: 'Como administrador tenés acceso completo a todos los módulos: pedidos, gastos, ventas Posberry, conciliación, catálogo, usuarios y configuración. El menú lateral agrupa los módulos por sección.' },
      ],
    },
    {
      ancla: 'dashboard',
      titulo: 'Dashboard',
      bloques: [
        { tipo: 'parrafo', texto: 'Punto de partida del sistema. Muestra un resumen del día: pedidos activos, alertas y accesos rápidos a los módulos más usados.' },
      ],
    },
    {
      ancla: 'gastos',
      titulo: 'Gastos',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Gastos** está todo lo que se gasta en cada local, venga de donde venga: lo que cargás acá, lo que nace de una factura de proveedor, lo que los locales cargan en **Fudo** y los gastos que se repiten. Los de Fudo y los que se repiten llevan una marca chica; el resto se trabaja igual.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Tocá **Nuevo gasto** y completá fecha, local, cuenta, proveedor (opcional), monto y forma de pago prevista. Si vence, poné la fecha en **Vence**.' },
            { texto: 'En **Cuenta** escribí lo que es (luz, alquiler, nafta, sueldos…) y elegila de la lista. Abajo te dice qué entra en esa cuenta. Las que dicen **No es gasto** (retiros del socio, compra de una máquina, cuota de un préstamo) se cargan igual pero no suman en lo gastado.' },
            { texto: 'Si ya está pagado, tildá **Ya está pagado**: pide la fecha del pago, la caja y, si querés, el comprobante.' },
            { texto: 'En **Factura o ticket** adjuntás las fotos o PDF del gasto (hasta 10 MB cada uno).' },
            { texto: 'Arriba de la lista elegís el período (por defecto, el mes actual), el estado, el local, el origen y la cuenta, y buscás por proveedor, cuenta, factura o pedido (sin importar las tildes). El link de la página guarda los filtros: lo podés compartir.' },
          ],
        },
        { tipo: 'parrafo', texto: '**Pagos.** Abrí el gasto y tocá **Registrar pago**: fecha, caja, forma de pago, comprobante y monto. Si pagás una parte, cambiá el monto y el gasto queda **Parcial** con lo que falta. Cada pago queda en el historial del gasto; si uno está mal, tocá **Anular** (con un motivo, si querés): deja de sumar pero no se borra.' },
        { tipo: 'parrafo', texto: '**Gastos de Fudo.** La app trae los gastos que los locales cargan en Fudo al abrir Gastos o Pendientes, con el botón **Actualizar** y una vez por día. Lo que en Fudo está en **Cta. Cte.** entra como pendiente de pago (es deuda con el proveedor); lo pagado en efectivo entra pagado con la caja del local. Entran **Sin clasificar**: abrilos y elegí la cuenta (arriba de la lista hay un aviso con los que faltan). Acá se clasifican y se pagan; el monto, la fecha y el proveedor se corrigen en Fudo. La app **nunca cambia nada en Fudo**: si pagás acá, en Fudo sigue figurando impago.' },
        { tipo: 'parrafo', texto: '**Gastos que se repiten** (alquiler, sueldos, servicios): en **Gastos › Que se repiten** cargás el gasto una vez, con el día del mes, y la app lo crea cada mes como pendiente de pago. Si el monto cambia todos los meses (luz, agua), nace con el monto del mes anterior y marcado **monto a confirmar** hasta que lo confirmes o lo corrijas. Si un mes no corresponde, eliminá ese gasto: queda anulado y no se vuelve a generar.' },
        { tipo: 'parrafo', texto: 'En **Pendientes de pago** está lo que falta pagar, local por local y lo más viejo arriba. Lo atrasado se marca: por su vencimiento si tiene, o a los 30 días si no.' },
        { tipo: 'parrafo', texto: 'En **Resumen por local** ves el total de gastos agrupados por sucursal y período. Lo que no es gasto no entra.' },
        { tipo: 'parrafo', texto: '**Plan de cuentas.** Las cuentas son las del plan del negocio y no se cambian desde la app. En **Parámetros › Plan de cuentas** está el plan completo, con lo que entra en cada cuenta y un buscador.' },
        {
          tipo: 'estados',
          dominio: 'gastos',
          estados: [
            { estado: 'Pendiente de pago', texto: 'Todavía no se pagó nada.' },
            { estado: 'Parcial', texto: 'Se pagó una parte: el resto sigue en Pendientes.' },
            { estado: 'Pagado', texto: 'Está saldado.' },
            { estado: 'Anulado', texto: 'Se canceló en Fudo, o es el mes de un gasto que se repite que se eliminó. No suma en ningún total.' },
          ],
        },
        {
          tipo: 'queHagoSi',
          casos: [
            { situacion: 'Un gasto de Fudo dice "Revisar"', camino: 'Cambió en Fudo después de que lo pagaste acá (se canceló, ya no figura o bajó el monto). Abrilo, mirá los pagos y anulá el que no corresponda.' },
            { situacion: 'Aparece "no se pudo actualizar" con una sucursal', camino: 'Fudo no respondió para ese local (o sus credenciales no andan). Sus gastos se ven como estaban la última vez. Avisá al admin técnico si sigue.' },
            { situacion: 'No puedo eliminar un gasto', camino: 'Si salió de una factura, se anula la factura; si viene de Fudo, se anula en Fudo; si tiene pagos, primero anulalos.' },
          ],
        },
      ],
    },
    {
      ancla: 'fudo',
      titulo: 'Fudo / Caja',
      bloques: [
        { tipo: 'parrafo', texto: 'Consulta en vivo de Fudo, sucursal por sucursal: gastos, ventas y movimientos de caja, filtrando por tipo y rango de fechas. Solo para mirar: los gastos de Fudo para pagar y clasificar ya están en **Gastos**.' },
        { tipo: 'tip', texto: 'Los datos se traen directamente de la API de Fudo. Si no aparecen datos, verificá la conexión con el admin técnico.' },
      ],
    },
    {
      ancla: 'sincronizar',
      titulo: 'Sincronizar desde Sheets',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Andá a **Sincronizar**.' },
            { texto: 'Elegí el rango de fechas (desde / hasta) que querés importar.' },
            { texto: 'Tocá **Sincronizar desde Sheets**. El sistema lee la hoja BD de Google Sheets y guarda las ventas en la base de datos.' },
            { texto: 'Al terminar ves cuántas ventas se importaron y si hay locales sin mapear.' },
          ],
        },
        { tipo: 'tip', texto: 'También podés cargar un archivo CSV exportado desde Posberry usando la sección de carga manual.' },
        { tipo: 'alerta', texto: 'Si aparecen locales "sin mapear", el nombre en Posberry no coincide con ningún local del sistema. Solucionalo en Mapeo de productos.' },
      ],
    },
    {
      ancla: 'posberry',
      titulo: 'Ventas Posberry',
      bloques: [
        { tipo: 'parrafo', texto: 'Vista completa de la hoja BD sin filtros de local, incluyendo mayoristas.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Tocá **Cargar datos** para traer la información.' },
            { texto: 'Filtrá por fecha, cliente, producto o dirección con los campos de búsqueda.' },
            { texto: 'Usá los chips **Todos / Sucursales / Mayoristas** para segmentar la vista.' },
          ],
        },
      ],
    },
    {
      ancla: 'conciliacion',
      titulo: 'Conciliación',
      bloques: [
        { tipo: 'parrafo', texto: 'Compara lo vendido en Posberry versus lo pedido por cada local, por producto y fecha.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Elegí el rango de fechas con los campos Desde / Hasta.' },
            { texto: 'Si los datos no están actualizados, tocá **⟳ Recalcular**.' },
            { texto: 'Las filas con diferencia en rojo o ícono ⚠️ tienen discrepancia entre lo vendido y lo pedido.' },
            { texto: 'Una vez revisada una fila, tocá **○ Confirmar** para marcarla como revisada.' },
          ],
        },
        {
          tipo: 'lista',
          titulo: 'Columnas de la tabla',
          items: [
            '**Posberry** — nombre en la planilla',
            '**Sistema** — nombre mapeado internamente',
            '**Vendido** — unidades según Posberry',
            '**Pedido** — unidades según el pedido',
            '**Dif.** — Vendido − Pedido',
          ],
        },
      ],
    },
    {
      ancla: 'catalogo',
      titulo: 'Catálogo',
      bloques: [
        { tipo: 'parrafo', texto: 'Administrás todos los productos del sistema: chipacitos (fábrica) e insumos (depósito). Podés crear, editar y desactivar productos, asignarles código, categoría, unidad y destino.' },
        { tipo: 'parrafo', texto: 'Los productos de **Fábrica** tienen un **ícono**: es el que ven los locales en **Pedir** y el mayorista en su **Catálogo**. Lo ves a la izquierda de cada producto.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Tocá el lápiz del producto (o **Agregar producto**) y bajá hasta **Ícono**.' },
            { texto: 'Por defecto está en **Auto**: el ícono sale del nombre (masa, queso, jamón, salame, membrillo, dulce de leche…) o, si no reconoce ninguna palabra, de la categoría. Los congelados siempre llevan el copo de nieve.' },
            { texto: 'Para elegir otro, tocalo en la grilla (si dejás el dedo o el mouse encima, te dice qué es) y tocá **Guardar**. Queda fijo para ese producto aunque cambie el nombre.' },
            { texto: 'Para volver al automático, elegí **Auto** y guardá.' },
          ],
        },
        { tipo: 'parrafo', texto: 'En la pestaña **Categorías** (arriba, al lado de **Productos**) armás la lista de categorías de **Fábrica** y de **Depósito**. El orden de esa lista es el que ven los locales en **Pedir** y el mayorista en su **Catálogo**.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Para crear una, tocá **Nueva categoría**, poné el nombre, elegí ícono y color y tocá **Guardar**.' },
            { texto: 'Para cambiar el orden, usá las flechas de cada categoría.' },
            { texto: 'Para renombrarla o cambiarle el ícono o el color, tocá el lápiz. Si le cambiás el nombre, se cambia solo en todos sus productos.' },
            { texto: 'Para que no se pueda pedir, apagá el interruptor **Se puede pedir**. Sus productos dejan de aparecer en **Pedir** y en el **Catálogo** del mayorista; los pedidos ya hechos no cambian y no se borra nada. Volvé a prenderlo cuando quieras.' },
            { texto: 'Con **Sugerir a locales sin pedidos** (en el lápiz), los productos de esa categoría le aparecen en **Tus habituales** a un local que todavía no pidió nada. Viene prendido en Masas.' },
            { texto: 'Solo se puede eliminar una categoría sin productos. Si tiene, pasalos a otra categoría o desactivala.' },
          ],
        },
      ],
    },
    {
      ancla: 'mapeos',
      titulo: 'Mapeo de productos',
      bloques: [
        { tipo: 'parrafo', texto: 'Vinculás los nombres que aparecen en Posberry con los productos internos del sistema para que la conciliación funcione correctamente.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Ves la lista de nombres del sheet de Posberry sin mapear.' },
            { texto: 'Para cada uno elegís el producto equivalente desde el selector.' },
            { texto: 'Guardás. Desde ahí la conciliación puede cruzar los datos.' },
          ],
        },
        { tipo: 'alerta', texto: 'Si en la conciliación aparece "sin mapear", el producto de Posberry no tiene mapeo. Crealo acá.' },
      ],
    },
    {
      ancla: 'usuarios',
      titulo: 'Gestión de usuarios',
      bloques: [
        { tipo: 'parrafo', texto: 'Administrás todas las cuentas del sistema.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: '**Crear usuario:** completá email, nombre, contraseña, rol y local (si aplica).' },
            { texto: '**Cambiar rol:** usá el selector de rol en la fila del usuario.' },
            { texto: '**Módulos permitidos:** para los roles de colaborador, seleccioná los módulos a los que ese usuario tiene acceso.' },
            { texto: '**Resetear contraseña:** tocá el botón 🔑 en la fila del usuario.' },
          ],
        },
        {
          tipo: 'lista',
          titulo: 'Roles disponibles',
          items: [
            '**Local** — hace pedidos desde su sucursal',
            '**Depósito** — gestiona pedidos de depósito',
            '**Supervisor de fábrica** — registro de producción, personal, conteo de stock y reportes de fábrica',
            '**Mayorista** — gestiona los pedidos de fábrica y el catálogo de productos elaborados',
            '**Colaborador** (squad o un rol creado en Roles) — acceso parcial a módulos del panel de administración',
            '**Admin** — acceso completo al sistema',
          ],
        },
        { tipo: 'alerta', texto: 'No podés cambiar tu propio rol. Si necesitás hacerlo, pedile a otro administrador.' },
      ],
    },
    {
      ancla: 'parametros',
      titulo: 'Otros parámetros',
      bloques: [
        {
          tipo: 'lista',
          items: [
            '**Plan de cuentas** — el plan fijo del negocio, para consultar qué entra en cada cuenta.',
            '**Proveedores** — alta y edición de proveedores vinculables a gastos.',
            '**APIs** — configuración de claves y conexiones externas (Posberry, Fudo, etc.).',
            '**Cajas** — administración de cajas disponibles para registrar gastos.',
            '**Formas de pago** — alta y edición de medios de pago aceptados.',
          ],
        },
      ],
    },
    {
      ancla: 'tareas',
      titulo: 'Tareas',
      bloques: [
        { tipo: 'parrafo', texto: 'Tablero compartido entre todos los usuarios con acceso al módulo. Tiene tres vistas intercambiables: **Board** (columnas por estado), **Lista** (tabla ordenable por cualquier columna) y **Calendario** (por día, semana o mes).' },
        {
          tipo: 'lista',
          titulo: 'Estados',
          items: [
            '**Pendiente** — recién creada, todavía no se empezó.',
            '**En progreso** — alguien la está trabajando.',
            '**Completada** — terminada.',
            '**Vencida** — pasó la fecha límite y no está completada; se muestra en su propia columna para no perderla de vista.',
          ],
        },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Tocá **＋** para crear una tarea: título, descripción, prioridad (Alta / Media / Baja), fecha límite (opcional), turno (Mañana / Tarde) y a quién se la asignás (podés elegir más de una persona).' },
            { texto: 'Si además querés sumar a una persona puntual o a un área que colabore sin ser responsable principal, activalo en **Colaboración**.' },
            { texto: 'En el Board, arrastrá la tarjeta a otra columna para cambiar el estado, o usá el menú **⋯** de la tarjeta.' },
          ],
        },
        { tipo: 'tip', texto: 'Las tareas se actualizan en tiempo real para todos los usuarios con acceso — no hace falta recargar la página.' },
      ],
    },
    {
      ancla: 'detalle-tarea',
      titulo: 'Detalle de una tarea',
      bloques: [
        {
          tipo: 'lista',
          titulo: 'Al abrir una tarea existente tenés 5 pestañas:',
          items: [
            '**Info** — datos de la tarea y edición.',
            '**Checklist** — subtareas con barra de progreso.',
            '**Adjuntos** — subir y descargar archivos.',
            '**Historial** — quién cambió qué campo y cuándo.',
            '**Comentarios** — hilo de conversación sobre la tarea, con notificación a los participantes.',
          ],
        },
      ],
    },
    {
      ancla: 'tareas-voz',
      titulo: 'Crear tareas por voz',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Mantené presionado el botón 🎙 y contá la tarea en voz alta (título, prioridad, fecha, a quién asignarla).' },
            { texto: 'Soltá para enviarla, o deslizá el dedo hacia la izquierda mientras la mantenés presionada para cancelar la grabación.' },
            { texto: 'La IA transcribe el audio y completa los campos automáticamente, y la tarea queda creada.' },
          ],
        },
        { tipo: 'tip', texto: 'También podés agregar un acceso directo a la pantalla de inicio del celular que arranca la grabación apenas se abre.' },
      ],
    },
    {
      ancla: 'calendario',
      titulo: 'Calendario e informes diarios',
      bloques: [
        { tipo: 'parrafo', texto: 'La vista Calendario organiza tareas y subtareas por fecha y turno (Mañana / Tarde). Tocá el **＋** de cada turno para crear una tarea, una subtarea o un informe del día en esa fecha puntual. También podés arrastrar tarjetas entre días o turnos para reprogramarlas.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Al crear un informe, elegí a quién enviarlo en **Enviar a** — Ricardo (Gerencia) viene precargado por defecto, pero podés sacarlo o sumar más gente.' },
            { texto: 'Marcá qué tareas completadas ese día querés incluir y completá el **Comentario** (obligatorio) contando cómo estuvo el turno.' },
            { texto: 'Si querés, sumá actividades puntuales con horario de inicio/fin y detalle.' },
          ],
        },
        { tipo: 'tip', texto: 'En las vistas Semana y Día vas a ver un fragmento del comentario en la tarjeta del informe (📨); abrila para leerlo completo.' },
      ],
    },
    {
      ancla: 'notificaciones',
      titulo: 'Notificaciones',
      bloques: [
        { tipo: 'parrafo', texto: 'Activá las notificaciones push (🔔) para recibir avisos cuando te asignen una tarea, cambie de estado, se actualice la fecha límite o te comenten algo.' },
      ],
    },
  ],
}
