// Los roles son dinámicos (ver tabla `roles`); local/deposito/fabrica/admin
// son valores conocidos con rutas propias, pero puede haber roles custom.
export type Rol = string
export type TipoProducto = 'producto' | 'insumo'
export type DestinoProducto = 'fabrica' | 'deposito'
export type EstadoPedido = 'pendiente' | 'preparando' | 'enviado' | 'recibido' | 'cancelado'
/** pedido = lo pidió el local; despacho = lo agregó quien despacha; recepcion = llegó sin pedirse. */
export type OrigenItemPedido = 'pedido' | 'despacho' | 'recepcion'
export type TipoEventoPedido =
  | 'creado' | 'preparando' | 'editado' | 'enviado' | 'recibido'
  | 'recibido_con_diferencias' | 'cancelado' | 'cierre_automatico'
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
  estado: 'activo' | 'eliminado'
  created_at: string
}

export type ColaboraTipo = 'area' | 'persona'

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
  colabora_tipo: ColaboraTipo | null
  colabora_area: string | null
  colabora_persona_id: string | null
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

export interface InformeActividad {
  id: string
  titulo: string
  detalle: string | null
  hora_inicio: string | null
  hora_fin: string | null
}

export interface InformeDiario {
  id: string
  autor_id: string
  destinatarios: string[]
  fecha: string
  tareas_completadas: { id: string; titulo: string }[]
  comentario: string | null
  horario_inicio: string | null
  horario_fin: string | null
  actividades: InformeActividad[]
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
  presentacion_id: string | null
  sabor_id: string | null
  tamanio_id: string | null
  /** Clave de lib/pedidos/categorias.ts; null = automático según nombre y categoría. */
  icono: string | null
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
  preparando_at?: string | null
  cancelado_at?: string | null
  cancelado_por?: string | null
  motivo_cancelacion?: string | null
  recepcion_con_diferencias?: boolean
  nota_recepcion?: string | null
  /** Pedido anterior al corte de versión (D6/D13): sus datos pueden no ser confiables. */
  version_anterior?: boolean
  /** Enviado viejo que la migración cerró como recibido. */
  cierre_automatico?: boolean
  pedido_items?: PedidoItem[]
  pedido_mensajes?: PedidoMensaje[]
  pedido_eventos?: PedidoEvento[]
}

export interface PedidoItem {
  id: string
  pedido_id: string
  producto_id: string
  producto_nombre: string
  /** Lo pedido. 0 en los productos que agregó el despacho o que llegaron sin pedirse. */
  cantidad: number
  /** Lo que se mandó. null = igual a lo pedido. */
  cantidad_enviada?: number | null
  cantidad_recibida: number | null
  valor_total: number | null
  origen?: OrigenItemPedido
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
  /** Lo completa la base (trigger); null en los mensajes viejos. */
  autor_id?: string | null
  autor_rol: string
  autor_nombre: string
  texto: string
  created_at: string
}

export interface PedidoEvento {
  id: string
  pedido_id: string
  tipo: TipoEventoPedido
  /** editado: {cambios: [{tipo, producto_nombre, antes, despues}]};
   *  recibido*: {diferencias: [{producto_nombre, enviada, recibida}], nota};
   *  cancelado / cierre_automatico: {motivo}. */
  detalle: Record<string, unknown>
  autor_id: string | null
  autor_nombre: string | null
  autor_rol: string | null
  created_at: string
}

export interface CarritoItem {
  producto: Producto
  cantidad: number
}
