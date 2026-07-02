// Los roles son dinámicos (ver tabla `roles`); local/deposito/fabrica/admin
// son valores conocidos con rutas propias, pero puede haber roles custom.
export type Rol = string
export type TipoProducto = 'producto' | 'insumo'
export type DestinoProducto = 'fabrica' | 'deposito'
export type EstadoPedido = 'pendiente' | 'preparando' | 'enviado' | 'recibido'
export type PrioridadTarea = 'alta' | 'media' | 'baja'
export type EstadoTarea = 'pendiente' | 'en_progreso' | 'completada'
export type Turno = 'manana' | 'tarde'

export interface RoleDef {
  key: string
  nombre: string
  color: string
  es_sistema: boolean
  created_at: string
}

export interface Profile {
  id: string
  nombre: string
  rol: Rol
  local_nombre: string | null
  nombre_posberry: string | null
  whatsapp_phone: string | null
  whatsapp_apikey: string | null
  modulos_permitidos: string[]
  created_at: string
}

export interface Tarea {
  id: string
  titulo: string
  descripcion: string | null
  prioridad: PrioridadTarea
  estado: EstadoTarea
  fecha_limite: string | null
  turno: Turno
  asignado_a: string[]
  creado_por: string
  created_at: string
  updated_at: string
}

export interface TareaComentario {
  id: string
  tarea_id: string
  autor_id: string
  texto: string
  created_at: string
}

export interface TareaSubtarea {
  id: string
  tarea_id: string
  texto: string
  completada: boolean
  orden: number
  fecha: string | null
  turno: Turno
  created_at: string
}

export interface InformeDiario {
  id: string
  autor_id: string
  destinatarios: string[]
  fecha: string
  tareas_completadas: { id: string; titulo: string }[]
  comentario: string | null
  created_at: string
}

export interface TareaHistorial {
  id: string
  tarea_id: string
  campo: string
  valor_anterior: string | null
  valor_nuevo: string | null
  autor_id: string
  created_at: string
}

export interface TareaAdjunto {
  id: string
  tarea_id: string
  nombre: string
  storage_path: string
  size_bytes: number | null
  autor_id: string
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
  categoria: string | null
  precio: number | null
  codigo: number | null
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
  cantidad_recibida: number | null
  valor_total: number | null
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
  monto_vendido: number | null
  monto_remito: number | null
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
  ignorado: boolean
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
