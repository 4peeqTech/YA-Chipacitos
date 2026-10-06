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
  /**
   * La factura tiene diferencias con lo recibido que ya se pueden resolver
   * (recepción completa). Mientras falta mercadería no cuentan: son lo que
   * todavía tiene que llegar.
   */
  hayDiferencias?: boolean
  /** Tiene al menos una devolución activa (B4). */
  hayDevolucion?: boolean
  /** B4: la primera devolución activa que espera su nota de crédito (sin reposición, sin NC, con factura). */
  devolucionEsperaNc?: { id: string; codigo: string } | null
  /** Llegó algo: define si un pedido cerrado a mano todavía espera su factura. */
  recibioAlgo?: boolean
  /** Quien mira puede cargar facturas (solo admin). Si no, no se le ofrece. */
  puedeFacturar?: boolean
  /** Ya hay una factura en borrador de este pedido. */
  facturaEnBorrador?: boolean
}

const RECEPCION: EstadoRecepcion[] = ['sin_enviar', 'enviado', 'parcial', 'recibido', 'cerrado_manual', 'devuelto']

/** Las columnas llegan como text desde los tipos generados: se normalizan acá. */
export function aEstadoRecepcion(v: string): EstadoRecepcion {
  return (RECEPCION as string[]).includes(v) ? (v as EstadoRecepcion) : 'enviado'
}

export function aEstadoFacturacion(v: string): EstadoFacturacion {
  return v === 'facturado' ? 'facturado' : 'sin_facturar'
}

/** Los 7 estados visibles en el orden del flujo (gráficos y conteos). */
export const ESTADOS_VISIBLES: EstadoVisible[] = ['sin_enviar', 'enviado', 'parcial', 'recibido', 'cerrado', 'facturado', 'devuelto']

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
  // La NC es plata: solo se le avisa a quien puede cargarla (admin).
  if (p.devolucionEsperaNc && p.puedeFacturar) partes.push('esperando nota de crédito')
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

export type TipoAccion = 'enviar' | 'cargar_remito' | 'cargar_factura' | 'resolver_diferencias' | 'cargar_nota_credito' | 'ninguna'

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
      return p.puedeFacturar
        ? {
          tipo: 'cargar_factura',
          titulo: 'Llegó todo',
          descripcion: p.facturaEnBorrador
            ? 'Se recibió todo lo pedido y la factura quedó en borrador. Terminala y confirmala.'
            : 'Se recibió todo lo pedido. Cuando llegue la factura del proveedor, cargala.',
          boton: p.facturaEnBorrador ? 'Seguir con la factura' : 'Cargar factura',
        }
        : { tipo: 'ninguna', titulo: 'Llegó todo', descripcion: 'Se recibió todo lo pedido.', boton: null }
    case 'cerrado':
      return p.puedeFacturar && p.recibioAlgo
        ? {
          tipo: 'cargar_factura',
          titulo: 'Cerrado a mano',
          descripcion: 'Ya no espera más mercadería, pero llegó parte: falta cargar su factura.',
          boton: p.facturaEnBorrador ? 'Seguir con la factura' : 'Cargar factura',
        }
        : { tipo: 'ninguna', titulo: 'Cerrado a mano', descripcion: 'Este pedido ya no espera mercadería. Si fue un error, reabrilo.', boton: null }
    case 'facturado': {
      // FA2: se facturó antes de que llegara la mercadería.
      const esperando = p.estado_recepcion === 'enviado' || p.estado_recepcion === 'parcial'
      return esperando
        ? {
          tipo: 'cargar_remito',
          titulo: 'Facturado, falta recibir',
          descripcion: 'La factura ya está cargada. Cuando llegue la mercadería, cargá el remito.',
          boton: 'Cargar remito',
        }
        : p.hayDiferencias && p.puedeFacturar
          ? {
            tipo: 'resolver_diferencias',
            titulo: 'Hay diferencias con lo recibido',
            descripcion: 'La factura no coincide con lo que llegó en los remitos. Revisá cada línea y decidí si ajustás el stock, le reclamás al proveedor o la dejás como está.',
            boton: 'Resolver diferencias',
          }
          : p.devolucionEsperaNc && p.puedeFacturar
            ? {
              tipo: 'cargar_nota_credito',
              titulo: 'Falta la nota de crédito',
              descripcion: `Se devolvió mercadería de este pedido (${p.devolucionEsperaNc.codigo}) y el proveedor todavía no mandó la nota de crédito.`,
              boton: 'Cargar nota de crédito',
            }
            : { tipo: 'ninguna', titulo: 'Facturado', descripcion: 'El pedido tiene su factura cargada.', boton: null }
    }
    case 'devuelto': {
      const faltaNc = !!p.devolucionEsperaNc && !!p.puedeFacturar
      return {
        tipo: faltaNc ? 'cargar_nota_credito' : 'ninguna',
        titulo: 'Devuelto',
        descripcion: `Se devolvió todo lo que llegó y el proveedor no repone.${faltaNc ? ' Falta cargar la nota de crédito.' : ''}`,
        boton: faltaNc ? 'Cargar nota de crédito' : null,
      }
    }
  }
}

/**
 * Todavía necesita algo del proveedor: envío, mercadería o factura. Devuelto nunca.
 * Es la regla de "no se archiva un proveedor con pedidos abiertos" (B3): la
 * replica _compras_pedidos_abiertos_de en SQL, con los mismos casos.
 */
export function pedidoAbierto(p: Pick<EstadoPedidoEntrada, 'estado_recepcion' | 'estado_facturacion'> & { recibioAlgo: boolean }): boolean {
  const r = p.estado_recepcion
  if (r === 'sin_enviar' || r === 'enviado' || r === 'parcial') return true
  if (p.estado_facturacion === 'facturado') return false
  if (r === 'recibido') return true
  return r === 'cerrado_manual' && p.recibioAlgo
}

// 'cerrados' (todos los cerrados a mano, también los que están por facturar) y
// 'eliminados' (registro aparte) no salen de filtroDelPedido: los arma la lista.
export type FiltroPedidos = 'activos' | 'por_facturar' | 'facturados' | 'devueltos' | 'cerrados' | 'todos' | 'eliminados'

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
