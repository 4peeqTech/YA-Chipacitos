// Mensaje de facturación para la administración (B2), armado con una plantilla
// de tipo `factura` de compras_plantillas_mensaje. Misma sintaxis {{variable}}
// que la del pedido; una variable que no existe queda vacía.
// Chequeo: `npx tsx lib/compras/_check_comprobante.ts`.

import {
  Building2, Calculator, CalendarClock, CalendarDays, Hash, ListOrdered, Package, PackageCheck, Percent,
  Receipt, Truck, Wallet, type LucideIcon,
} from 'lucide-react'
import { formatearMonedaExacta } from '@/lib/formato'
import { fechaNumerica, textoEstadoPago, type DatosComprobante, type LineaComprobante } from './comprobanteFactura'
import { interpolar } from './pedidoMensaje'
import { etiquetaAlicuota } from './totalesFactura'

/** Idéntico al seed "Factura estándar" de 20261005170000 (lo compara el chequeo). */
export const CUERPO_FACTURA_FALLBACK =
  '🧾 *FACTURA {{numero_factura}}* · {{proveedor}}\n📅 {{fecha}} · Vence: {{vencimiento}}\n📦 Pedido {{pedido}}{{facturado_a}}\n\n*Detalle:*\n{{detalle}}\n\nSubtotal: {{subtotal}}{{iva_detalle}}\n*TOTAL: {{total}}*'

function formatearCantidad(cantidad: number): string {
  return cantidad % 1 === 0 ? String(Math.floor(cantidad)) : String(cantidad).replace('.', ',')
}

function lineaDetalle(l: LineaComprobante): string {
  const unidad = l.unidad ? ` ${l.unidad}` : ''
  // A2b: en una línea por kg, los kg entre paréntesis: "2 CAJA (33,4 KG)".
  const kg = l.precioPor === 'base' && l.cantidadBase != null ? ` (${formatearCantidad(l.cantidadBase)} ${l.unidadBase ?? 'kg'})` : ''
  return `   — ${formatearCantidad(l.cantidad)}${unidad}${kg} ${l.descripcion}`.toUpperCase() + `: ${formatearMonedaExacta(l.subtotal)}`
}

export function renderPlantillaFactura(cuerpo: string, d: DatosComprobante): string {
  const vars: Record<string, string> = {
    numero_factura: d.numero,
    proveedor: d.proveedor.nombre.toUpperCase(),
    fecha: fechaNumerica(d.fecha),
    vencimiento: d.vencimiento ? fechaNumerica(d.vencimiento) : 'sin vencimiento',
    pedido: d.pedido,
    remitos: d.remitos.length ? d.remitos.join(', ') : 'sin remitos',
    detalle: d.lineas.length ? d.lineas.map(lineaDetalle).join('\n') : '   — (sin detalle)',
    subtotal: formatearMonedaExacta(d.subtotal),
    iva: formatearMonedaExacta(d.iva),
    iva_detalle: d.iva === 0
      ? ''
      : d.porAlicuota.map(g => `\nIVA ${etiquetaAlicuota(g.alicuota)}: ${formatearMonedaExacta(g.iva)}`).join(''),
    total: formatearMonedaExacta(d.total),
    facturado_a: d.facturadoA ? `\n🏷 Facturado a: ${d.facturadoA.razonSocial} · CUIT ${d.facturadoA.cuit}` : '',
    estado_pago: textoEstadoPago(d.estadoPago) ?? '',
  }
  return interpolar(cuerpo, vars)
}

export const VARIABLES_FACTURA: { key: string; label: string; desc: string; icon: LucideIcon }[] = [
  { key: 'numero_factura', label: 'N° de factura', desc: 'El número impreso del proveedor', icon: Hash },
  { key: 'proveedor', label: 'Proveedor', desc: 'Nombre en mayúsculas', icon: Truck },
  { key: 'fecha', label: 'Fecha', desc: 'Fecha de la factura', icon: CalendarDays },
  { key: 'vencimiento', label: 'Vencimiento', desc: 'Fecha, o "sin vencimiento"', icon: CalendarClock },
  { key: 'pedido', label: 'Pedido', desc: 'Código del pedido (P-0016)', icon: Package },
  { key: 'remitos', label: 'Remitos', desc: 'Códigos separados por coma', icon: PackageCheck },
  { key: 'detalle', label: 'Detalle', desc: 'Una línea por ítem, con su subtotal', icon: ListOrdered },
  { key: 'subtotal', label: 'Subtotal', desc: 'Sin IVA', icon: Calculator },
  { key: 'iva', label: 'IVA', desc: 'Monto total de IVA', icon: Percent },
  { key: 'iva_detalle', label: 'IVA por alícuota', desc: 'Un renglón por alícuota; vacío si no suma IVA', icon: Percent },
  { key: 'total', label: 'Total', desc: 'Total de la factura', icon: Receipt },
  { key: 'facturado_a', label: 'Facturado a', desc: 'Razón social y CUIT del local; vacío si no tiene', icon: Building2 },
  { key: 'estado_pago', label: 'Estado de pago', desc: 'Del gasto: pendiente, pagado o en parte', icon: Wallet },
]

export const EJEMPLO_FACTURA: DatosComprobante = {
  facturaId: 'ejemplo',
  numero: '0001-00001234',
  proveedor: { nombre: 'Distribuidora Ejemplo', cuit: '30-71234567-8' },
  fecha: '2026-10-05',
  vencimiento: '2026-10-20',
  pedido: 'P-0042',
  remitos: ['R-0042-01'],
  facturadoA: { razonSocial: 'Chipacitos SRL', cuit: '30-70000000-1', sucursal: 'Paraguay' },
  lineas: [
    { descripcion: 'Queso barra', cantidad: 2, unidad: 'caja', precioUnitario: 60000, alicuota: 21, subtotal: 120000, cantidadBase: null, precioPor: 'unidad', unidadBase: null },
    { descripcion: 'Harina 000', cantidad: 10, unidad: 'bolsa', precioUnitario: 8000, alicuota: 21, subtotal: 80000, cantidadBase: null, precioPor: 'unidad', unidadBase: null },
    { descripcion: 'Flete', cantidad: 1, unidad: null, precioUnitario: 5000, alicuota: 0, subtotal: 5000, cantidadBase: null, precioPor: 'unidad', unidadBase: null },
  ],
  subtotal: 205000,
  iva: 42000,
  total: 247000,
  porAlicuota: [{ alicuota: 21, base: 200000, iva: 42000 }],
  estadoPago: 'Pendiente de pago',
  confirmada: { en: '2026-10-05T17:10:00Z', por: 'Marcos' },
  generado: { en: '2026-10-05T17:32:00Z', por: 'Marcos' },
}
