export interface RemitoItem {
  id: string
  remito_id: string
  pedido_item_id: string | null
  item_id: string | null
  descripcion: string
  cantidad: number
  precio: number | null
}

export interface Remito {
  id: string
  pedido_id: string
  numero: string
  fecha: string
  created_at: string
  compras_remito_items: RemitoItem[]
}
