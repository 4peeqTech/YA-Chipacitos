export type Rol = 'local' | 'deposito' | 'fabrica' | 'admin'
export type TipoProducto = 'producto' | 'insumo'
export type DestinoProducto = 'fabrica' | 'deposito'
export type EstadoPedido = 'pendiente' | 'preparando' | 'enviado' | 'recibido'

export interface Profile {
  id: string
  nombre: string
  rol: Rol
  local_nombre: string | null
  created_at: string
}

export interface Producto {
  id: string
  nombre: string
  descripcion: string | null
  unidad: string
  tipo: TipoProducto
  destino: DestinoProducto
  activo: boolean
  created_at: string
}

export interface Pedido {
  id: string
  numero: number
  local_id: string
  local_nombre: string
  destino: DestinoProducto
  estado: EstadoPedido
  notas: string | null
  grupo_id: string | null
  created_at: string
  enviado_at: string | null
  recibido_at: string | null
  pedido_items?: PedidoItem[]
  pedido_mensajes?: PedidoMensaje[]
}

export interface PedidoItem {
  id: string
  pedido_id: string
  producto_id: string
  producto_nombre: string
  cantidad: number
  created_at: string
}

export interface VentaPosberry {
  id: string
  local_id: string
  local_nombre: string | null
  fecha: string
  producto_nombre: string
  cantidad: number
  importe: number | null
  archivo_origen: string | null
  created_at: string
}

export interface Conciliacion {
  id: string
  fecha: string
  local_id: string
  producto_nombre: string
  vendido: number
  pedido: number
  diferencia: number
  tiene_alerta: boolean
  confirmado: boolean
  confirmado_at: string | null
  confirmado_por: string | null
  created_at: string
}

export interface ProductoMapeo {
  id: string
  nombre_posberry: string
  producto_id: string | null
  created_at: string
  productos?: { nombre: string; tipo: string; destino: string } | null
}

export interface PedidoMensaje {
  id: string
  pedido_id: string
  autor_rol: string
  autor_nombre: string
  texto: string
  created_at: string
}

export interface CarritoItem {
  producto: Producto
  cantidad: number
}
