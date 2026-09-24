// Estado visible de un pedido a proveedor y "qué sigue". Funciones puras: la
// base guarda dos ejes (estado_recepcion, estado_facturacion) y la pantalla
// muestra uno solo. Chequeo: `npx tsx lib/compras/_check_estado.ts`.

export type EstadoRecepcion = 'sin_enviar' | 'enviado' | 'parcial' | 'recibido' | 'cerrado_manual' | 'devuelto'
export type EstadoFacturacion = 'sin_facturar' | 'facturado'
export type EstadoVisible = 'sin_enviar' | 'enviado' | 'parcial' | 'recibido' | 'cerrado' | 'facturado' | 'devuelto'

export interface EstadoPedidoEntrada {
  estado_recepcion: EstadoRecepcion
  estado_facturacion: EstadoFacturacion
  enviado_en: string | null
  /** Líneas del pedido y cuántas tienen algo pendiente de llegar. */
  lineas: number
  lineasPendientes: number
  /** Desde F5/F6; hasta entonces siempre false. */
  hayDiferencias?: boolean
  hayDevolucion?: boolean
}

// TODO(config): compras_config 'pedidos.dias_demora' (decidido con el usuario el 24-09: 3 días).
export const DIAS_DEMORA = 3

const DIA_MS = 24 * 60 * 60 * 1000

/** Gana el primero que aplique: devuelto > facturado > cerrado > recibido > parcial > enviado > sin enviar. */
export function estadoVisible(p: Pick<EstadoPedidoEntrada, 'estado_recepcion' | 'estado_facturacion'>): EstadoVisible {
  if (p.estado_recepcion === 'devuelto') return 'devuelto'
  if (p.estado_facturacion === 'facturado') return 'facturado'
  if (p.estado_recepcion === 'cerrado_manual') return 'cerrado'
  return p.estado_recepcion
}

/** Texto chico debajo del badge cuando queda algo pendiente. */
export function subtextoEstado(p: EstadoPedidoEntrada): string | null {
  const partes: string[] = []
  const esperaMercaderia = p.estado_recepcion === 'enviado' || p.estado_recepcion === 'parcial'
  if (p.estado_facturacion === 'facturado' && esperaMercaderia) partes.push('falta recibir')
  if (p.hayDiferencias) partes.push('diferencias por resolver')
  if (p.hayDevolucion && p.estado_recepcion !== 'devuelto') partes.push('con devolución')
  return partes.length ? partes.join(' · ') : null
}

export function diasDesdeEnvio(enviadoEn: string | null, ahora: Date = new Date()): number | null {
  if (!enviadoEn) return null
  return Math.floor((ahora.getTime() - new Date(enviadoEn).getTime()) / DIA_MS)
}

/** Enviado (o parcial) hace DIAS_DEMORA días o más y todavía esperando mercadería. */
export function estaDemorado(p: Pick<EstadoPedidoEntrada, 'estado_recepcion' | 'enviado_en'>, ahora: Date = new Date()): boolean {
  if (p.estado_recepcion !== 'enviado' && p.estado_recepcion !== 'parcial') return false
  const dias = diasDesdeEnvio(p.enviado_en, ahora)
  return dias != null && dias >= DIAS_DEMORA
}

export type TipoAccion = 'enviar' | 'cargar_remito' | 'ninguna'

export interface ProximaAccion {
  tipo: TipoAccion
  titulo: string
  descripcion: string
  /** Texto del botón primario (null si no hay acción). */
  boton: string | null
}

function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`
}

export function proximaAccion(p: EstadoPedidoEntrada, ahora: Date = new Date()): ProximaAccion {
  const visible = estadoVisible(p)
  switch (visible) {
    case 'sin_enviar':
      return p.lineas === 0
        ? { tipo: 'ninguna', titulo: 'Agregá los ítems', descripcion: 'El pedido todavía no tiene ítems. Editalo para cargar qué le pedís al proveedor.', boton: null }
        : { tipo: 'enviar', titulo: 'Enviar al proveedor', descripcion: 'Generá el mensaje, mandalo por WhatsApp y marcá el pedido como enviado.', boton: 'Enviar al proveedor' }
    case 'enviado': {
      const dias = diasDesdeEnvio(p.enviado_en, ahora) ?? 0
      const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`
      return {
        tipo: 'cargar_remito',
        titulo: 'Esperando la mercadería',
        descripcion: `Se envió ${cuando}. Cuando llegue, cargá el remito.${estaDemorado(p, ahora) ? ' Ya pasaron varios días: conviene llamar al proveedor.' : ''}`,
        boton: 'Cargar remito',
      }
    }
    case 'parcial':
      return {
        tipo: 'cargar_remito',
        titulo: 'Llegó una parte',
        descripcion: p.lineasPendientes > 0
          ? `Faltan ${plural(p.lineasPendientes, 'línea', 'líneas')} por llegar. Cargá el próximo remito o, si no va a llegar, cerrá el pedido a mano.`
          : 'Cargá el próximo remito o, si no va a llegar nada más, cerrá el pedido a mano.',
        boton: 'Cargar remito',
      }
    case 'recibido':
      return { tipo: 'ninguna', titulo: 'Llegó todo', descripcion: 'Se recibió todo lo pedido.', boton: null }
    case 'cerrado':
      return { tipo: 'ninguna', titulo: 'Cerrado a mano', descripcion: 'Este pedido ya no espera mercadería. Si fue un error, reabrilo.', boton: null }
    case 'facturado':
      return { tipo: 'ninguna', titulo: 'Facturado', descripcion: 'El pedido tiene su factura cargada.', boton: null }
    case 'devuelto':
      return { tipo: 'ninguna', titulo: 'Devuelto', descripcion: 'La mercadería se devolvió al proveedor.', boton: null }
  }
}

export type FiltroPedidos = 'activos' | 'por_facturar' | 'facturados' | 'devueltos' | 'todos'

/** A qué pestaña de la lista pertenece un pedido (además de "Todos"). */
export function filtroDelPedido(p: Pick<EstadoPedidoEntrada, 'estado_recepcion' | 'estado_facturacion'> & { recibioAlgo: boolean }): FiltroPedidos | null {
  const visible = estadoVisible(p)
  if (visible === 'sin_enviar' || visible === 'enviado' || visible === 'parcial') return 'activos'
  if (visible === 'facturado') return 'facturados'
  if (visible === 'devuelto') return 'devueltos'
  if (visible === 'recibido') return 'por_facturar'
  // Cerrado a mano: se factura solo si llegó algo (un "enviado por error" no).
  if (visible === 'cerrado' && p.recibioAlgo) return 'por_facturar'
  return null
}
