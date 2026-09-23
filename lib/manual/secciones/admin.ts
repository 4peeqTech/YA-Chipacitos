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
        { tipo: 'parrafo', texto: 'En **Gastos** registrás y consultás todos los gastos del negocio organizados por local, rubro y categoría.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Completá los campos: fecha, local, rubro, categoría, proveedor (opcional), monto, forma de pago y estado.' },
            { texto: 'Los gastos quedan registrados y pueden filtrarse por cualquier campo.' },
          ],
        },
        { tipo: 'parrafo', texto: 'En **Pendientes de pago** ves solo los gastos que todavía no fueron abonados. Podés marcarlos como pagados desde ahí.' },
        { tipo: 'parrafo', texto: 'En **Resumen por local** ves el total de gastos agrupados por sucursal y período.' },
        {
          tipo: 'estados',
          dominio: 'gastos',
          estados: [
            { estado: 'Pendiente de pago', texto: 'Todavía no se pagó nada.' },
            { estado: 'Parcial', texto: 'Se pagó una parte.' },
            { estado: 'Pagado', texto: 'Está saldado.' },
          ],
        },
      ],
    },
    {
      ancla: 'fudo',
      titulo: 'Fudo / Caja',
      bloques: [
        { tipo: 'parrafo', texto: 'Consulta de datos de caja sincronizados desde Fudo. Podés ver gastos, ventas y pagos importados, filtrando por tipo y rango de fechas.' },
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
            '**Plan de cuentas** — categorías contables para clasificar gastos.',
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
