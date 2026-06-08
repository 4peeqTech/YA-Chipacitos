'use client'

import { useState } from 'react'

interface Props {
  rol: string
}

type SeccionId = 'local' | 'operador' | 'admin'

const secciones: { id: SeccionId; label: string; icon: string; roles: string[] }[] = [
  { id: 'local',    label: 'Locales',           icon: '🏪', roles: ['local', 'admin'] },
  { id: 'operador', label: 'Depósito / Fábrica', icon: '📦', roles: ['deposito', 'fabrica', 'admin'] },
  { id: 'admin',    label: 'Administrador',      icon: '⚙️', roles: ['admin'] },
]

export default function AyudaClient({ rol }: Props) {
  const visibles = secciones.filter(s => s.roles.includes(rol))
  const [activa, setActiva] = useState<SeccionId>(visibles[0]?.id ?? 'local')

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
          {activa === 'operador' && <SeccionOperador />}
          {activa === 'admin'    && <SeccionAdmin />}
        </div>
      </div>
    </div>
  )
}

/* ─── Componentes de sección ─────────────────────────────────────────────── */

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

/* ─── Sección Locales ────────────────────────────────────────────────────── */

function SeccionLocal() {
  return (
    <>
      <Bloque titulo="¿Qué puedo hacer desde mi cuenta?">
        <p>Como local (sucursal) podés hacer pedidos de productos a fábrica y depósito, ver el estado de cada pedido en tiempo real y comunicarte con el equipo.</p>
      </Bloque>

      <Bloque titulo="Cómo hacer un pedido">
        <Paso n={1}>Ingresá a <strong className="text-[#f0f0f0]">Pedir</strong> desde el menú inferior.</Paso>
        <Paso n={2}>Vas a ver dos secciones: <strong className="text-[#f0f0f0]">Fábrica</strong> (chipacitos y productos elaborados) y <strong className="text-[#f0f0f0]">Depósito</strong> (insumos y packaging). Usá los botones <strong className="text-[#f0f0f0]">+ / −</strong> para elegir las cantidades.</Paso>
        <Paso n={3}>Si tenés alguna aclaración especial, escribila en el campo <strong className="text-[#f0f0f0]">Nota para el pedido</strong>.</Paso>
        <Paso n={4}>Tocá <strong className="text-[#f0f0f0]">Enviar pedido</strong>. Si el pedido tiene productos de los dos destinos, se crean automáticamente dos órdenes separadas.</Paso>
        <Tip>El pedido llega al instante. No hace falta llamar para confirmar.</Tip>
      </Bloque>

      <Bloque titulo="Estados del pedido">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#888] bg-[#1a1a1a] border border-[#2a2a2a] px-2.5 py-1 rounded-full whitespace-nowrap">Pendiente</span>
            <p>El pedido fue recibido y está en espera de ser preparado.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#e8c547] bg-[rgba(232,197,71,.1)] px-2.5 py-1 rounded-full whitespace-nowrap">En preparación</span>
            <p>Fábrica o depósito está armando el pedido.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#56d68a] bg-[rgba(86,214,138,.1)] px-2.5 py-1 rounded-full whitespace-nowrap">Enviado</span>
            <p>El pedido ya fue despachado. Aparece el botón para confirmar la recepción.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#f0f0f0] bg-[#2a2a2a] px-2.5 py-1 rounded-full whitespace-nowrap">Recibido</span>
            <p>Confirmaste que recibiste el pedido. El ciclo está completo.</p>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Confirmar recepción">
        <Paso n={1}>Cuando el pedido pase a estado <strong className="text-[#f0f0f0]">Enviado</strong>, te aparece el botón verde <strong className="text-[#56d68a]">✓ Confirmar recepción</strong>.</Paso>
        <Paso n={2}>Tocalo para registrar que el pedido llegó correctamente.</Paso>
        <Alerta>Confirmá la recepción solo cuando el pedido efectivamente llegó. Esto ayuda a tener un registro preciso.</Alerta>
      </Bloque>

      <Bloque titulo="Mensajes dentro del pedido">
        <p>Dentro de cada pedido podés enviar y recibir mensajes directamente con fábrica o depósito. Útil para aclaraciones sin tener que llamar.</p>
        <Tip>Los mensajes quedan guardados en el historial del pedido.</Tip>
      </Bloque>

      <Bloque titulo="Ver historial de pedidos">
        <p>En <strong className="text-[#f0f0f0]">Pedidos</strong> (ícono 📋) encontrás todos tus pedidos anteriores con su estado, fecha y detalle de productos.</p>
      </Bloque>
    </>
  )
}

/* ─── Sección Operador (Depósito / Fábrica) ─────────────────────────────── */

function SeccionOperador() {
  return (
    <>
      <Bloque titulo="¿Qué puedo hacer desde mi cuenta?">
        <p>Como operador de depósito o fábrica ves en tiempo real todos los pedidos que te corresponden, podés cambiar su estado y comunicarte con el local.</p>
      </Bloque>

      <Bloque titulo="Ver pedidos recibidos">
        <Paso n={1}>Al ingresar al sistema entrás directamente a la lista de pedidos pendientes que te corresponden (depósito o fábrica, según tu rol).</Paso>
        <Paso n={2}>Los pedidos más urgentes o recientes aparecen primero. Cada tarjeta muestra el local, la fecha, los productos y la cantidad.</Paso>
      </Bloque>

      <Bloque titulo="Cambiar el estado de un pedido">
        <Paso n={1}>Abrí el pedido tocando sobre la tarjeta.</Paso>
        <Paso n={2}>Usá los botones de estado para avanzar: <strong className="text-[#f0f0f0]">Pendiente → En preparación → Enviado</strong>.</Paso>
        <Paso n={3}>El local ve el cambio de estado al instante.</Paso>
        <Tip>Cambiá a "En preparación" cuando empieces a armar el pedido para que el local sepa que está siendo atendido.</Tip>
      </Bloque>

      <Bloque titulo="Responder mensajes">
        <p>Dentro de cada pedido podés leer y responder mensajes del local. Aparece la fecha y quién escribió cada mensaje.</p>
      </Bloque>
    </>
  )
}

/* ─── Sección Admin ──────────────────────────────────────────────────────── */

function SeccionAdmin() {
  return (
    <>
      <Bloque titulo="Visión general del panel admin">
        <p>Como administrador tenés acceso completo a todas las funciones del sistema: métricas, sincronización con Posberry, conciliación, usuarios y mapeo de productos.</p>
      </Bloque>

      <Bloque titulo="Dashboard">
        <p>En <strong className="text-[#f0f0f0]">🏠 Dashboard</strong> ves las métricas del día: ventas totales de Posberry, pedidos activos y alertas pendientes. Es el punto de partida cada vez que entrás al sistema.</p>
      </Bloque>

      <Bloque titulo="Sincronizar con Google Sheets">
        <Paso n={1}>Andá a <strong className="text-[#f0f0f0]">🔄 Sincronizar</strong>.</Paso>
        <Paso n={2}>Elegí el rango de fechas (desde / hasta) que querés importar.</Paso>
        <Paso n={3}>Tocá <strong className="text-[#f0f0f0]">Sincronizar desde Sheets</strong>. El sistema lee la hoja <em>BD</em> de Google Sheets, filtra las filas de sucursales y las guarda en la base de datos.</Paso>
        <Paso n={4}>Al terminar ves cuántas ventas se importaron y si hay locales sin mapear.</Paso>
        <Tip>También podés importar un archivo CSV exportado desde Posberry usando la sección de carga manual.</Tip>
        <Alerta>Si aparecen locales "sin mapear" significa que el nombre en Posberry no coincide con ningún local del sistema. Solucionalo en <strong>Mapeo de productos</strong>.</Alerta>
      </Bloque>

      <Bloque titulo="Conciliación">
        <p>En <strong className="text-[#f0f0f0]">📊 Conciliación</strong> comparás lo que se vendió en Posberry versus lo que cada local pidió en el sistema, por producto y fecha.</p>
        <Paso n={1}>Elegí el rango de fechas con los campos Desde / Hasta.</Paso>
        <Paso n={2}>Si los datos no están actualizados, tocá <strong className="text-[#f0f0f0]">⟳ Recalcular</strong>.</Paso>
        <Paso n={3}>Las filas con <strong className="text-[#e84210]">diferencia en rojo</strong> o ícono ⚠️ tienen discrepancia entre lo vendido y lo pedido.</Paso>
        <Paso n={4}>Una vez revisada una fila, tocá <strong className="text-[#56d68a]">○ Confirmar</strong> para marcarla como revisada.</Paso>
        <div className="pt-1 space-y-2">
          <p className="text-[#888] text-xs font-semibold uppercase tracking-wider">Columnas de la tabla</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div><span className="text-[#f0f0f0] font-medium">Posberry</span> — nombre del producto en la planilla</div>
            <div><span className="text-[#f0f0f0] font-medium">Sistema</span> — nombre mapeado en el sistema interno</div>
            <div><span className="text-[#f0f0f0] font-medium">Vendido</span> — unidades según Posberry</div>
            <div><span className="text-[#f0f0f0] font-medium">Pedido</span> — unidades según el pedido del local</div>
            <div><span className="text-[#f0f0f0] font-medium">Dif.</span> — Vendido − Pedido (positivo = más vendido que pedido)</div>
          </div>
        </div>
        <Tip>Usá el panel lateral para filtrar por local. Los íconos OK / Dif. te muestran de un vistazo qué locales tienen problemas.</Tip>
      </Bloque>

      <Bloque titulo="Mapeo de productos">
        <p>En <strong className="text-[#f0f0f0]">🔗 Mapeo de productos</strong> vinculás los nombres de Posberry con los productos internos del sistema.</p>
        <Paso n={1}>Ves la lista de nombres que aparecen en el sheet de Posberry (columna <em>nombre_posberry</em>).</Paso>
        <Paso n={2}>Para cada uno elegís el producto equivalente en el sistema desde el selector.</Paso>
        <Paso n={3}>Guardás. A partir de ahí la conciliación puede cruzar los datos correctamente.</Paso>
        <Alerta>Si en la conciliación aparece "sin mapear" en la columna Sistema, el producto de Posberry todavía no tiene mapeo. Crealo acá.</Alerta>
      </Bloque>

      <Bloque titulo="Ventas Posberry">
        <p>En <strong className="text-[#f0f0f0]">📈 Ventas Posberry</strong> ves la tabla completa del sheet BD sin filtros de local, incluyendo mayoristas.</p>
        <Paso n={1}>Tocá <strong className="text-[#f0f0f0]">Cargar datos</strong> para traer la información (puede tardar unos segundos según la cantidad de filas).</Paso>
        <Paso n={2}>Filtrá por fecha, cliente, producto o dirección usando los campos de búsqueda.</Paso>
        <Paso n={3}>Usá los chips <strong className="text-[#f0f0f0]">Todos / Sucursales / Mayoristas</strong> para segmentar la vista.</Paso>
        <p>Las tarjetas de resumen muestran el total de filas y el recuento de clientes distintos (por ID de cliente).</p>
      </Bloque>

      <Bloque titulo="Gestión de usuarios">
        <p>En <strong className="text-[#f0f0f0]">👥 Usuarios</strong> administrás todas las cuentas del sistema.</p>
        <Paso n={1}><strong className="text-[#f0f0f0]">Crear usuario:</strong> completá email, nombre, contraseña, rol y nombre de local (si aplica). El usuario ya puede ingresar de inmediato.</Paso>
        <Paso n={2}><strong className="text-[#f0f0f0]">Cambiar rol:</strong> usá el selector de la columna Rol.</Paso>
        <Paso n={3}><strong className="text-[#f0f0f0]">Resetear contraseña:</strong> tocá el botón 🔑 Contraseña en la fila del usuario, ingresá la nueva contraseña (mínimo 6 caracteres) y confirmá.</Paso>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-1">
          <p className="col-span-2 text-[#888] text-xs font-semibold uppercase tracking-wider">Roles disponibles</p>
          <div><span className="text-[#f0f0f0] font-medium">local</span> — hace pedidos desde su sucursal</div>
          <div><span className="text-[#f0f0f0] font-medium">deposito</span> — gestiona pedidos de depósito</div>
          <div><span className="text-[#f0f0f0] font-medium">fabrica</span> — gestiona pedidos de fábrica</div>
          <div><span className="text-[#f0f0f0] font-medium">admin</span> — acceso completo al sistema</div>
        </div>
        <Alerta>No podés cambiar tu propio rol. Si necesitás hacerlo, pedile a otro administrador.</Alerta>
      </Bloque>
    </>
  )
}
