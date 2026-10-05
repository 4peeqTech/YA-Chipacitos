// Diferencias entre lo facturado y lo recibido (F5, FA9). Funciones puras: la
// base guarda una fila por insumo que no coincide (compras_factura_discrepancias)
// y la pantalla la agrupa según si ya se puede resolver.
// Chequeo: `npx tsx lib/compras/_check_diferencias.ts`.

import type { Database } from '@/lib/database.types'

export type DiferenciaFila = Database['public']['Views']['v_compras_factura_diferencias']['Row']

export type Resolucion = 'pendiente' | 'ajusta_stock' | 'reclamo_proveedor' | 'ignorada'
export type ResolucionElegible = Exclude<Resolucion, 'pendiente'>

const RESOLUCIONES: Resolucion[] = ['pendiente', 'ajusta_stock', 'reclamo_proveedor', 'ignorada']

export function aResolucion(v: string | null): Resolucion {
  return (RESOLUCIONES as (string | null)[]).includes(v) ? (v as Resolucion) : 'pendiente'
}

/** Una diferencia con los null de la vista ya resueltos. */
export interface DiferenciaVista {
  id: string
  facturaId: string
  pedidoId: string
  itemId: string
  descripcion: string
  unidad: string | null
  recibida: number
  facturada: number
  /** Facturada − recibida: positivo = la factura dice más de lo que llegó. */
  diferencia: number
  resolucion: Resolucion
  nota: string | null
  resueltoEn: string | null
  resueltoPor: string | null
}

export function armarDiferencias(filas: DiferenciaFila[]): DiferenciaVista[] {
  const res: DiferenciaVista[] = []
  for (const f of filas) {
    if (!f.id || !f.factura_id || !f.pedido_id || !f.item_id) continue
    const recibida = f.cantidad_recibida ?? 0
    const facturada = f.cantidad_facturada ?? 0
    res.push({
      id: f.id,
      facturaId: f.factura_id,
      pedidoId: f.pedido_id,
      itemId: f.item_id,
      descripcion: f.descripcion ?? 'Insumo',
      unidad: f.unidad,
      recibida,
      facturada,
      diferencia: f.diferencia ?? facturada - recibida,
      resolucion: aResolucion(f.resolucion),
      nota: f.nota,
      resueltoEn: f.resuelto_en,
      resueltoPor: f.resuelto_por_nombre,
    })
  }
  return res.sort((a, b) => a.descripcion.localeCompare(b.descripcion))
}

/**
 * Se resuelven solo con la recepción completa: mientras falte mercadería, lo
 * facturado de más es justamente lo que todavía tiene que llegar.
 */
export function recepcionCompleta(estadoRecepcion: string | null): boolean {
  return estadoRecepcion === 'recibido' || estadoRecepcion === 'cerrado_manual' || estadoRecepcion === 'devuelto'
}

export interface GruposDiferencias {
  /** Recepción incompleta: tono neutro, sin acciones. */
  pendientesDeLlegar: DiferenciaVista[]
  /** Recepción completa y sin resolver. */
  aResolver: DiferenciaVista[]
  resueltas: DiferenciaVista[]
}

export function agruparDiferencias(difs: DiferenciaVista[], estadoRecepcion: string | null): GruposDiferencias {
  const completa = recepcionCompleta(estadoRecepcion)
  const pendientes = difs.filter(d => d.resolucion === 'pendiente')
  return {
    pendientesDeLlegar: completa ? [] : pendientes,
    aResolver: completa ? pendientes : [],
    resueltas: difs.filter(d => d.resolucion !== 'pendiente'),
  }
}

/** Cuántas diferencias esperan una decisión (lo que muestra el badge y el filtro). */
export function cantidadAResolver(pendientes: number, estadoRecepcion: string | null): number {
  return recepcionCompleta(estadoRecepcion) ? pendientes : 0
}

function numero(n: number): string {
  return Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function conUnidad(n: number, unidad: string | null): string {
  return unidad ? `${numero(n)} ${unidad}` : numero(n)
}

/** "La factura dice 2 Bolsa más de lo que llegó" / "Llegaron 2 Bolsa que no están en la factura". */
export function textoDiferencia(d: Pick<DiferenciaVista, 'diferencia' | 'facturada' | 'unidad'>): string {
  if (d.diferencia > 0) return `La factura dice ${conUnidad(d.diferencia, d.unidad)} más de lo que llegó`
  if (d.facturada === 0) return `Llegó ${conUnidad(-d.diferencia, d.unidad)} que no está en la factura`
  return `Llegó ${conUnidad(-d.diferencia, d.unidad)} más de lo que dice la factura`
}

/** "+2" / "−2": el cambio de stock que haría "Ajustar stock". */
export function textoDelta(delta: number): string {
  if (delta === 0) return '0'
  return `${delta > 0 ? '+' : '−'}${numero(delta)}`
}

export const RESOLUCION_LABEL: Record<ResolucionElegible, string> = {
  ajusta_stock: 'Ajustar stock',
  reclamo_proveedor: 'Reclamo al proveedor',
  ignorada: 'Dejarla como está',
}

/** Para el historial del pedido. */
export const RESOLUCION_PASADO: Record<Resolucion, string> = {
  ajusta_stock: 'se ajustó el stock',
  reclamo_proveedor: 'se le reclamó al proveedor',
  ignorada: 'se dejó como está',
  pendiente: 'quedó pendiente',
}

/** Cómo quedó, en pasado, para las resueltas y el historial del pedido. */
export function textoResuelta(resolucion: Resolucion, diferencia: number, unidad: string | null): string {
  switch (resolucion) {
    case 'ajusta_stock': return `Se ajustó el stock (${textoDelta(diferencia)}${unidad ? ` ${unidad}` : ''})`
    case 'reclamo_proveedor': return 'Se le reclamó al proveedor'
    case 'ignorada': return 'Se dejó como está'
    case 'pendiente': return 'Pendiente'
  }
}

/** Qué pasa si se elige cada opción, con los números de esta diferencia. */
export function explicacionResolucion(
  r: ResolucionElegible,
  d: Pick<DiferenciaVista, 'diferencia' | 'unidad' | 'descripcion'>,
  stockActual: number | null,
): string {
  switch (r) {
    case 'ajusta_stock': {
      const queda = stockActual == null ? null : stockActual + d.diferencia
      const verbo = d.diferencia > 0 ? 'Suma' : 'Resta'
      return `${verbo} ${conUnidad(d.diferencia, d.unidad)} de ${d.descripcion} al stock${queda == null ? '' : ` (queda en ${numero(queda)})`}. Elegilo si lo que vale es la factura: el remito se cargó mal o no se cargó.`
    }
    case 'reclamo_proveedor':
      return 'El stock no se mueve. Queda anotado que le reclamaste al proveedor, para seguirlo.'
    case 'ignorada':
      return 'El stock no se mueve. Elegilo si la diferencia no importa (por ejemplo, un redondeo del proveedor).'
  }
}
