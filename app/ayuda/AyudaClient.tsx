'use client'

import { useState } from 'react'

interface Props {
  rol: string
  modulosPermitidos?: string[]
}

type SeccionId = 'local' | 'deposito' | 'fabrica' | 'admin' | 'squad'

const secciones: { id: SeccionId; label: string; icon: string; roles: string[] }[] = [
  { id: 'local',    label: 'Locales',      icon: '🏪', roles: ['local'] },
  { id: 'deposito', label: 'Depósito',     icon: '📦', roles: ['deposito'] },
  { id: 'fabrica',  label: 'Fábrica',      icon: '🏭', roles: ['fabrica'] },
  { id: 'admin',    label: 'Admin',        icon: '⚙️', roles: ['admin'] },
  { id: 'squad',    label: 'Colaborador',  icon: '👤', roles: ['squad'] },
]

export default function AyudaClient({ rol, modulosPermitidos = [] }: Props) {
  const visibles = secciones.filter(s => s.roles.includes(rol))
  // Un rol personalizado (creado desde Parámetros) no matchea ninguna
  // sección fija — cae en "Colaborador", igual que squad.
  const [activa, setActiva] = useState<SeccionId>(visibles[0]?.id ?? 'squad')

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Manual de usuario</h1>
        <p className="text-sm text-[#888] mt-1">Guía completa del sistema YA! Chipacitos</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-start">

        {/* Navegación lateral */}
        <nav className="bg-[#111111] border border-[#2a2a2a] rounded-2xl overflow-hidden lg:sticky lg:top-20">
          {visibles.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiva(s.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-left
                ${i < visibles.length - 1 ? 'border-b border-[#2a2a2a]' : ''}
                ${activa === s.id ? 'bg-[#e8c547] text-black' : 'text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'}
              `}
            >
              <span>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* Contenido */}
        <div className="space-y-4">
          {activa === 'local'    && <SeccionLocal />}
          {activa === 'deposito' && <SeccionDeposito />}
          {activa === 'fabrica'  && <SeccionFabrica />}
          {activa === 'admin'    && <SeccionAdmin />}
          {activa === 'squad'    && <SeccionSquad modulosPermitidos={modulosPermitidos} />}
        </div>
      </div>
    </div>
  )
}

/* ─── Primitivos ─────────────────────────────────────────────────────────── */

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#2a2a2a] bg-[#0a0a0a]">
        <h2 className="text-sm font-semibold text-[#e8c547] uppercase tracking-wider">{titulo}</h2>
      </div>
      <div className="px-5 py-4 space-y-3 text-sm text-[#c0c0c0] leading-relaxed">
        {children}
      </div>
    </div>
  )
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#e8c547] text-black text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <p>{children}</p>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[rgba(232,197,71,.07)] border-l-4 border-[#e8c547] rounded-r-xl px-4 py-2.5 text-[#e8c547] text-xs">
      💡 {children}
    </div>
  )
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[rgba(232,66,16,.07)] border-l-4 border-[#e84210] rounded-r-xl px-4 py-2.5 text-[#e84210] text-xs">
      ⚠️ {children}
    </div>
  )
}

function BadgeEstado({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap" style={{ color, backgroundColor: bg }}>
      {label}
    </span>
  )
}

/* ─── Sección Local ──────────────────────────────────────────────────────── */

function SeccionLocal() {
  return (
    <>
      <Bloque titulo="¿Qué puedo hacer desde mi cuenta?">
        <p>Como local (sucursal) podés hacer pedidos a fábrica y depósito, consultar el historial de tus pedidos, y ver las ventas registradas en Posberry para tu sucursal.</p>
      </Bloque>

      <Bloque titulo="Cómo hacer un pedido">
        <Paso n={1}>Ingresá a <strong className="text-[#f0f0f0]">Pedir ＋</strong> desde el menú inferior.</Paso>
        <Paso n={2}>Encontrarás dos pestañas: <strong className="text-[#f0f0f0]">Fábrica</strong> (chipacitos y productos elaborados) y <strong className="text-[#f0f0f0]">Depósito</strong> (insumos y packaging). Usá el buscador o los botones <strong className="text-[#f0f0f0]">＋ / −</strong> para seleccionar cantidades.</Paso>
        <Paso n={3}>Para agregar rápido por código, escribí <strong className="text-[#f0f0f0]">código*cantidad</strong> en el buscador (ej: <code className="text-[#e8c547]">12*5</code>) y presioná Enter.</Paso>
        <Paso n={4}>Si tenés alguna aclaración, escribila en <strong className="text-[#f0f0f0]">Nota para el pedido</strong>.</Paso>
        <Paso n={5}>Tocá <strong className="text-[#f0f0f0]">Enviar pedido</strong>. Si el pedido tiene productos de los dos destinos, se crean automáticamente dos órdenes separadas.</Paso>
        <Tip>El pedido llega al instante. No hace falta llamar para confirmar.</Tip>
      </Bloque>

      <Bloque titulo="Estados del pedido">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <BadgeEstado label="Pendiente" color="#888" bg="#1a1a1a" />
            <p>El pedido fue recibido y está en espera.</p>
          </div>
          <div className="flex items-center gap-3">
            <BadgeEstado label="En preparación" color="#e8c547" bg="rgba(232,197,71,.1)" />
            <p>Fábrica o depósito está armando el pedido.</p>
          </div>
          <div className="flex items-center gap-3">
            <BadgeEstado label="Enviado" color="#56d68a" bg="rgba(86,214,138,.1)" />
            <p>El pedido fue despachado. Aparece el botón para confirmar recepción.</p>
          </div>
          <div className="flex items-center gap-3">
            <BadgeEstado label="Recibido" color="#f0f0f0" bg="#2a2a2a" />
            <p>Confirmaste que recibiste el pedido. El ciclo está completo.</p>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Confirmar recepción">
        <Paso n={1}>Cuando el pedido pase a <strong className="text-[#f0f0f0]">Enviado</strong>, te aparece un botón para confirmar recepción.</Paso>
        <Paso n={2}>Al confirmarlo, podés ingresar la cantidad y el valor recibido por cada ítem (remito).</Paso>
        <Paso n={3}>Una vez completado, el pedido queda como <strong className="text-[#f0f0f0]">Recibido</strong>.</Paso>
        <Alerta>Confirmá la recepción solo cuando el pedido efectivamente llegó y revisaste las cantidades.</Alerta>
      </Bloque>

      <Bloque titulo="Mensajes dentro del pedido">
        <p>Dentro de cada pedido podés enviar y recibir mensajes con fábrica o depósito. Es útil para aclaraciones sin tener que llamar.</p>
        <Tip>Los mensajes quedan guardados en el historial del pedido.</Tip>
      </Bloque>

      <Bloque titulo="Historial de pedidos 📋">
        <p>En <strong className="text-[#f0f0f0]">Pedidos 📋</strong> ves todos tus pedidos anteriores. Podés filtrar por estado o buscar por número de pedido y ver el detalle completo de cada uno.</p>
      </Bloque>

      <Bloque titulo="Mis ventas 📈">
        <p>En <strong className="text-[#f0f0f0]">Ventas</strong> ves el resumen de ventas del día para tu sucursal, tal como lo registra Posberry. Los datos los importa el administrador.</p>
        <Tip>Si no ves datos, significa que el admin todavía no importó la información del día.</Tip>
      </Bloque>
    </>
  )
}

/* ─── Sección Depósito ───────────────────────────────────────────────────── */

function SeccionDeposito() {
  return (
    <>
      <Bloque titulo="¿Qué puedo hacer desde mi cuenta?">
        <p>Como operador de depósito ves en tiempo real todos los pedidos de insumos y packaging que te corresponden, podés cambiar su estado y comunicarte con el local.</p>
      </Bloque>

      <Bloque titulo="Ver pedidos recibidos 📋">
        <Paso n={1}>Al ingresar entrás directamente a la lista de pedidos pendientes de depósito.</Paso>
        <Paso n={2}>Cada tarjeta muestra el local, la fecha, el número de pedido y los productos solicitados con sus cantidades.</Paso>
        <Paso n={3}>Los pedidos más recientes aparecen primero.</Paso>
      </Bloque>

      <Bloque titulo="Cambiar el estado de un pedido">
        <Paso n={1}>Abrí el pedido tocando sobre la tarjeta.</Paso>
        <Paso n={2}>Avanzá entre estados: <strong className="text-[#f0f0f0]">Pendiente → En preparación → Enviado</strong>.</Paso>
        <Paso n={3}>El local ve el cambio de estado al instante.</Paso>
        <Tip>Cambiá a "En preparación" cuando empieces a armar el pedido para que el local sepa que está siendo atendido.</Tip>
      </Bloque>

      <Bloque titulo="Mensajes dentro del pedido">
        <p>Dentro de cada pedido podés leer y responder mensajes del local. Se muestra la fecha y el remitente de cada mensaje.</p>
      </Bloque>

      <Bloque titulo="Catálogo de insumos 🔀">
        <p>En <strong className="text-[#f0f0f0]">Catálogo</strong> podés consultar la lista completa de insumos y packaging disponibles del depósito, con sus códigos y unidades.</p>
      </Bloque>
    </>
  )
}

/* ─── Sección Fábrica ────────────────────────────────────────────────────── */

function SeccionFabrica() {
  return (
    <>
      <Bloque titulo="¿Qué puedo hacer desde mi cuenta?">
        <p>Como operador de fábrica ves en tiempo real todos los pedidos de productos elaborados (chipacitos y similares) que te corresponden, podés cambiar su estado y comunicarte con el local.</p>
      </Bloque>

      <Bloque titulo="Ver pedidos recibidos 🚚">
        <Paso n={1}>Al ingresar entrás directamente a la lista de pedidos pendientes de fábrica.</Paso>
        <Paso n={2}>Cada tarjeta muestra el local, la fecha, el número de pedido y los productos solicitados con sus cantidades.</Paso>
        <Paso n={3}>Los pedidos más recientes aparecen primero.</Paso>
      </Bloque>

      <Bloque titulo="Cambiar el estado de un pedido">
        <Paso n={1}>Abrí el pedido tocando sobre la tarjeta.</Paso>
        <Paso n={2}>Avanzá entre estados: <strong className="text-[#f0f0f0]">Pendiente → En preparación → Enviado</strong>.</Paso>
        <Paso n={3}>El local ve el cambio de estado al instante.</Paso>
        <Tip>Cambiá a "En preparación" cuando empieces a preparar el pedido para que el local sepa que está siendo atendido.</Tip>
      </Bloque>

      <Bloque titulo="Mensajes dentro del pedido">
        <p>Dentro de cada pedido podés leer y responder mensajes del local. Se muestra la fecha y el remitente de cada mensaje.</p>
      </Bloque>

      <Bloque titulo="Catálogo de productos 🔀">
        <p>En <strong className="text-[#f0f0f0]">Catálogo</strong> podés consultar la lista completa de productos elaborados de fábrica con sus códigos y unidades.</p>
      </Bloque>
    </>
  )
}

/* ─── Sección Admin ──────────────────────────────────────────────────────── */

function SeccionAdmin() {
  return (
    <>
      <Bloque titulo="Visión general">
        <p>Como administrador tenés acceso completo a todos los módulos: pedidos, gastos, ventas Posberry, conciliación, catálogo, usuarios y configuración. El menú lateral agrupa los módulos por sección.</p>
      </Bloque>

      <Bloque titulo="Dashboard 🏠">
        <p>Punto de partida del sistema. Muestra un resumen del día: pedidos activos, alertas y accesos rápidos a los módulos más usados.</p>
      </Bloque>

      <Bloque titulo="Gastos 💰">
        <p>En <strong className="text-[#f0f0f0]">Gastos</strong> registrás y consultás todos los gastos del negocio organizados por local, rubro y categoría.</p>
        <Paso n={1}>Completá los campos: fecha, local, rubro, categoría, proveedor (opcional), monto, forma de pago y estado.</Paso>
        <Paso n={2}>Los gastos quedan registrados y pueden filtrarse por cualquier campo.</Paso>
        <p>En <strong className="text-[#f0f0f0]">Pendientes de pago ⏳</strong> ves solo los gastos que todavía no fueron abonados. Podés marcarlos como pagados desde ahí.</p>
        <p>En <strong className="text-[#f0f0f0]">Resumen por local 📊</strong> ves el total de gastos agrupados por sucursal y período.</p>
      </Bloque>

      <Bloque titulo="Fudo / Caja 🏧">
        <p>Consulta de datos de caja sincronizados desde Fudo. Podés ver gastos, ventas y pagos importados, filtrando por tipo y rango de fechas.</p>
        <Tip>Los datos se traen directamente de la API de Fudo. Si no aparecen datos, verificá la conexión con el admin técnico.</Tip>
      </Bloque>

      <Bloque titulo="Sincronizar desde Sheets 🔄">
        <Paso n={1}>Andá a <strong className="text-[#f0f0f0]">Sincronizar</strong>.</Paso>
        <Paso n={2}>Elegí el rango de fechas (desde / hasta) que querés importar.</Paso>
        <Paso n={3}>Tocá <strong className="text-[#f0f0f0]">Sincronizar desde Sheets</strong>. El sistema lee la hoja <em>BD</em> de Google Sheets y guarda las ventas en la base de datos.</Paso>
        <Paso n={4}>Al terminar ves cuántas ventas se importaron y si hay locales sin mapear.</Paso>
        <Tip>También podés cargar un archivo CSV exportado desde Posberry usando la sección de carga manual.</Tip>
        <Alerta>Si aparecen locales "sin mapear", el nombre en Posberry no coincide con ningún local del sistema. Solucionalo en Mapeo de productos.</Alerta>
      </Bloque>

      <Bloque titulo="Ventas Posberry 📈">
        <p>Vista completa de la hoja BD sin filtros de local, incluyendo mayoristas.</p>
        <Paso n={1}>Tocá <strong className="text-[#f0f0f0]">Cargar datos</strong> para traer la información.</Paso>
        <Paso n={2}>Filtrá por fecha, cliente, producto o dirección con los campos de búsqueda.</Paso>
        <Paso n={3}>Usá los chips <strong className="text-[#f0f0f0]">Todos / Sucursales / Mayoristas</strong> para segmentar la vista.</Paso>
      </Bloque>

      <Bloque titulo="Conciliación 📊">
        <p>Compara lo vendido en Posberry versus lo pedido por cada local, por producto y fecha.</p>
        <Paso n={1}>Elegí el rango de fechas con los campos Desde / Hasta.</Paso>
        <Paso n={2}>Si los datos no están actualizados, tocá <strong className="text-[#f0f0f0]">⟳ Recalcular</strong>.</Paso>
        <Paso n={3}>Las filas con diferencia en rojo o ícono ⚠️ tienen discrepancia entre lo vendido y lo pedido.</Paso>
        <Paso n={4}>Una vez revisada una fila, tocá <strong className="text-[#56d68a]">○ Confirmar</strong> para marcarla como revisada.</Paso>
        <div className="pt-1 space-y-2">
          <p className="text-[#888] text-xs font-semibold uppercase tracking-wider">Columnas de la tabla</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div><span className="text-[#f0f0f0] font-medium">Posberry</span> — nombre en la planilla</div>
            <div><span className="text-[#f0f0f0] font-medium">Sistema</span> — nombre mapeado internamente</div>
            <div><span className="text-[#f0f0f0] font-medium">Vendido</span> — unidades según Posberry</div>
            <div><span className="text-[#f0f0f0] font-medium">Pedido</span> — unidades según el pedido</div>
            <div><span className="text-[#f0f0f0] font-medium">Dif.</span> — Vendido − Pedido</div>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Catálogo 📦">
        <p>Administrás todos los productos del sistema: chipacitos (fábrica) e insumos (depósito). Podés crear, editar y desactivar productos, asignarles código, categoría, unidad y destino.</p>
      </Bloque>

      <Bloque titulo="Mapeo de productos 🔗">
        <p>Vinculás los nombres que aparecen en Posberry con los productos internos del sistema para que la conciliación funcione correctamente.</p>
        <Paso n={1}>Ves la lista de nombres del sheet de Posberry sin mapear.</Paso>
        <Paso n={2}>Para cada uno elegís el producto equivalente desde el selector.</Paso>
        <Paso n={3}>Guardás. Desde ahí la conciliación puede cruzar los datos.</Paso>
        <Alerta>Si en la conciliación aparece "sin mapear", el producto de Posberry no tiene mapeo. Crealo acá.</Alerta>
      </Bloque>

      <Bloque titulo="Gestión de usuarios 👥">
        <p>Administrás todas las cuentas del sistema.</p>
        <Paso n={1}><strong className="text-[#f0f0f0]">Crear usuario:</strong> completá email, nombre, contraseña, rol y local (si aplica).</Paso>
        <Paso n={2}><strong className="text-[#f0f0f0]">Cambiar rol:</strong> usá el selector de rol en la fila del usuario.</Paso>
        <Paso n={3}><strong className="text-[#f0f0f0]">Módulos permitidos:</strong> para el rol <em>squad</em>, seleccioná los módulos a los que ese usuario tiene acceso.</Paso>
        <Paso n={4}><strong className="text-[#f0f0f0]">Resetear contraseña:</strong> tocá el botón 🔑 en la fila del usuario.</Paso>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-1">
          <p className="col-span-2 text-[#888] text-xs font-semibold uppercase tracking-wider">Roles disponibles</p>
          <div><span className="text-[#f0f0f0] font-medium">local</span> — hace pedidos desde su sucursal</div>
          <div><span className="text-[#f0f0f0] font-medium">deposito</span> — gestiona pedidos de depósito</div>
          <div><span className="text-[#f0f0f0] font-medium">fabrica</span> — gestiona pedidos de fábrica</div>
          <div><span className="text-[#f0f0f0] font-medium">squad</span> — acceso parcial a módulos admin</div>
          <div><span className="text-[#f0f0f0] font-medium">admin</span> — acceso completo al sistema</div>
        </div>
        <Alerta>No podés cambiar tu propio rol. Si necesitás hacerlo, pedile a otro administrador.</Alerta>
      </Bloque>

      <Bloque titulo="Otros parámetros">
        <div className="space-y-2 text-sm">
          <p><strong className="text-[#f0f0f0]">Plan de cuentas 📋</strong> — categorías contables para clasificar gastos.</p>
          <p><strong className="text-[#f0f0f0]">Proveedores 🚚</strong> — alta y edición de proveedores vinculables a gastos.</p>
          <p><strong className="text-[#f0f0f0]">APIs 🔌</strong> — configuración de claves y conexiones externas (Posberry, Fudo, etc.).</p>
          <p><strong className="text-[#f0f0f0]">Cajas 🏦</strong> — administración de cajas disponibles para registrar gastos.</p>
          <p><strong className="text-[#f0f0f0]">Formas de pago 💳</strong> — alta y edición de medios de pago aceptados.</p>
        </div>
      </Bloque>

      <Bloque titulo="Tareas 📋">
        <p>Tablero kanban compartido entre todos los usuarios con acceso. Podés crear tareas, asignarlas a un usuario, definir prioridad (Alta / Media / Baja) y moverlas entre columnas: <strong className="text-[#f0f0f0]">Pendiente → En progreso → Completada</strong>.</p>
        <Tip>Las tareas se actualizan en tiempo real para todos los usuarios que tengan el módulo habilitado.</Tip>
      </Bloque>
    </>
  )
}

/* ─── Sección Squad (colaborador) ───────────────────────────────────────── */

const MODULO_AYUDA: Record<string, { titulo: string; desc: string }> = {
  dashboard:        { titulo: 'Dashboard 🏠',             desc: 'Resumen del día: pedidos activos y accesos rápidos a los módulos habilitados.' },
  gastos:           { titulo: 'Gastos 💰',                desc: 'Registro y consulta de gastos por local, rubro y categoría.' },
  gastos_pendientes:{ titulo: 'Pendientes de pago ⏳',    desc: 'Lista de gastos que todavía no fueron abonados. Podés marcarlos como pagados.' },
  resumen:          { titulo: 'Resumen por local 📊',     desc: 'Total de gastos agrupados por sucursal y período.' },
  fudo:             { titulo: 'Fudo / Caja 🏧',           desc: 'Datos de caja importados desde Fudo: gastos, ventas y pagos.' },
  importar:         { titulo: 'Sincronizar 🔄',           desc: 'Importa ventas desde Google Sheets (hoja BD) o un archivo CSV de Posberry.' },
  posberry:         { titulo: 'Ventas Posberry 📈',       desc: 'Tabla completa de ventas de Posberry, incluyendo mayoristas.' },
  conciliacion:     { titulo: 'Conciliación 📊',          desc: 'Compara lo vendido en Posberry versus lo pedido por cada local.' },
  catalogo:         { titulo: 'Catálogo 📦',              desc: 'Consulta y administración de productos del sistema.' },
  mapeos:           { titulo: 'Mapeo de productos 🔗',    desc: 'Vincula nombres de Posberry con productos internos para la conciliación.' },
  usuarios:         { titulo: 'Usuarios 👥',              desc: 'Alta, edición de roles y reseteo de contraseñas de cuentas.' },
  plan_cuentas:     { titulo: 'Plan de cuentas 📋',       desc: 'Categorías contables para clasificar gastos.' },
  proveedores:      { titulo: 'Proveedores 🚚',           desc: 'Alta y edición de proveedores vinculables a gastos.' },
  locales:          { titulo: 'APIs 🔌',                  desc: 'Configuración de claves y conexiones externas.' },
  cajas:            { titulo: 'Cajas 🏦',                 desc: 'Administración de cajas disponibles.' },
  formas_pago:      { titulo: 'Formas de pago 💳',        desc: 'Alta y edición de medios de pago.' },
  tareas:           { titulo: 'Tareas 📋',                desc: 'Tablero kanban compartido para gestionar tareas del equipo.' },
}

function SeccionSquad({ modulosPermitidos }: { modulosPermitidos: string[] }) {
  const modulos = modulosPermitidos.filter(k => MODULO_AYUDA[k])

  return (
    <>
      <Bloque titulo="Tu acceso como colaborador">
        <p>Tenés acceso a un conjunto específico de módulos del panel de administración. Solo ves y podés usar lo que el administrador habilitó para tu cuenta.</p>
        {modulos.length === 0 && (
          <Alerta>No tenés módulos habilitados. Contactá al administrador para que asigne permisos a tu cuenta.</Alerta>
        )}
      </Bloque>

      {modulos.length > 0 && (
        <Bloque titulo="Módulos disponibles para vos">
          <div className="space-y-3">
            {modulos.map(key => {
              const m = MODULO_AYUDA[key]
              return (
                <div key={key} className="flex gap-3">
                  <div>
                    <p className="font-medium text-[#f0f0f0] text-sm">{m.titulo}</p>
                    <p className="text-xs text-[#888] mt-0.5">{m.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Bloque>
      )}

      <Bloque titulo="Cómo navegar el sistema">
        <p>Desde el menú lateral izquierdo accedés a todos los módulos habilitados. Si necesitás acceso a algo que no ves, pedíselo al administrador.</p>
        <Tip>Si un módulo no aparece en el menú, significa que tu cuenta no tiene permiso para usarlo.</Tip>
      </Bloque>
    </>
  )
}
