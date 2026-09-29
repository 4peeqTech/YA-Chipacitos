import { codigoPedido } from '@/lib/compras/codigos'
import {
  estadoVisible, estaDemorado, filtroDelPedido,
  type EstadoFacturacion, type EstadoPedidoEntrada, type EstadoRecepcion, type EstadoVisible, type FiltroPedidos,
} from '@/lib/compras/estadoPedido'
import { armarDiferencias, recepcionCompleta, type DiferenciaFila, type DiferenciaVista } from '@/lib/compras/diferencias'
import type { EventoPedido, FacturaDePedido, LineaPendiente, PedidoFila } from './datos'

export type Origen = 'Pedido base' | 'Complementario' | 'Manual'

export interface PedidoVista {
  fila: PedidoFila
  codigo: string
  /** created_at (nullable en el esquema; siempre tiene default). */
  creado: string
  proveedor: string
  lineas: LineaPendiente[]
  eventos: EventoPedido[]
  entrada: EstadoPedidoEntrada
  visible: EstadoVisible
  filtro: FiltroPedidos | null
  /** Líneas que ya llegaron completas. */
  lineasCompletas: number
  /** Cuánto del pedido llegó, 0–100: promedio por línea de recibido/pedido, con tope 100 por línea. */
  porcentajeRecibido: number
  recibioAlgo: boolean
  origen: Origen
  demorado: boolean
  /** Se puede editar ítems (no facturado, no cerrado, no devuelto). */
  editable: boolean
  /** Su factura activa, si tiene y si quien mira puede verla (F4). */
  factura: FacturaDePedido | null
  /** Diferencias de su factura con lo recibido (F5, solo admin). */
  diferencias: DiferenciaVista[]
}

const RECEPCION: EstadoRecepcion[] = ['sin_enviar', 'enviado', 'parcial', 'recibido', 'cerrado_manual', 'devuelto']

function aRecepcion(v: string): EstadoRecepcion {
  return (RECEPCION as string[]).includes(v) ? (v as EstadoRecepcion) : 'enviado'
}

function aFacturacion(v: string): EstadoFacturacion {
  return v === 'facturado' ? 'facturado' : 'sin_facturar'
}

function origenDe(fila: PedidoFila): Origen {
  if (!fila.solicitud_id) return 'Manual'
  return fila.compras_solicitudes?.tipo === 'base' ? 'Pedido base' : 'Complementario'
}

export function armarVistas(
  pedidos: PedidoFila[],
  lineas: LineaPendiente[],
  eventos: EventoPedido[],
  facturas: FacturaDePedido[] = [],
  puedeFacturar = false,
  ahora: Date = new Date(),
  diferencias: DiferenciaFila[] = [],
): PedidoVista[] {
  const facturaPorPedido = new Map(facturas.map(f => [f.pedido_id, f]))
  const diferenciasPorFactura = new Map<string, DiferenciaVista[]>()
  for (const d of armarDiferencias(diferencias)) {
    diferenciasPorFactura.set(d.facturaId, [...(diferenciasPorFactura.get(d.facturaId) ?? []), d])
  }
  const lineasPorPedido = new Map<string, LineaPendiente[]>()
  for (const l of lineas) {
    if (!l.pedido_id) continue
    const lista = lineasPorPedido.get(l.pedido_id) ?? []
    lista.push(l)
    lineasPorPedido.set(l.pedido_id, lista)
  }
  const eventosPorPedido = new Map<string, EventoPedido[]>()
  for (const e of eventos) {
    if (!e.pedido_id) continue
    const lista = eventosPorPedido.get(e.pedido_id) ?? []
    lista.push(e)
    eventosPorPedido.set(e.pedido_id, lista)
  }

  return pedidos.map(fila => {
    const propias = (lineasPorPedido.get(fila.id) ?? []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    const lineasPendientes = propias.filter(l => (l.pendiente ?? 0) > 0).length
    const recibioAlgo = propias.some(l => (l.recibido ?? 0) > 0) || fila.compras_remitos.length > 0
    const factura = facturaPorPedido.get(fila.id) ?? null
    // Solo las de la factura activa: las de una anulada ya no existen.
    const propiasDif = factura?.estado === 'confirmada' ? diferenciasPorFactura.get(factura.id) ?? [] : []
    const entrada: EstadoPedidoEntrada = {
      estado_recepcion: aRecepcion(fila.estado_recepcion),
      estado_facturacion: aFacturacion(fila.estado_facturacion),
      enviado_en: fila.enviado_en,
      lineas: propias.length,
      lineasPendientes,
      recibioAlgo,
      puedeFacturar,
      facturaEnBorrador: factura?.estado === 'borrador',
      hayDiferencias: recepcionCompleta(fila.estado_recepcion) && propiasDif.some(d => d.resolucion === 'pendiente'),
    }
    const visible = estadoVisible(entrada)
    return {
      fila,
      codigo: codigoPedido(fila.numero),
      creado: fila.created_at ?? '',
      proveedor: fila.proveedores?.nombre ?? '—',
      lineas: propias,
      eventos: eventosPorPedido.get(fila.id) ?? [],
      entrada,
      visible,
      filtro: filtroDelPedido({ ...entrada, recibioAlgo }),
      lineasCompletas: propias.length - lineasPendientes,
      porcentajeRecibido: porcentajeRecibido(propias),
      recibioAlgo,
      origen: origenDe(fila),
      demorado: estaDemorado(entrada, ahora),
      editable: entrada.estado_facturacion !== 'facturado'
        && entrada.estado_recepcion !== 'cerrado_manual'
        && entrada.estado_recepcion !== 'devuelto',
      factura,
      diferencias: propiasDif,
    }
  })
}

// Las líneas tienen unidades distintas (bolsas, kg, unidades): sumar cantidades
// no dice nada. Cada línea pesa lo mismo y lo de más no compensa lo que falta.
export function porcentajeRecibido(lineas: Pick<LineaPendiente, 'cantidad' | 'recibido'>[]): number {
  const validas = lineas.filter(l => (l.cantidad ?? 0) > 0)
  if (validas.length === 0) return 0
  const suma = validas.reduce((t, l) => t + Math.min((l.recibido ?? 0) / (l.cantidad ?? 1), 1), 0)
  return Math.round((suma / validas.length) * 100)
}

// La búsqueda encuentra por código ("P-0012", "p12", "12") o por proveedor.
export function coincideBusqueda(p: PedidoVista, busqueda: string): boolean {
  const texto = busqueda.trim().toLowerCase()
  if (!texto) return true
  if (p.proveedor.toLowerCase().includes(texto)) return true
  if (p.codigo.toLowerCase().includes(texto)) return true
  const digitos = texto.replace(/^p-?/, '')
  return /^\d+$/.test(digitos) && Number(digitos) === p.fila.numero
}

/** Formatea una cantidad con su unidad: "3 Bolsa 25 kg". */
export function conUnidad(cantidad: number | null, unidad: string | null): string {
  const n = (cantidad ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })
  return unidad ? `${n} ${unidad}` : n
}
