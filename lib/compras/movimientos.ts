// Tipos de movimiento del ledger de stock (compras_stock_movimientos.tipo) y
// cómo se agrupan en los reportes. Cada tipo nuevo tiene que sumarse acá: el
// `switch` de grupoMovimiento no compila si falta uno (antes un `else → ajustes`
// hacía que el reporte mintiera sin avisar).

export const TIPOS_MOVIMIENTO = [
  'entrada_remito',
  'salida_remito_anulado',
  'ajuste_manual',
  'conteo_fabrica',
  'ajuste_conteo',
  'ajuste_factura',
  'devolucion_proveedor',
  'apertura',
  'reversion',
] as const

export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

export function esTipoMovimiento(v: string | null | undefined): v is TipoMovimiento {
  return (TIPOS_MOVIMIENTO as readonly string[]).includes(v ?? '')
}

export const TIPO_MOVIMIENTO_LABEL: Record<TipoMovimiento, string> = {
  entrada_remito: 'Entrada por remito',
  salida_remito_anulado: 'Corrección de remito',
  ajuste_manual: 'Ajuste manual',
  conteo_fabrica: 'Conteo de fábrica',
  ajuste_conteo: 'Ajuste por conteo',
  ajuste_factura: 'Ajuste por factura',
  devolucion_proveedor: 'Devolución al proveedor',
  apertura: 'Saldo inicial',
  reversion: 'Reversión',
}

/** Tipos que se pueden revertir desde la ficha del insumo (igual que compras_revertir_movimiento). */
export const TIPOS_REVERTIBLES: readonly TipoMovimiento[] = ['ajuste_manual', 'ajuste_conteo', 'ajuste_factura']

export type GrupoMovimiento = 'entradas' | 'conteosFabrica' | 'ajustes' | 'devoluciones' | 'apertura'

export const GRUPO_MOVIMIENTO_LABEL: Record<GrupoMovimiento, string> = {
  entradas: 'Entradas (remito)',
  conteosFabrica: 'Conteos de fábrica',
  ajustes: 'Ajustes',
  devoluciones: 'Devoluciones',
  apertura: 'Saldo inicial',
}

export function grupoMovimiento(tipo: TipoMovimiento): GrupoMovimiento {
  switch (tipo) {
    case 'entrada_remito':
    case 'salida_remito_anulado':
      return 'entradas'
    case 'conteo_fabrica':
    case 'ajuste_conteo':
      return 'conteosFabrica'
    case 'ajuste_manual':
    case 'ajuste_factura':
    case 'reversion':
      return 'ajustes'
    case 'devolucion_proveedor':
      return 'devoluciones'
    case 'apertura':
      return 'apertura'
    default: {
      const noContemplado: never = tipo
      throw new Error(`Tipo de movimiento sin grupo: ${noContemplado}`)
    }
  }
}
