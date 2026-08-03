export interface ItemMensaje {
  descripcion: string
  unidad: string | null
  cantidad: number
}

interface DatosLocal {
  suc: string
  cuit: string
  direccion: string
}

// Datos reales de facturación/entrega — copiados de la config del HTML legacy
// (Ya!ModuloCompra). Solo existen estos dos locales hoy.
export const LOCALES: Record<string, DatosLocal> = {
  paraguay: { suc: 'SUC. PARAGUAY', cuit: '33-71770212-9', direccion: 'PARAGUAY 388' },
  lagrana: { suc: 'SUC. GDOR. LAGRAÑA', cuit: '33-71770212-9', direccion: 'GDOR. LAGRAÑA 388' },
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function formatearCantidad(cantidad: number): string {
  return cantidad % 1 === 0 ? String(Math.floor(cantidad)) : String(cantidad)
}

function formatearLineaItem(item: ItemMensaje): string {
  const unidad = item.unidad ? ` ${item.unidad}` : ''
  return `   — ${formatearCantidad(item.cantidad)}${unidad} ${item.descripcion}`.toUpperCase()
}

export function construirMensajePedido(proveedorNombre: string, local: string | null, items: ItemMensaje[]): string {
  const hoy = new Date()
  const fecha = `${hoy.getDate()}/${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const dia = DIAS_SEMANA[hoy.getDay()]

  const cuerpo = items.map(formatearLineaItem).join('\n')
  const datosLocal = local ? LOCALES[local] : undefined

  const entrega = datosLocal ? `\n\n📍 *Entrega:* ${datosLocal.direccion}` : ''
  const facturacion = datosLocal
    ? `\n\n· · · · · · · · · · ·\n🏷 *Datos de facturación*\n${datosLocal.suc}\nYA ! CHIPACITOS\nCUIT: ${datosLocal.cuit}`
    : ''

  return `🧾 *PEDIDO ${proveedorNombre.toUpperCase()}* — ${dia} ${fecha}${entrega}\n\n*Detalle del pedido:*\n${cuerpo}${facturacion}`
}

export function linkWhatsApp(telefono: string | null, mensaje: string): string {
  const texto = encodeURIComponent(mensaje)
  const numero = telefono ? telefono.replace(/[^\d]/g, '') : ''
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://api.whatsapp.com/send?text=${texto}`
}
