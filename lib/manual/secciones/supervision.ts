import { ClipboardList } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const supervision: SeccionManual = {
  slug: 'supervision',
  titulo: 'Supervisión de locales',
  icono: ClipboardList,
  area: 'administracion',
  roles: ['admin'],
  modulos: ['supervision'],
  resumen: 'El checklist de la recorrida: empezar una visita, completarla desde el celular, anotar requerimientos, ver el análisis y los datos de cada sucursal.',
  actualizado: '2026-11-12',
  novedades: [
    { fecha: '2026-11-12', texto: 'En **Lugares**: **Clientes mayoristas**, **Equipos** entregados (con su historial) y **Parámetros**.' },
    { fecha: '2026-11-12', texto: 'Checklists de **Fábrica** y **Depósito**: se eligen en **Tipo de visita** al empezar.' },
    { fecha: '2026-11-11', texto: '**Requerimientos**: lo que falta, lo que hay que reparar o una idea, con seguimiento propio. Los abiertos aparecen al empezar otra visita al mismo lugar.' },
    { fecha: '2026-11-11', texto: 'Checklist de sucursal actualizado (85 ítems), bloques nuevos de **Limpieza de baño** y **Seguridad e higiene**, ítems según el tipo de horno y el jugo, y la pestaña **Lugares**.' },
  ],
  apartados: [
    {
      ancla: 'para-que-sirve',
      titulo: '¿Para qué sirve?',
      bloques: [
        { tipo: 'parrafo', texto: 'El supervisor recorre las sucursales y marca cada ítem del checklist como **Cumple**, **No cumple** o **N/A**. El sistema calcula el porcentaje de cumplimiento por bloque y total, guarda el historial y muestra lo que más se incumple.' },
        { tipo: 'parrafo', texto: 'El porcentaje es Cumple ÷ (Cumple + No cumple). Los N/A no cuentan.' },
      ],
    },
    {
      ancla: 'nueva-visita',
      titulo: 'Empezar una visita',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Entrá a **Supervisión de locales** y quedate en **Nueva visita**.' },
            { texto: 'Elegí el **Tipo de visita**: Sucursal, Fábrica o Depósito.' },
            { texto: 'Si es una sucursal, elegila. Cada una muestra hace cuánto fue la última visita y su porcentaje. Fábrica y Depósito son un solo lugar y se eligen solos.' },
            { texto: 'Revisá tu nombre y el del encargado: el encargado viene cargado de **Lugares** y lo podés cambiar si hoy está otra persona.' },
            { texto: 'Tocá **Comenzar visita en …**.' },
          ],
        },
        { tipo: 'tip', texto: 'Lo que quedó en No cumple en la última visita a esa sucursal aparece primero, con la observación de esa vez, para que verifiques si se corrigió.' },
      ],
    },
    {
      ancla: 'checklist',
      titulo: 'Completar el checklist',
      bloques: [
        {
          tipo: 'lista',
          items: [
            'En el celular vas bloque por bloque con los chips de arriba o con los botones de abajo. En la compu, los bloques están a la izquierda.',
            'Al marcar **No cumple** se abre la observación: anotá qué viste y a quién se le indicó.',
            'Tocar de nuevo la misma respuesta la desmarca.',
            'Cada cambio se guarda solo. Si no hay señal, queda guardado en el celular y se sube cuando vuelve la conexión.',
            'Al final está el **Cierre**: lo que quedó sin responder pasa a No cumple, marcado como "sin responder".',
          ],
        },
      ],
    },
    {
      ancla: 'fabrica-deposito',
      titulo: 'Visitas a fábrica y depósito',
      bloques: [
        { tipo: 'parrafo', texto: 'Tienen su propio checklist y, al final, los mismos bloques de **Limpieza de baño** y **Seguridad e higiene** que las sucursales. También se cargan requerimientos en el cierre.' },
        {
          tipo: 'lista',
          items: [
            '**Fábrica:** presentación del personal, masa y producción, orden y limpieza, frío, limpieza de maquinaria, vestuario y equipos.',
            '**Depósito:** el control de ingresos y egresos, orden, limpieza, el freezer de chipacitos grandes y las salidas a eventos.',
          ],
        },
        { tipo: 'tip', texto: 'Las planillas de ingresos, egresos y salidas a eventos del depósito no están en el sistema: pedíselas al encargado del depósito y revisá que estén al día. En el conteo al azar, anotá en la observación qué insumos contaste.' },
        { tipo: 'parrafo', texto: 'En **Visitas** y **Análisis**, elegí arriba el tipo: cada uno tiene su propio promedio y no se mezcla con las sucursales.' },
      ],
    },
    {
      ancla: 'items-segun-sucursal',
      titulo: 'Ítems que cambian según la sucursal',
      bloques: [
        { tipo: 'parrafo', texto: 'Algunos ítems dependen de cómo es cada sucursal y salen de lo cargado en **Lugares**:' },
        {
          tipo: 'lista',
          items: [
            '**Horno rotativo:** se hornea en tandas de 3 bandejas, con espacio entre ellas.',
            '**Horno convector:** se usan solo las 2 bandejas centrales.',
            '**Jugo de naranja preparado:** solo aparece en las sucursales que trabajan con jugo.',
          ],
        },
        { tipo: 'tip', texto: 'Si una sucursal no tiene cargado el dato, aparecen los dos ítems del horno (o el del jugo). Marcá N/A el que no corresponde y avisale a un administrador para que lo complete.' },
        { tipo: 'parrafo', texto: 'Una visita ya empezada no cambia si después se modifican los datos de la sucursal: la próxima visita toma los nuevos.' },
      ],
    },
    {
      ancla: 'arqueo',
      titulo: 'Diferencia de arqueo',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Caja y administración**, el ítem del arqueo tiene un campo opcional **Diferencia detectada ($)**. Anotá el monto si hubo diferencia. Se usa para el análisis por sucursal y no cambia el porcentaje.' },
      ],
    },
    {
      ancla: 'requerimientos',
      titulo: 'Requerimientos',
      bloques: [
        { tipo: 'parrafo', texto: 'Lo que detectás o te pide el personal durante la visita: una herramienta o insumo que falta, algo para reparar, una idea. No es parte del checklist y no suma al porcentaje.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'En el **Cierre** de la visita, escribí en **Qué hace falta** y elegí la **Categoría** y la **Prioridad**.' },
            { texto: 'Tocá **Agregar**. Se guarda en el momento; podés cargar varios.' },
            { texto: 'Si te equivocaste, borralo con el tacho mientras la visita sigue en curso.' },
          ],
        },
        { tipo: 'parrafo', texto: 'En la pestaña **Requerimientos** está el seguimiento: por defecto los abiertos, los urgentes primero. Tocá uno para cambiar el **Estado**, escribir la **Respuesta** (qué se decidió y por qué) y el **Responsable**, y tocá **Guardar**.' },
        { tipo: 'tip', texto: 'Al empezar otra visita al mismo lugar, los requerimientos que siguen abiertos aparecen al lado del botón para empezar.' },
      ],
    },
    {
      ancla: 'lugares',
      titulo: 'Datos de cada sucursal (Lugares)',
      bloques: [
        { tipo: 'parrafo', texto: 'En la pestaña **Lugares** está el tipo de horno, si trabaja con jugo preparado y el encargado de cada sucursal. Los carga un administrador; el supervisor los ve.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Elegí el **Horno** (Rotativo o Convector) y si tiene **Jugo preparado**. Si no lo sabés todavía, dejá **Sin dato**.' },
            { texto: 'Escribí el **Encargado**.' },
            { texto: 'Tocá **Guardar** en esa fila.' },
          ],
        },
      ],
    },
    {
      ancla: 'mayoristas',
      titulo: 'Clientes mayoristas',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Lugares → Clientes mayoristas** está la ficha de cada cliente: dirección, tipo de local, si cocina o solo vende congelado, de quién es el freezer y el horno, y el contacto. Se carga una vez y se corrige cuando algo cambia. Es una lista propia de supervisión, aparte de los pedidos mayoristas.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Tocá **Nuevo cliente** y completá la ficha. Si es una cadena, cargá cada local por separado (por ejemplo, Supermax con cada sucursal).' },
            { texto: 'Tocá **Guardar**. Para corregirla, tocá el lápiz al lado del cliente.' },
          ],
        },
        { tipo: 'tip', texto: 'Si el cliente tiene un freezer u horno de Ya! en **Equipos**, cuenta como de Ya! aunque la ficha diga otra cosa.' },
      ],
    },
    {
      ancla: 'equipos',
      titulo: 'Equipos entregados',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Lugares → Equipos** están las exhibidoras, hornos, freezers y heladeras que Ya! entrega a los clientes. Cada uno necesita al menos el **código interno** (el de la etiqueta), el **número de serie** o el **lote**.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Tocá **Nuevo equipo**, completá los datos y elegí el cliente si ya está entregado.' },
            { texto: 'Para cambiarlo de cliente, mandarlo a reparar o retirarlo, abrí el equipo y tocá **Registrar un movimiento**. Queda en el historial con la fecha y el responsable.' },
            { texto: 'Para corregir la marca, el número o las observaciones, tocá **Editar datos**.' },
          ],
        },
      ],
    },
    {
      ancla: 'parametros',
      titulo: 'Parámetros',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Lugares → Parámetros** está el **tiempo máximo en exhibidora** del producto cocido, para los clientes que cocinan. Es un valor provisorio (3 horas) que se ajusta con las primeras visitas. Lo cambia un administrador.' },
      ],
    },
    {
      ancla: 'analisis',
      titulo: 'Visitas y Análisis',
      bloques: [
        {
          tipo: 'lista',
          items: [
            '**Visitas:** el historial, con filtros por período, estado, nivel, zona y supervisor.',
            '**Análisis:** el mapa sucursal × bloque con la última visita cerrada de cada una, lo que más se incumple y las **Diferencias de arqueo** del período.',
            '**CSV** baja una fila por ítem y por visita, con la diferencia de arqueo, para abrir en Excel.',
          ],
        },
      ],
    },
    {
      ancla: 'que-hago-si',
      titulo: '¿Qué hago si…?',
      bloques: [
        {
          tipo: 'queHagoSi',
          casos: [
            { situacion: 'Veo los dos ítems de carga del horno', camino: 'La sucursal no tiene cargado el tipo de horno. Marcá N/A el que no corresponde y pedile a un administrador que lo cargue en **Lugares**.' },
            { situacion: 'Se cortó la conexión en medio de la visita', camino: 'Seguí completando: queda guardado en el celular. Al volver la señal se sube solo, o tocá **Continuar** en el aviso de la pantalla de inicio.' },
            { situacion: 'Quiero borrar un requerimiento de una visita cerrada', camino: 'Pasalo a **Descartado** en la pestaña **Requerimientos** y anotá el motivo en la respuesta. Así queda el historial.' },
            { situacion: 'Quiero borrar una visita', camino: 'Solo un administrador puede borrarla, desde el detalle de la visita.' },
          ],
        },
      ],
    },
  ],
}
