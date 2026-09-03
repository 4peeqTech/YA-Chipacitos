export interface ItemMensaje {
  descripcion: string
  unidad: string | null
  cantidad: number
}

// Espeja una fila de `locales_facturacion`. El módulo ya no resuelve slugs:
// los callers cargan la fila y se la pasan hecha.
export interface DatosLocal {
  sucursal: string
  razon_social: string
  cuit: string
  direccion: string
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// Los dos bloques son plantillas en sí mismas: se interpolan con el mismo
// helper que el cuerpo, así el token compuesto ({{entrega}}/{{facturacion}})
// y su versión "expandida" en el editor rinden idéntico por construcción.
export const BLOQUE_ENTREGA = '\n\n📍 *Entrega:* {{local_direccion}}'
export const BLOQUE_FACTURACION =
  '\n\n· · · · · · · · · · ·\n🏷 *Datos de facturación*\n{{local_suc}}\n{{razon_social}}\nCUIT: {{local_cuit}}'

// Cuerpo por default cuando no hay ninguna plantilla en compras_plantillas_mensaje
// (mismo formato que el seed de esa tabla).
const CUERPO_FALLBACK = '🧾 *PEDIDO {{proveedor}}* — {{dia}} {{fecha}}{{entrega}}\n\n*Detalle del pedido:*\n{{items}}{{facturacion}}'

function formatearCantidad(cantidad: number): string {
  return cantidad % 1 === 0 ? String(Math.floor(cantidad)) : String(cantidad)
}

function formatearLineaItem(item: ItemMensaje): string {
  const unidad = item.unidad ? ` ${item.unidad}` : ''
  return `   — ${formatearCantidad(item.cantidad)}${unidad} ${item.descripcion}`.toUpperCase()
}

function interpolar(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

export interface ContextoMensaje {
  proveedorNombre: string
  contactoNombre?: string | null
  local: DatosLocal | null
  items: ItemMensaje[]
}

// Variables soportadas por las plantillas (ver ABM en /admin/proveedores/plantillas):
// {{proveedor}} {{contacto}} {{items}} {{fecha}} {{dia}} {{entrega}} {{facturacion}}
// {{local_suc}} {{local_direccion}} {{local_cuit}} {{razon_social}}. Una variable no
// reconocida se deja vacía en vez de romper el mensaje.
export function renderPlantilla(cuerpo: string, ctx: ContextoMensaje): string {
  const hoy = new Date()
  const fecha = `${hoy.getDate()}/${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const dia = DIAS_SEMANA[hoy.getDay()]
  const local = ctx.local

  const vars: Record<string, string> = {
    proveedor: ctx.proveedorNombre.toUpperCase(),
    contacto: ctx.contactoNombre ?? '',
    items: ctx.items.map(formatearLineaItem).join('\n'),
    fecha,
    dia,
    local_suc: local?.sucursal ?? '',
    local_direccion: local?.direccion ?? '',
    local_cuit: local?.cuit ?? '',
    razon_social: local?.razon_social ?? '',
  }

  vars.entrega = local ? interpolar(BLOQUE_ENTREGA, vars) : ''
  vars.facturacion = local ? interpolar(BLOQUE_FACTURACION, vars) : ''

  return interpolar(cuerpo, vars)
}

export function construirMensajePedido(proveedorNombre: string, local: DatosLocal | null, items: ItemMensaje[]): string {
  return renderPlantilla(CUERPO_FALLBACK, { proveedorNombre, local, items })
}

export function linkWhatsApp(telefono: string | null, mensaje: string): string {
  const texto = encodeURIComponent(mensaje)
  const numero = telefono ? telefono.replace(/[^\d]/g, '') : ''
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://api.whatsapp.com/send?text=${texto}`
}
