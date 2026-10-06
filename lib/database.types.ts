export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cajas: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      compras_avisos_corridas: {
        Row: {
          corrida_en: string
          error: string | null
          id: string
          origen: string
          por: string | null
          resultado: Json
        }
        Insert: {
          corrida_en?: string
          error?: string | null
          id?: string
          origen: string
          por?: string | null
          resultado?: Json
        }
        Update: {
          corrida_en?: string
          error?: string | null
          id?: string
          origen?: string
          por?: string | null
          resultado?: Json
        }
        Relationships: [
          {
            foreignKeyName: "compras_avisos_corridas_por_fkey"
            columns: ["por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_avisos_enviados: {
        Row: {
          entidad_id: string
          enviado_en: string
          envios: number
          huella: string
          id: string
          pedido_id: string | null
          primer_aviso_en: string
          tipo: string
        }
        Insert: {
          entidad_id: string
          enviado_en?: string
          envios?: number
          huella?: string
          id?: string
          pedido_id?: string | null
          primer_aviso_en?: string
          tipo: string
        }
        Update: {
          entidad_id?: string
          enviado_en?: string
          envios?: number
          huella?: string
          id?: string
          pedido_id?: string | null
          primer_aviso_en?: string
          tipo?: string
        }
        Relationships: []
      }
      compras_categorias: {
        Row: {
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      compras_config: {
        Row: {
          clave: string
          descripcion: string | null
          updated_at: string
          valor: Json
        }
        Insert: {
          clave: string
          descripcion?: string | null
          updated_at?: string
          valor: Json
        }
        Update: {
          clave?: string
          descripcion?: string | null
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      compras_devolucion_items: {
        Row: {
          cantidad: number
          cantidad_base: number | null
          descripcion: string
          devolucion_id: string
          factura_item_id: string | null
          id: string
          item_id: string | null
          orden: number
          pedido_item_id: string | null
          precio_correcto: number | null
          unidad: string | null
        }
        Insert: {
          cantidad: number
          cantidad_base?: number | null
          descripcion: string
          devolucion_id: string
          factura_item_id?: string | null
          id?: string
          item_id?: string | null
          orden?: number
          pedido_item_id?: string | null
          precio_correcto?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_base?: number | null
          descripcion?: string
          devolucion_id?: string
          factura_item_id?: string | null
          id?: string
          item_id?: string | null
          orden?: number
          pedido_item_id?: string | null
          precio_correcto?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "compras_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["devolucion_id"]
          },
          {
            foreignKeyName: "compras_devolucion_items_factura_item_id_fkey"
            columns: ["factura_item_id"]
            isOneToOne: false
            referencedRelation: "compras_factura_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devolucion_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devolucion_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_devolucion_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devolucion_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "compras_pedido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devolucion_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_pedido_pendiente"
            referencedColumns: ["pedido_item_id"]
          },
        ]
      }
      compras_devolucion_motivos: {
        Row: {
          activo: boolean
          corrige_precio: boolean
          created_at: string
          devuelve_mercaderia: boolean
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          corrige_precio?: boolean
          created_at?: string
          devuelve_mercaderia?: boolean
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          corrige_precio?: boolean
          created_at?: string
          devuelve_mercaderia?: boolean
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      compras_devoluciones: {
        Row: {
          anulada_en: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          corrige_precio: boolean
          creado_por: string | null
          created_at: string
          devuelve_mercaderia: boolean
          estado: string
          factura_id: string | null
          id: string
          motivo_id: string
          motivo_nombre: string
          nota: string | null
          nota_credito_id: string | null
          pedido_id: string
          repone: boolean
          secuencia: number
        }
        Insert: {
          anulada_en?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          corrige_precio: boolean
          creado_por?: string | null
          created_at?: string
          devuelve_mercaderia: boolean
          estado?: string
          factura_id?: string | null
          id?: string
          motivo_id: string
          motivo_nombre: string
          nota?: string | null
          nota_credito_id?: string | null
          pedido_id: string
          repone: boolean
          secuencia: number
        }
        Update: {
          anulada_en?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          corrige_precio?: boolean
          creado_por?: string | null
          created_at?: string
          devuelve_mercaderia?: boolean
          estado?: string
          factura_id?: string | null
          id?: string
          motivo_id?: string
          motivo_nombre?: string
          nota?: string | null
          nota_credito_id?: string | null
          pedido_id?: string
          repone?: boolean
          secuencia?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_devoluciones_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_devoluciones_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "compras_devolucion_motivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_devoluciones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_factura_discrepancias: {
        Row: {
          cantidad_facturada: number
          cantidad_recibida: number
          clave: string
          created_at: string
          descripcion: string
          devolucion_id: string | null
          diferencia: number | null
          factura_id: string
          id: string
          item_id: string
          movimiento_id: string | null
          nota: string | null
          pedido_item_id: string | null
          resolucion: string
          resuelto_en: string | null
          resuelto_por: string | null
          unidad: string | null
          updated_at: string
        }
        Insert: {
          cantidad_facturada: number
          cantidad_recibida: number
          clave: string
          created_at?: string
          descripcion: string
          devolucion_id?: string | null
          diferencia?: number | null
          factura_id: string
          id?: string
          item_id: string
          movimiento_id?: string | null
          nota?: string | null
          pedido_item_id?: string | null
          resolucion?: string
          resuelto_en?: string | null
          resuelto_por?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          cantidad_facturada?: number
          cantidad_recibida?: number
          clave?: string
          created_at?: string
          descripcion?: string
          devolucion_id?: string | null
          diferencia?: number | null
          factura_id?: string
          id?: string
          item_id?: string
          movimiento_id?: string | null
          nota?: string | null
          pedido_item_id?: string | null
          resolucion?: string
          resuelto_en?: string | null
          resuelto_por?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_factura_discrepancias_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "compras_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["devolucion_id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "compras_pedido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_pedido_pendiente"
            referencedColumns: ["pedido_item_id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_factura_items: {
        Row: {
          alicuota_iva: number
          cantidad: number
          cantidad_base: number | null
          descripcion: string
          factura_id: string
          id: string
          item_id: string | null
          iva: number | null
          orden: number
          pedido_item_id: string | null
          precio_por: string
          precio_unitario: number
          subtotal: number | null
          unidad: string | null
        }
        Insert: {
          alicuota_iva?: number
          cantidad: number
          cantidad_base?: number | null
          descripcion: string
          factura_id: string
          id?: string
          item_id?: string | null
          iva?: number | null
          orden?: number
          pedido_item_id?: string | null
          precio_por?: string
          precio_unitario?: number
          subtotal?: number | null
          unidad?: string | null
        }
        Update: {
          alicuota_iva?: number
          cantidad?: number
          cantidad_base?: number | null
          descripcion?: string
          factura_id?: string
          id?: string
          item_id?: string | null
          iva?: number | null
          orden?: number
          pedido_item_id?: string | null
          precio_por?: string
          precio_unitario?: number
          subtotal?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_factura_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_factura_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_factura_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "compras_pedido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_pedido_pendiente"
            referencedColumns: ["pedido_item_id"]
          },
        ]
      }
      compras_facturas: {
        Row: {
          anulada_en: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          confirmada_en: string | null
          confirmada_por: string | null
          creado_por: string | null
          created_at: string
          estado: string
          factura_origen_id: string | null
          fecha: string
          fecha_vencimiento: string | null
          gasto_descontado: number | null
          gasto_forma_pago_anterior: string | null
          gasto_generado: boolean
          gasto_id: string | null
          id: string
          iva: number
          mercaderia_llego: boolean | null
          nc_gasto: string | null
          numero: string
          numero_normalizado: string | null
          observaciones: string | null
          pedido_id: string
          proveedor_id: string
          subtotal: number
          tipo_comprobante: string
          total: number
          total_papel: number | null
        }
        Insert: {
          anulada_en?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          confirmada_en?: string | null
          confirmada_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          factura_origen_id?: string | null
          fecha: string
          fecha_vencimiento?: string | null
          gasto_descontado?: number | null
          gasto_forma_pago_anterior?: string | null
          gasto_generado?: boolean
          gasto_id?: string | null
          id?: string
          iva?: number
          mercaderia_llego?: boolean | null
          nc_gasto?: string | null
          numero: string
          numero_normalizado?: string | null
          observaciones?: string | null
          pedido_id: string
          proveedor_id: string
          subtotal?: number
          tipo_comprobante?: string
          total?: number
          total_papel?: number | null
        }
        Update: {
          anulada_en?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          confirmada_en?: string | null
          confirmada_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          factura_origen_id?: string | null
          fecha?: string
          fecha_vencimiento?: string | null
          gasto_descontado?: number | null
          gasto_forma_pago_anterior?: string | null
          gasto_generado?: boolean
          gasto_id?: string | null
          id?: string
          iva?: number
          mercaderia_llego?: boolean | null
          nc_gasto?: string | null
          numero?: string
          numero_normalizado?: string | null
          observaciones?: string | null
          pedido_id?: string
          proveedor_id?: string
          subtotal?: number
          tipo_comprobante?: string
          total?: number
          total_papel?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_facturas_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_confirmada_por_fkey"
            columns: ["confirmada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_factura_origen_id_fkey"
            columns: ["factura_origen_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_factura_origen_id_fkey"
            columns: ["factura_origen_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_factura_origen_id_fkey"
            columns: ["factura_origen_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_facturas_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_item_proveedores: {
        Row: {
          activo: boolean
          cobra_por: string
          codigo_proveedor: string | null
          created_at: string
          es_principal: boolean
          id: string
          item_id: string
          precio_ref: number | null
          proveedor_id: string
        }
        Insert: {
          activo?: boolean
          cobra_por?: string
          codigo_proveedor?: string | null
          created_at?: string
          es_principal?: boolean
          id?: string
          item_id: string
          precio_ref?: number | null
          proveedor_id: string
        }
        Update: {
          activo?: boolean
          cobra_por?: string
          codigo_proveedor?: string | null
          created_at?: string
          es_principal?: boolean
          id?: string
          item_id?: string
          precio_ref?: number | null
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_item_proveedores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_item_proveedores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_item_proveedores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_item_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_items: {
        Row: {
          a_demanda: boolean
          alicuota_iva: number
          cantidad_por_masa: number
          cantidad_por_unidad: number
          categoria_id: string | null
          cobra_por_default: string
          created_at: string | null
          estado: string
          id: string
          nombre: string
          precio: number | null
          redondeo: string
          stock_maximo: number | null
          stock_minimo: number
          unidad: string | null
          unidad_base: string
        }
        Insert: {
          a_demanda?: boolean
          alicuota_iva?: number
          cantidad_por_masa?: number
          cantidad_por_unidad?: number
          categoria_id?: string | null
          cobra_por_default?: string
          created_at?: string | null
          estado?: string
          id?: string
          nombre: string
          precio?: number | null
          redondeo?: string
          stock_maximo?: number | null
          stock_minimo?: number
          unidad?: string | null
          unidad_base?: string
        }
        Update: {
          a_demanda?: boolean
          alicuota_iva?: number
          cantidad_por_masa?: number
          cantidad_por_unidad?: number
          categoria_id?: string | null
          cobra_por_default?: string
          created_at?: string | null
          estado?: string
          id?: string
          nombre?: string
          precio?: number | null
          redondeo?: string
          stock_maximo?: number | null
          stock_minimo?: number
          unidad?: string | null
          unidad_base?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_items_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "compras_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_items_historial: {
        Row: {
          campo: string
          creado_en: string
          creado_por: string | null
          id: string
          item_id: string
          lote: string
          origen: string
          proveedor_id: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          item_id: string
          lote: string
          origen?: string
          proveedor_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo?: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          item_id?: string
          lote?: string
          origen?: string
          proveedor_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_items_historial_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_items_historial_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_items_historial_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_items_historial_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_items_historial_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_pedido_eventos: {
        Row: {
          creado_en: string
          creado_por: string | null
          detalle: Json
          id: string
          pedido_id: string
          tipo: string
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          detalle?: Json
          id?: string
          pedido_id: string
          tipo: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          detalle?: Json
          id?: string
          pedido_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_pedido_eventos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_pedido_items: {
        Row: {
          cantidad: number
          descripcion: string
          id: string
          item_id: string | null
          orden: number
          pedido_id: string
          solicitud_item_id: string | null
          unidad: string | null
        }
        Insert: {
          cantidad?: number
          descripcion: string
          id?: string
          item_id?: string | null
          orden?: number
          pedido_id: string
          solicitud_item_id?: string | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number
          descripcion?: string
          id?: string
          item_id?: string | null
          orden?: number
          pedido_id?: string
          solicitud_item_id?: string | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_pedido_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedido_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_pedido_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedido_items_solicitud_item_id_fkey"
            columns: ["solicitud_item_id"]
            isOneToOne: false
            referencedRelation: "compras_solicitud_items"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_pedidos: {
        Row: {
          actualizado_en: string | null
          actualizado_por: string | null
          cerrado_en: string | null
          cerrado_manual_en: string | null
          cerrado_manual_por: string | null
          cierre_motivo: string | null
          creado_por: string | null
          created_at: string | null
          enviado_en: string | null
          enviado_por: string | null
          estado: string
          estado_facturacion: string
          estado_recepcion: string
          id: string
          local_facturacion_id: string | null
          mensaje: string | null
          numero: number
          proveedor_id: string
          reabierto_en: string | null
          reabierto_por: string | null
          solicitud_id: string | null
          ultima_secuencia_devolucion: number
          ultima_secuencia_remito: number
        }
        Insert: {
          actualizado_en?: string | null
          actualizado_por?: string | null
          cerrado_en?: string | null
          cerrado_manual_en?: string | null
          cerrado_manual_por?: string | null
          cierre_motivo?: string | null
          creado_por?: string | null
          created_at?: string | null
          enviado_en?: string | null
          enviado_por?: string | null
          estado?: string
          estado_facturacion?: string
          estado_recepcion?: string
          id?: string
          local_facturacion_id?: string | null
          mensaje?: string | null
          numero?: number
          proveedor_id: string
          reabierto_en?: string | null
          reabierto_por?: string | null
          solicitud_id?: string | null
          ultima_secuencia_devolucion?: number
          ultima_secuencia_remito?: number
        }
        Update: {
          actualizado_en?: string | null
          actualizado_por?: string | null
          cerrado_en?: string | null
          cerrado_manual_en?: string | null
          cerrado_manual_por?: string | null
          cierre_motivo?: string | null
          creado_por?: string | null
          created_at?: string | null
          enviado_en?: string | null
          enviado_por?: string | null
          estado?: string
          estado_facturacion?: string
          estado_recepcion?: string
          id?: string
          local_facturacion_id?: string | null
          mensaje?: string | null
          numero?: number
          proveedor_id?: string
          reabierto_en?: string | null
          reabierto_por?: string | null
          solicitud_id?: string | null
          ultima_secuencia_devolucion?: number
          ultima_secuencia_remito?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_pedidos_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_cerrado_manual_por_fkey"
            columns: ["cerrado_manual_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_local_facturacion_id_fkey"
            columns: ["local_facturacion_id"]
            isOneToOne: false
            referencedRelation: "locales_facturacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_reabierto_por_fkey"
            columns: ["reabierto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "compras_solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_pedidos_eliminados: {
        Row: {
          creado_en: string | null
          creado_por: string | null
          eliminado_en: string | null
          eliminado_por: string | null
          id: string
          lineas: Json
          motivo: string
          numero: number
          pedido_id: string
          proveedor_id: string | null
          proveedor_nombre: string | null
        }
        Insert: {
          creado_en?: string | null
          creado_por?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          id?: string
          lineas?: Json
          motivo: string
          numero: number
          pedido_id: string
          proveedor_id?: string | null
          proveedor_nombre?: string | null
        }
        Update: {
          creado_en?: string | null
          creado_por?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          id?: string
          lineas?: Json
          motivo?: string
          numero?: number
          pedido_id?: string
          proveedor_id?: string | null
          proveedor_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_pedidos_eliminados_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_eliminados_eliminado_por_fkey"
            columns: ["eliminado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_plantilla_base: {
        Row: {
          activo: boolean
          cantidad: number
          descripcion: string
          id: string
          item_id: string | null
          orden: number
          proveedor_id: string
          unidad: string | null
        }
        Insert: {
          activo?: boolean
          cantidad?: number
          descripcion: string
          id?: string
          item_id?: string | null
          orden?: number
          proveedor_id: string
          unidad?: string | null
        }
        Update: {
          activo?: boolean
          cantidad?: number
          descripcion?: string
          id?: string
          item_id?: string | null
          orden?: number
          proveedor_id?: string
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_plantilla_base_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_plantilla_base_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_plantilla_base_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_plantilla_base_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_plantillas_mensaje: {
        Row: {
          activo: boolean
          created_at: string
          cuerpo: string
          es_default: boolean
          id: string
          nombre: string
          orden: number
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuerpo: string
          es_default?: boolean
          id?: string
          nombre: string
          orden?: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuerpo?: string
          es_default?: boolean
          id?: string
          nombre?: string
          orden?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      compras_remito_items: {
        Row: {
          cantidad: number
          cantidad_base: number | null
          descripcion: string
          id: string
          item_id: string | null
          pedido_item_id: string | null
          precio: number | null
          remito_id: string
        }
        Insert: {
          cantidad?: number
          cantidad_base?: number | null
          descripcion: string
          id?: string
          item_id?: string | null
          pedido_item_id?: string | null
          precio?: number | null
          remito_id: string
        }
        Update: {
          cantidad?: number
          cantidad_base?: number | null
          descripcion?: string
          id?: string
          item_id?: string | null
          pedido_item_id?: string | null
          precio?: number | null
          remito_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_remito_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_remito_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_remito_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_remito_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "compras_pedido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_remito_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_pedido_pendiente"
            referencedColumns: ["pedido_item_id"]
          },
          {
            foreignKeyName: "compras_remito_items_remito_id_fkey"
            columns: ["remito_id"]
            isOneToOne: false
            referencedRelation: "compras_remitos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_remitos: {
        Row: {
          creado_por: string | null
          created_at: string | null
          factura_id: string | null
          fecha: string
          id: string
          numero: string | null
          origen: string
          pedido_id: string
          secuencia: number
        }
        Insert: {
          creado_por?: string | null
          created_at?: string | null
          factura_id?: string | null
          fecha: string
          id?: string
          numero?: string | null
          origen?: string
          pedido_id: string
          secuencia: number
        }
        Update: {
          creado_por?: string | null
          created_at?: string | null
          factura_id?: string | null
          fecha?: string
          id?: string
          numero?: string | null
          origen?: string
          pedido_id?: string
          secuencia?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_remitos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_remitos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_remitos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_remitos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_remitos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_solicitud_items: {
        Row: {
          cantidad_ajustada: number
          cantidad_sugerida: number
          descripcion: string
          descuento_origen: string | null
          descuento_sugerido: number | null
          id: string
          incluir: boolean
          item_id: string | null
          orden: number
          proveedor_id: string | null
          solicitud_id: string
          stock_actual: number | null
          unidad: string | null
        }
        Insert: {
          cantidad_ajustada?: number
          cantidad_sugerida?: number
          descripcion: string
          descuento_origen?: string | null
          descuento_sugerido?: number | null
          id?: string
          incluir?: boolean
          item_id?: string | null
          orden?: number
          proveedor_id?: string | null
          solicitud_id: string
          stock_actual?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad_ajustada?: number
          cantidad_sugerida?: number
          descripcion?: string
          descuento_origen?: string | null
          descuento_sugerido?: number | null
          id?: string
          incluir?: boolean
          item_id?: string | null
          orden?: number
          proveedor_id?: string | null
          solicitud_id?: string
          stock_actual?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_solicitud_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitud_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_solicitud_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitud_items_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitud_items_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "compras_solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_solicitudes: {
        Row: {
          conteo_id: string | null
          convertida_en: string | null
          convertida_por: string | null
          creado_por: string | null
          created_at: string
          estado: string
          id: string
          tipo: string
        }
        Insert: {
          conteo_id?: string | null
          convertida_en?: string | null
          convertida_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          tipo: string
        }
        Update: {
          conteo_id?: string | null
          convertida_en?: string | null
          convertida_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_solicitudes_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "fabrica_conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitudes_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_compras_conteos_historial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitudes_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_fabrica_conteo_diferencias"
            referencedColumns: ["superado_por_conteo_id"]
          },
          {
            foreignKeyName: "compras_solicitudes_convertida_por_fkey"
            columns: ["convertida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitudes_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_stock_actual: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          cantidad: number
          item_id: string
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          cantidad?: number
          item_id: string
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          cantidad?: number
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_stock_actual_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_actual_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_actual_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_stock_actual_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_stock_movimientos: {
        Row: {
          anula_movimiento_id: string | null
          cantidad_antes: number | null
          cantidad_despues: number | null
          conteo_id: string | null
          creado_por: string | null
          created_at: string
          delta: number
          devolucion_id: string | null
          discrepancia_id: string | null
          factura_id: string | null
          id: string
          item_id: string
          motivo: string | null
          remito_id: string | null
          tipo: string
        }
        Insert: {
          anula_movimiento_id?: string | null
          cantidad_antes?: number | null
          cantidad_despues?: number | null
          conteo_id?: string | null
          creado_por?: string | null
          created_at?: string
          delta: number
          devolucion_id?: string | null
          discrepancia_id?: string | null
          factura_id?: string | null
          id?: string
          item_id: string
          motivo?: string | null
          remito_id?: string | null
          tipo: string
        }
        Update: {
          anula_movimiento_id?: string | null
          cantidad_antes?: number | null
          cantidad_despues?: number | null
          conteo_id?: string | null
          creado_por?: string | null
          created_at?: string
          delta?: number
          devolucion_id?: string | null
          discrepancia_id?: string | null
          factura_id?: string | null
          id?: string
          item_id?: string
          motivo?: string | null
          remito_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_stock_movimientos_anula_movimiento_id_fkey"
            columns: ["anula_movimiento_id"]
            isOneToOne: false
            referencedRelation: "compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_anula_movimiento_id_fkey"
            columns: ["anula_movimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "fabrica_conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_compras_conteos_historial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_fabrica_conteo_diferencias"
            referencedColumns: ["superado_por_conteo_id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "compras_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["devolucion_id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_discrepancia_id_fkey"
            columns: ["discrepancia_id"]
            isOneToOne: false
            referencedRelation: "compras_factura_discrepancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_discrepancia_id_fkey"
            columns: ["discrepancia_id"]
            isOneToOne: false
            referencedRelation: "v_compras_factura_diferencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_remito_id_fkey"
            columns: ["remito_id"]
            isOneToOne: false
            referencedRelation: "compras_remitos"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliaciones: {
        Row: {
          confirmado: boolean | null
          confirmado_at: string | null
          confirmado_por: string | null
          created_at: string | null
          diferencia: number | null
          fecha: string
          id: string
          local_id: string | null
          monto_remito: number | null
          monto_vendido: number | null
          pedido: number | null
          producto_nombre: string
          tiene_alerta: boolean | null
          vendido: number | null
        }
        Insert: {
          confirmado?: boolean | null
          confirmado_at?: string | null
          confirmado_por?: string | null
          created_at?: string | null
          diferencia?: number | null
          fecha: string
          id?: string
          local_id?: string | null
          monto_remito?: number | null
          monto_vendido?: number | null
          pedido?: number | null
          producto_nombre: string
          tiene_alerta?: boolean | null
          vendido?: number | null
        }
        Update: {
          confirmado?: boolean | null
          confirmado_at?: string | null
          confirmado_por?: string | null
          created_at?: string | null
          diferencia?: number | null
          fecha?: string
          id?: string
          local_id?: string | null
          monto_remito?: number | null
          monto_vendido?: number | null
          pedido?: number | null
          producto_nombre?: string
          tiene_alerta?: boolean | null
          vendido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      fabrica_conteo_definicion_items: {
        Row: {
          activo: boolean
          cantidad_fija: number
          created_at: string
          definicion_id: string
          id: string
          item_id: string
          meta: number
          modo_calculo: string
          orden: number
        }
        Insert: {
          activo?: boolean
          cantidad_fija?: number
          created_at?: string
          definicion_id: string
          id?: string
          item_id: string
          meta?: number
          modo_calculo: string
          orden?: number
        }
        Update: {
          activo?: boolean
          cantidad_fija?: number
          created_at?: string
          definicion_id?: string
          id?: string
          item_id?: string
          meta?: number
          modo_calculo?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_conteo_definicion_items_definicion_id_fkey"
            columns: ["definicion_id"]
            isOneToOne: false
            referencedRelation: "fabrica_conteo_definiciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_definicion_items_definicion_id_fkey"
            columns: ["definicion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_conteos_historial"
            referencedColumns: ["definicion_id"]
          },
          {
            foreignKeyName: "fabrica_conteo_definicion_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_definicion_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "fabrica_conteo_definicion_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrica_conteo_definiciones: {
        Row: {
          activo: boolean
          created_at: string
          dia_semana: number
          dias_ventana: number
          icono: string | null
          id: string
          modulo: string
          nombre: string
          orden: number
          periodicidad: string
          pide_masas: boolean
          turno_desde: string
          turno_hasta: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          dia_semana: number
          dias_ventana?: number
          icono?: string | null
          id?: string
          modulo?: string
          nombre: string
          orden?: number
          periodicidad?: string
          pide_masas?: boolean
          turno_desde?: string
          turno_hasta?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          dia_semana?: number
          dias_ventana?: number
          icono?: string | null
          id?: string
          modulo?: string
          nombre?: string
          orden?: number
          periodicidad?: string
          pide_masas?: boolean
          turno_desde?: string
          turno_hasta?: string
        }
        Relationships: []
      }
      fabrica_conteo_items: {
        Row: {
          cantidad: number
          cantidad_fija: number | null
          cantidad_por_masa: number | null
          cantidad_por_unidad: number | null
          contado_en: string | null
          conteo_id: string
          descuento_base_sugerido: number | null
          diferencia: number | null
          diferencia_estado: string | null
          diferencia_mov_id: string | null
          diferencia_nota: string | null
          diferencia_resuelta_en: string | null
          diferencia_resuelta_por: string | null
          exceso: number | null
          id: string
          item_id: string
          meta: number | null
          modo_calculo: string | null
          necesidad: number | null
          redondeo: string | null
          sobrestock: boolean
          stock_teorico: number | null
          sugerido: number | null
          unidad_compra: string | null
        }
        Insert: {
          cantidad?: number
          cantidad_fija?: number | null
          cantidad_por_masa?: number | null
          cantidad_por_unidad?: number | null
          contado_en?: string | null
          conteo_id: string
          descuento_base_sugerido?: number | null
          diferencia?: number | null
          diferencia_estado?: string | null
          diferencia_mov_id?: string | null
          diferencia_nota?: string | null
          diferencia_resuelta_en?: string | null
          diferencia_resuelta_por?: string | null
          exceso?: number | null
          id?: string
          item_id: string
          meta?: number | null
          modo_calculo?: string | null
          necesidad?: number | null
          redondeo?: string | null
          sobrestock?: boolean
          stock_teorico?: number | null
          sugerido?: number | null
          unidad_compra?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_fija?: number | null
          cantidad_por_masa?: number | null
          cantidad_por_unidad?: number | null
          contado_en?: string | null
          conteo_id?: string
          descuento_base_sugerido?: number | null
          diferencia?: number | null
          diferencia_estado?: string | null
          diferencia_mov_id?: string | null
          diferencia_nota?: string | null
          diferencia_resuelta_en?: string | null
          diferencia_resuelta_por?: string | null
          exceso?: number | null
          id?: string
          item_id?: string
          meta?: number | null
          modo_calculo?: string | null
          necesidad?: number | null
          redondeo?: string | null
          sobrestock?: boolean
          stock_teorico?: number | null
          sugerido?: number | null
          unidad_compra?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "fabrica_conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_compras_conteos_historial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_fabrica_conteo_diferencias"
            referencedColumns: ["superado_por_conteo_id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_diferencia_mov_id_fkey"
            columns: ["diferencia_mov_id"]
            isOneToOne: false
            referencedRelation: "compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_diferencia_mov_id_fkey"
            columns: ["diferencia_mov_id"]
            isOneToOne: false
            referencedRelation: "v_compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_diferencia_resuelta_por_fkey"
            columns: ["diferencia_resuelta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrica_conteos: {
        Row: {
          cerrado_en: string | null
          cerrado_por: string | null
          creado_por: string | null
          created_at: string
          definicion_id: string
          descartado_en: string | null
          descartado_por: string | null
          estado: string
          fecha: string
          id: string
          masas_proyectadas: number
          motivo_descarte: string | null
          notas: string | null
          semana_desde: string
          semana_hasta: string
        }
        Insert: {
          cerrado_en?: string | null
          cerrado_por?: string | null
          creado_por?: string | null
          created_at?: string
          definicion_id: string
          descartado_en?: string | null
          descartado_por?: string | null
          estado?: string
          fecha: string
          id?: string
          masas_proyectadas?: number
          motivo_descarte?: string | null
          notas?: string | null
          semana_desde: string
          semana_hasta: string
        }
        Update: {
          cerrado_en?: string | null
          cerrado_por?: string | null
          creado_por?: string | null
          created_at?: string
          definicion_id?: string
          descartado_en?: string | null
          descartado_por?: string | null
          estado?: string
          fecha?: string
          id?: string
          masas_proyectadas?: number
          motivo_descarte?: string | null
          notas?: string | null
          semana_desde?: string
          semana_hasta?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_conteos_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteos_definicion_id_fkey"
            columns: ["definicion_id"]
            isOneToOne: false
            referencedRelation: "fabrica_conteo_definiciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteos_definicion_id_fkey"
            columns: ["definicion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_conteos_historial"
            referencedColumns: ["definicion_id"]
          },
          {
            foreignKeyName: "fabrica_conteos_descartado_por_fkey"
            columns: ["descartado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrica_devolucion_motivos: {
        Row: {
          activo: boolean
          destino_default: string
          id: string
          nombre: string
          orden: number
          requiere_cantidad: boolean
          requiere_detalle: boolean
        }
        Insert: {
          activo?: boolean
          destino_default?: string
          id?: string
          nombre: string
          orden?: number
          requiere_cantidad?: boolean
          requiere_detalle?: boolean
        }
        Update: {
          activo?: boolean
          destino_default?: string
          id?: string
          nombre?: string
          orden?: number
          requiere_cantidad?: boolean
          requiere_detalle?: boolean
        }
        Relationships: []
      }
      fabrica_devoluciones: {
        Row: {
          cantidad_kg: number | null
          cargado_por: string
          created_at: string
          destino: string
          fecha: string
          id: string
          motivo_id: string
          notas: string | null
          presentacion_id: string | null
          sabor_id: string | null
          tamanio_id: string | null
          updated_at: string
        }
        Insert: {
          cantidad_kg?: number | null
          cargado_por: string
          created_at?: string
          destino: string
          fecha?: string
          id?: string
          motivo_id: string
          notas?: string | null
          presentacion_id?: string | null
          sabor_id?: string | null
          tamanio_id?: string | null
          updated_at?: string
        }
        Update: {
          cantidad_kg?: number | null
          cargado_por?: string
          created_at?: string
          destino?: string
          fecha?: string
          id?: string
          motivo_id?: string
          notas?: string | null
          presentacion_id?: string | null
          sabor_id?: string | null
          tamanio_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_devoluciones_cargado_por_fkey"
            columns: ["cargado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_devoluciones_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "fabrica_devolucion_motivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_devoluciones_presentacion_id_fkey"
            columns: ["presentacion_id"]
            isOneToOne: false
            referencedRelation: "fabrica_presentaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_devoluciones_sabor_id_fkey"
            columns: ["sabor_id"]
            isOneToOne: false
            referencedRelation: "fabrica_sabores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_devoluciones_tamanio_id_fkey"
            columns: ["tamanio_id"]
            isOneToOne: false
            referencedRelation: "fabrica_tamanios"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrica_embolsados: {
        Row: {
          cantidad_kg: number
          cargado_por: string | null
          fecha: string
          id: string
          operario_fabrica_id: string | null
          presentacion_id: string
          sabor_id: string
          tamanio_id: string
          updated_at: string | null
        }
        Insert: {
          cantidad_kg?: number
          cargado_por?: string | null
          fecha: string
          id?: string
          operario_fabrica_id?: string | null
          presentacion_id: string
          sabor_id: string
          tamanio_id: string
          updated_at?: string | null
        }
        Update: {
          cantidad_kg?: number
          cargado_por?: string | null
          fecha?: string
          id?: string
          operario_fabrica_id?: string | null
          presentacion_id?: string
          sabor_id?: string
          tamanio_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_embolsados_cargado_por_fkey"
            columns: ["cargado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_embolsados_operario_fabrica_id_fkey"
            columns: ["operario_fabrica_id"]
            isOneToOne: false
            referencedRelation: "fabrica_operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_embolsados_presentacion_id_fkey"
            columns: ["presentacion_id"]
            isOneToOne: false
            referencedRelation: "fabrica_presentaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_embolsados_sabor_id_fkey"
            columns: ["sabor_id"]
            isOneToOne: false
            referencedRelation: "fabrica_sabores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_embolsados_tamanio_id_fkey"
            columns: ["tamanio_id"]
            isOneToOne: false
            referencedRelation: "fabrica_tamanios"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrica_operarios: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      fabrica_presentaciones: {
        Row: {
          activo: boolean
          id: string
          nombre: string
          orden: number
          peso_kg: number
        }
        Insert: {
          activo?: boolean
          id?: string
          nombre: string
          orden?: number
          peso_kg: number
        }
        Update: {
          activo?: boolean
          id?: string
          nombre?: string
          orden?: number
          peso_kg?: number
        }
        Relationships: []
      }
      fabrica_producciones: {
        Row: {
          cargado_por: string
          created_at: string
          destino: string
          fecha: string
          fecula_kg: number
          id: string
          masa_kg: number
          operario_fabrica_id: string | null
          operario_id: string
          sabor_id: string
          tamanio_id: string | null
          turno: string
          updated_at: string
        }
        Insert: {
          cargado_por: string
          created_at?: string
          destino: string
          fecha?: string
          fecula_kg?: number
          id?: string
          masa_kg?: number
          operario_fabrica_id?: string | null
          operario_id: string
          sabor_id: string
          tamanio_id?: string | null
          turno: string
          updated_at?: string
        }
        Update: {
          cargado_por?: string
          created_at?: string
          destino?: string
          fecha?: string
          fecula_kg?: number
          id?: string
          masa_kg?: number
          operario_fabrica_id?: string | null
          operario_id?: string
          sabor_id?: string
          tamanio_id?: string | null
          turno?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_producciones_cargado_por_fkey"
            columns: ["cargado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_producciones_operario_fabrica_id_fkey"
            columns: ["operario_fabrica_id"]
            isOneToOne: false
            referencedRelation: "fabrica_operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_producciones_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_producciones_sabor_id_fkey"
            columns: ["sabor_id"]
            isOneToOne: false
            referencedRelation: "fabrica_sabores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_producciones_tamanio_id_fkey"
            columns: ["tamanio_id"]
            isOneToOne: false
            referencedRelation: "fabrica_tamanios"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrica_sabores: {
        Row: {
          activo: boolean
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      fabrica_stock_terminado: {
        Row: {
          actualizado_en: string
          cantidad_kg: number
          producto_id: string
        }
        Insert: {
          actualizado_en?: string
          cantidad_kg?: number
          producto_id: string
        }
        Update: {
          actualizado_en?: string
          cantidad_kg?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_stock_terminado_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrica_stock_terminado_mov: {
        Row: {
          creado_por: string | null
          created_at: string
          delta_kg: number
          embolsado_id: string | null
          id: string
          pedido_id: string | null
          producto_id: string
          tipo: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          delta_kg: number
          embolsado_id?: string | null
          id?: string
          pedido_id?: string | null
          producto_id: string
          tipo: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          delta_kg?: number
          embolsado_id?: string | null
          id?: string
          pedido_id?: string | null
          producto_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_stock_terminado_mov_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_stock_terminado_mov_embolsado_id_fkey"
            columns: ["embolsado_id"]
            isOneToOne: false
            referencedRelation: "fabrica_embolsados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_stock_terminado_mov_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_stock_terminado_mov_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrica_tamanios: {
        Row: {
          activo: boolean
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      formas_pago: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      fudo_categorias_gasto: {
        Row: {
          fudo_id: string
          nombre: string | null
          raw: Json | null
          synced_at: string
        }
        Insert: {
          fudo_id: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Update: {
          fudo_id?: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Relationships: []
      }
      fudo_categorias_ingrediente: {
        Row: {
          fudo_id: string
          nombre: string | null
          raw: Json | null
          synced_at: string
        }
        Insert: {
          fudo_id: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Update: {
          fudo_id?: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Relationships: []
      }
      fudo_categorias_producto: {
        Row: {
          fudo_id: string
          nombre: string | null
          raw: Json | null
          synced_at: string
        }
        Insert: {
          fudo_id: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Update: {
          fudo_id?: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Relationships: []
      }
      fudo_clientes: {
        Row: {
          activo: boolean | null
          creado_en: string | null
          email: string | null
          fudo_id: string
          nombre: string | null
          raw: Json | null
          synced_at: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          creado_en?: string | null
          email?: string | null
          fudo_id: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          creado_en?: string | null
          email?: string | null
          fudo_id?: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
          telefono?: string | null
        }
        Relationships: []
      }
      fudo_gastos: {
        Row: {
          cancelado: boolean | null
          categoria_id: string | null
          descripcion: string | null
          estado: string | null
          fecha: string | null
          fudo_id: string
          monto: number | null
          proveedor_id: string | null
          raw: Json | null
          synced_at: string
        }
        Insert: {
          cancelado?: boolean | null
          categoria_id?: string | null
          descripcion?: string | null
          estado?: string | null
          fecha?: string | null
          fudo_id: string
          monto?: number | null
          proveedor_id?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Update: {
          cancelado?: boolean | null
          categoria_id?: string | null
          descripcion?: string | null
          estado?: string | null
          fecha?: string | null
          fudo_id?: string
          monto?: number | null
          proveedor_id?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fudo_gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fudo_categorias_gasto"
            referencedColumns: ["fudo_id"]
          },
          {
            foreignKeyName: "fudo_gastos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "fudo_proveedores"
            referencedColumns: ["fudo_id"]
          },
        ]
      }
      fudo_gastos_pagados: {
        Row: {
          caja: string
          comprobante_url: string | null
          created_at: string
          descripcion: string | null
          fecha_gasto: string | null
          fecha_pago: string
          forma_pago: string
          fudo_expense_id: string
          id: string
          monto: number
          pagado_por: string | null
          sucursal: string
        }
        Insert: {
          caja: string
          comprobante_url?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_gasto?: string | null
          fecha_pago: string
          forma_pago: string
          fudo_expense_id: string
          id?: string
          monto: number
          pagado_por?: string | null
          sucursal: string
        }
        Update: {
          caja?: string
          comprobante_url?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_gasto?: string | null
          fecha_pago?: string
          forma_pago?: string
          fudo_expense_id?: string
          id?: string
          monto?: number
          pagado_por?: string | null
          sucursal?: string
        }
        Relationships: [
          {
            foreignKeyName: "fudo_gastos_pagados_pagado_por_fkey"
            columns: ["pagado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fudo_ingredientes: {
        Row: {
          categoria_id: string | null
          costo: number | null
          fudo_id: string
          nombre: string | null
          raw: Json | null
          stock: number | null
          stock_control: boolean | null
          synced_at: string
        }
        Insert: {
          categoria_id?: string | null
          costo?: number | null
          fudo_id: string
          nombre?: string | null
          raw?: Json | null
          stock?: number | null
          stock_control?: boolean | null
          synced_at?: string
        }
        Update: {
          categoria_id?: string | null
          costo?: number | null
          fudo_id?: string
          nombre?: string | null
          raw?: Json | null
          stock?: number | null
          stock_control?: boolean | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fudo_ingredientes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fudo_categorias_ingrediente"
            referencedColumns: ["fudo_id"]
          },
        ]
      }
      fudo_metodos_pago: {
        Row: {
          activo: boolean | null
          codigo: string | null
          fudo_id: string
          nombre: string | null
          posicion: number | null
          raw: Json | null
          synced_at: string
        }
        Insert: {
          activo?: boolean | null
          codigo?: string | null
          fudo_id: string
          nombre?: string | null
          posicion?: number | null
          raw?: Json | null
          synced_at?: string
        }
        Update: {
          activo?: boolean | null
          codigo?: string | null
          fudo_id?: string
          nombre?: string | null
          posicion?: number | null
          raw?: Json | null
          synced_at?: string
        }
        Relationships: []
      }
      fudo_pagos: {
        Row: {
          caja: string | null
          cancelado: boolean | null
          creado_en: string | null
          forma_pago: string | null
          fudo_id: string
          gasto_id: string | null
          metodo_pago_id: string | null
          monto: number | null
          raw: Json | null
          synced_at: string
          venta_id: string | null
        }
        Insert: {
          caja?: string | null
          cancelado?: boolean | null
          creado_en?: string | null
          forma_pago?: string | null
          fudo_id: string
          gasto_id?: string | null
          metodo_pago_id?: string | null
          monto?: number | null
          raw?: Json | null
          synced_at?: string
          venta_id?: string | null
        }
        Update: {
          caja?: string | null
          cancelado?: boolean | null
          creado_en?: string | null
          forma_pago?: string | null
          fudo_id?: string
          gasto_id?: string | null
          metodo_pago_id?: string | null
          monto?: number | null
          raw?: Json | null
          synced_at?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fudo_pagos_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "fudo_gastos"
            referencedColumns: ["fudo_id"]
          },
          {
            foreignKeyName: "fudo_pagos_metodo_pago_id_fkey"
            columns: ["metodo_pago_id"]
            isOneToOne: false
            referencedRelation: "fudo_metodos_pago"
            referencedColumns: ["fudo_id"]
          },
          {
            foreignKeyName: "fudo_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "fudo_ventas"
            referencedColumns: ["fudo_id"]
          },
        ]
      }
      fudo_productos: {
        Row: {
          activo: boolean | null
          categoria_id: string | null
          codigo: string | null
          costo: number | null
          descripcion: string | null
          fudo_id: string
          nombre: string | null
          precio: number | null
          raw: Json | null
          stock: number | null
          stock_control: boolean | null
          synced_at: string
        }
        Insert: {
          activo?: boolean | null
          categoria_id?: string | null
          codigo?: string | null
          costo?: number | null
          descripcion?: string | null
          fudo_id: string
          nombre?: string | null
          precio?: number | null
          raw?: Json | null
          stock?: number | null
          stock_control?: boolean | null
          synced_at?: string
        }
        Update: {
          activo?: boolean | null
          categoria_id?: string | null
          codigo?: string | null
          costo?: number | null
          descripcion?: string | null
          fudo_id?: string
          nombre?: string | null
          precio?: number | null
          raw?: Json | null
          stock?: number | null
          stock_control?: boolean | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fudo_productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fudo_categorias_producto"
            referencedColumns: ["fudo_id"]
          },
        ]
      }
      fudo_proveedores: {
        Row: {
          fudo_id: string
          nombre: string | null
          raw: Json | null
          synced_at: string
        }
        Insert: {
          fudo_id: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Update: {
          fudo_id?: string
          nombre?: string | null
          raw?: Json | null
          synced_at?: string
        }
        Relationships: []
      }
      fudo_sync_log: {
        Row: {
          error: string | null
          finalizado_en: string | null
          id: number
          iniciado_en: string | null
          recurso: string | null
          registros: number | null
          status: string | null
        }
        Insert: {
          error?: string | null
          finalizado_en?: string | null
          id?: number
          iniciado_en?: string | null
          recurso?: string | null
          registros?: number | null
          status?: string | null
        }
        Update: {
          error?: string | null
          finalizado_en?: string | null
          id?: number
          iniciado_en?: string | null
          recurso?: string | null
          registros?: number | null
          status?: string | null
        }
        Relationships: []
      }
      fudo_venta_items: {
        Row: {
          cantidad: number | null
          fudo_id: string
          precio: number | null
          producto_id: string | null
          raw: Json | null
          synced_at: string
          venta_id: string | null
        }
        Insert: {
          cantidad?: number | null
          fudo_id: string
          precio?: number | null
          producto_id?: string | null
          raw?: Json | null
          synced_at?: string
          venta_id?: string | null
        }
        Update: {
          cantidad?: number | null
          fudo_id?: string
          precio?: number | null
          producto_id?: string | null
          raw?: Json | null
          synced_at?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fudo_venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "fudo_ventas"
            referencedColumns: ["fudo_id"]
          },
        ]
      }
      fudo_ventas: {
        Row: {
          cerrado_en: string | null
          cliente_id: string | null
          comentario: string | null
          creado_en: string | null
          estado: string | null
          fudo_id: string
          raw: Json | null
          synced_at: string
          tipo: string | null
          total: number | null
        }
        Insert: {
          cerrado_en?: string | null
          cliente_id?: string | null
          comentario?: string | null
          creado_en?: string | null
          estado?: string | null
          fudo_id: string
          raw?: Json | null
          synced_at?: string
          tipo?: string | null
          total?: number | null
        }
        Update: {
          cerrado_en?: string | null
          cliente_id?: string | null
          comentario?: string | null
          creado_en?: string | null
          estado?: string | null
          fudo_id?: string
          raw?: Json | null
          synced_at?: string
          tipo?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fudo_ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "fudo_clientes"
            referencedColumns: ["fudo_id"]
          },
        ]
      }
      gastos: {
        Row: {
          caja: string | null
          categoria: string
          comprobante_url: string | null
          created_at: string | null
          created_by: string | null
          estado: string
          fecha: string
          fecha_pago: string | null
          forma_pago: string
          id: string
          local: string
          monto: number
          observaciones: string | null
          pagado_por: string | null
          proveedor_id: string | null
          rubro: string
        }
        Insert: {
          caja?: string | null
          categoria: string
          comprobante_url?: string | null
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha?: string
          fecha_pago?: string | null
          forma_pago: string
          id?: string
          local: string
          monto: number
          observaciones?: string | null
          pagado_por?: string | null
          proveedor_id?: string | null
          rubro: string
        }
        Update: {
          caja?: string | null
          categoria?: string
          comprobante_url?: string | null
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha?: string
          fecha_pago?: string | null
          forma_pago?: string
          id?: string
          local?: string
          monto?: number
          observaciones?: string | null
          pagado_por?: string | null
          proveedor_id?: string | null
          rubro?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_pagado_por_fkey"
            columns: ["pagado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      informes_diarios: {
        Row: {
          actividades: Json
          autor_id: string | null
          comentario: string | null
          created_at: string | null
          destinatarios: string[]
          fecha: string
          horario_fin: string | null
          horario_inicio: string | null
          id: string
          tareas_completadas: Json
        }
        Insert: {
          actividades?: Json
          autor_id?: string | null
          comentario?: string | null
          created_at?: string | null
          destinatarios?: string[]
          fecha: string
          horario_fin?: string | null
          horario_inicio?: string | null
          id?: string
          tareas_completadas?: Json
        }
        Update: {
          actividades?: Json
          autor_id?: string | null
          comentario?: string | null
          created_at?: string | null
          destinatarios?: string[]
          fecha?: string
          horario_fin?: string | null
          horario_inicio?: string | null
          id?: string
          tareas_completadas?: Json
        }
        Relationships: [
          {
            foreignKeyName: "informes_diarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locales_config: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          sucursal: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          sucursal: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          sucursal?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      locales_facturacion: {
        Row: {
          activo: boolean
          created_at: string
          cuit: string
          direccion: string
          id: string
          nombre: string
          orden: number
          razon_social: string
          slug: string
          sucursal: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuit: string
          direccion: string
          id?: string
          nombre: string
          orden?: number
          razon_social: string
          slug: string
          sucursal: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuit?: string
          direccion?: string
          id?: string
          nombre?: string
          orden?: number
          razon_social?: string
          slug?: string
          sucursal?: string
          updated_at?: string
        }
        Relationships: []
      }
      notificaciones: {
        Row: {
          created_at: string | null
          cuerpo: string | null
          id: string
          leida: boolean
          tipo: string | null
          titulo: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          cuerpo?: string | null
          id?: string
          leida?: boolean
          tipo?: string | null
          titulo: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          cuerpo?: string | null
          id?: string
          leida?: boolean
          tipo?: string | null
          titulo?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_items: {
        Row: {
          cantidad: number
          cantidad_recibida: number | null
          created_at: string | null
          id: string
          pedido_id: string | null
          producto_id: string | null
          producto_nombre: string
          valor_total: number | null
        }
        Insert: {
          cantidad: number
          cantidad_recibida?: number | null
          created_at?: string | null
          id?: string
          pedido_id?: string | null
          producto_id?: string | null
          producto_nombre: string
          valor_total?: number | null
        }
        Update: {
          cantidad?: number
          cantidad_recibida?: number | null
          created_at?: string | null
          id?: string
          pedido_id?: string | null
          producto_id?: string | null
          producto_nombre?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_mensajes: {
        Row: {
          autor_nombre: string
          autor_rol: string
          created_at: string | null
          id: string
          pedido_id: string
          texto: string
        }
        Insert: {
          autor_nombre: string
          autor_rol: string
          created_at?: string | null
          id?: string
          pedido_id: string
          texto: string
        }
        Update: {
          autor_nombre?: string
          autor_rol?: string
          created_at?: string | null
          id?: string
          pedido_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_mensajes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          created_at: string | null
          destino: string
          enviado_at: string | null
          estado: string | null
          grupo_id: string | null
          id: string
          local_id: string | null
          local_nombre: string
          notas: string | null
          numero: number
          preparando_at: string | null
          recibido_at: string | null
        }
        Insert: {
          created_at?: string | null
          destino: string
          enviado_at?: string | null
          estado?: string | null
          grupo_id?: string | null
          id?: string
          local_id?: string | null
          local_nombre: string
          notas?: string | null
          numero?: number
          preparando_at?: string | null
          recibido_at?: string | null
        }
        Update: {
          created_at?: string | null
          destino?: string
          enviado_at?: string | null
          estado?: string | null
          grupo_id?: string | null
          id?: string
          local_id?: string | null
          local_nombre?: string
          notas?: string | null
          numero?: number
          preparando_at?: string | null
          recibido_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_cuentas: {
        Row: {
          activo: boolean
          categoria: string | null
          created_at: string | null
          flujo: string | null
          id: string
          orden: number
          rubro: string
          variabilidad: string | null
        }
        Insert: {
          activo?: boolean
          categoria?: string | null
          created_at?: string | null
          flujo?: string | null
          id?: string
          orden?: number
          rubro: string
          variabilidad?: string | null
        }
        Update: {
          activo?: boolean
          categoria?: string | null
          created_at?: string | null
          flujo?: string | null
          id?: string
          orden?: number
          rubro?: string
          variabilidad?: string | null
        }
        Relationships: []
      }
      producto_mapeos: {
        Row: {
          created_at: string | null
          id: string
          ignorado: boolean
          nombre_posberry: string
          producto_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ignorado?: boolean
          nombre_posberry: string
          producto_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ignorado?: boolean
          nombre_posberry?: string
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_mapeos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean | null
          categoria: string | null
          codigo: number | null
          created_at: string | null
          descripcion: string | null
          destino: string
          id: string
          nombre: string
          precio: number | null
          presentacion_id: string | null
          sabor_id: string | null
          tamanio_id: string | null
          tipo: string
          unidad: string | null
        }
        Insert: {
          activo?: boolean | null
          categoria?: string | null
          codigo?: number | null
          created_at?: string | null
          descripcion?: string | null
          destino: string
          id?: string
          nombre: string
          precio?: number | null
          presentacion_id?: string | null
          sabor_id?: string | null
          tamanio_id?: string | null
          tipo: string
          unidad?: string | null
        }
        Update: {
          activo?: boolean | null
          categoria?: string | null
          codigo?: number | null
          created_at?: string | null
          descripcion?: string | null
          destino?: string
          id?: string
          nombre?: string
          precio?: number | null
          presentacion_id?: string | null
          sabor_id?: string | null
          tamanio_id?: string | null
          tipo?: string
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_presentacion_id_fkey"
            columns: ["presentacion_id"]
            isOneToOne: false
            referencedRelation: "fabrica_presentaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_sabor_id_fkey"
            columns: ["sabor_id"]
            isOneToOne: false
            referencedRelation: "fabrica_sabores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_tamanio_id_fkey"
            columns: ["tamanio_id"]
            isOneToOne: false
            referencedRelation: "fabrica_tamanios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          estado: string
          id: string
          local_nombre: string | null
          modulos_permitidos: string[]
          nombre: string
          nombre_posberry: string | null
          rol: string
          whatsapp_apikey: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: string
          id: string
          local_nombre?: string | null
          modulos_permitidos?: string[]
          nombre: string
          nombre_posberry?: string | null
          rol: string
          whatsapp_apikey?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: string
          id?: string
          local_nombre?: string | null
          modulos_permitidos?: string[]
          nombre?: string
          nombre_posberry?: string | null
          rol?: string
          whatsapp_apikey?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_rol_fkey"
            columns: ["rol"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      proveedores: {
        Row: {
          categoria: string | null
          condiciones_pago: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string | null
          cuit: string | null
          direccion: string | null
          estado: string
          financiacion: string | null
          id: string
          local_facturacion_id: string | null
          maneja_stock: boolean
          nombre: string
          notas: string | null
          periodicidad_compra: string | null
          tiempo_entrega: string | null
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          condiciones_pago?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string | null
          cuit?: string | null
          direccion?: string | null
          estado?: string
          financiacion?: string | null
          id?: string
          local_facturacion_id?: string | null
          maneja_stock?: boolean
          nombre: string
          notas?: string | null
          periodicidad_compra?: string | null
          tiempo_entrega?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          condiciones_pago?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string | null
          cuit?: string | null
          direccion?: string | null
          estado?: string
          financiacion?: string | null
          id?: string
          local_facturacion_id?: string | null
          maneja_stock?: boolean
          nombre?: string
          notas?: string | null
          periodicidad_compra?: string | null
          tiempo_entrega?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_local_facturacion_id_fkey"
            columns: ["local_facturacion_id"]
            isOneToOne: false
            referencedRelation: "locales_facturacion"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          color: string
          created_at: string | null
          es_sistema: boolean
          key: string
          nombre: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          es_sistema?: boolean
          key: string
          nombre: string
        }
        Update: {
          color?: string
          created_at?: string | null
          es_sistema?: boolean
          key?: string
          nombre?: string
        }
        Relationships: []
      }
      tarea_adjuntos: {
        Row: {
          autor_id: string | null
          created_at: string | null
          id: string
          nombre: string
          size_bytes: number | null
          storage_path: string
          tarea_id: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string | null
          id?: string
          nombre: string
          size_bytes?: number | null
          storage_path: string
          tarea_id: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string | null
          id?: string
          nombre?: string
          size_bytes?: number | null
          storage_path?: string
          tarea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarea_adjuntos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarea_adjuntos_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_comentarios: {
        Row: {
          autor_id: string | null
          created_at: string | null
          id: string
          tarea_id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string | null
          id?: string
          tarea_id: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string | null
          id?: string
          tarea_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarea_comentarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarea_comentarios_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_historial: {
        Row: {
          autor_id: string | null
          campo: string
          created_at: string | null
          id: string
          tarea_id: string
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          autor_id?: string | null
          campo: string
          created_at?: string | null
          id?: string
          tarea_id: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          autor_id?: string | null
          campo?: string
          created_at?: string | null
          id?: string
          tarea_id?: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarea_historial_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarea_historial_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_subtareas: {
        Row: {
          completada: boolean | null
          created_at: string | null
          fecha: string | null
          id: string
          orden: number | null
          tarea_id: string
          texto: string
          turno: string
        }
        Insert: {
          completada?: boolean | null
          created_at?: string | null
          fecha?: string | null
          id?: string
          orden?: number | null
          tarea_id: string
          texto: string
          turno?: string
        }
        Update: {
          completada?: boolean | null
          created_at?: string | null
          fecha?: string | null
          id?: string
          orden?: number | null
          tarea_id?: string
          texto?: string
          turno?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarea_subtareas_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas: {
        Row: {
          asignado_a: string[] | null
          colabora_area: string | null
          colabora_persona_id: string | null
          colabora_tipo: string | null
          creado_por: string | null
          created_at: string | null
          descripcion: string | null
          estado: string | null
          fecha_limite: string | null
          id: string
          prioridad: string | null
          recordatorio_enviado_at: string | null
          titulo: string
          turno: string
          updated_at: string | null
        }
        Insert: {
          asignado_a?: string[] | null
          colabora_area?: string | null
          colabora_persona_id?: string | null
          colabora_tipo?: string | null
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string | null
          estado?: string | null
          fecha_limite?: string | null
          id?: string
          prioridad?: string | null
          recordatorio_enviado_at?: string | null
          titulo: string
          turno?: string
          updated_at?: string | null
        }
        Update: {
          asignado_a?: string[] | null
          colabora_area?: string | null
          colabora_persona_id?: string | null
          colabora_tipo?: string | null
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string | null
          estado?: string | null
          fecha_limite?: string | null
          id?: string
          prioridad?: string | null
          recordatorio_enviado_at?: string | null
          titulo?: string
          turno?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tareas_colabora_persona_id_fkey"
            columns: ["colabora_persona_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_posberry: {
        Row: {
          archivo_origen: string | null
          cantidad: number
          created_at: string | null
          fecha: string
          id: string
          id_externo: string | null
          importe: number | null
          local_id: string | null
          local_nombre: string | null
          producto_nombre: string
        }
        Insert: {
          archivo_origen?: string | null
          cantidad: number
          created_at?: string | null
          fecha: string
          id?: string
          id_externo?: string | null
          importe?: number | null
          local_id?: string | null
          local_nombre?: string | null
          producto_nombre: string
        }
        Update: {
          archivo_origen?: string | null
          cantidad?: number
          created_at?: string | null
          fecha?: string
          id?: string
          id_externo?: string | null
          importe?: number | null
          local_id?: string | null
          local_nombre?: string | null
          producto_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_posberry_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_compras_conteos_historial: {
        Row: {
          cerrado_en: string | null
          cerrado_por_nombre: string | null
          definicion_icono: string | null
          definicion_id: string | null
          definicion_nombre: string | null
          diferencias_pendientes: number | null
          diferencias_resueltas: number | null
          estado: string | null
          fecha: string | null
          id: string | null
          masas_proyectadas: number | null
          semana_desde: string | null
          semana_hasta: string | null
          solicitud_estado: string | null
          solicitud_id: string | null
        }
        Relationships: []
      }
      v_compras_devoluciones: {
        Row: {
          anulada_en: string | null
          anulada_motivo: string | null
          anulada_por_nombre: string | null
          codigo: string | null
          corrige_precio: boolean | null
          creado_por_nombre: string | null
          created_at: string | null
          devuelve_mercaderia: boolean | null
          espera_nota_credito: boolean | null
          estado: string | null
          factura_id: string | null
          factura_numero: string | null
          id: string | null
          lineas: Json | null
          motivo_id: string | null
          motivo_nombre: string | null
          nc_estado: string | null
          nc_fecha: string | null
          nc_gasto: string | null
          nc_gasto_descontado: number | null
          nc_numero: string | null
          nc_total: number | null
          nota: string | null
          nota_credito_id: string | null
          pedido_id: string | null
          pedido_numero: number | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          repone: boolean | null
          secuencia: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_devoluciones_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "compras_devolucion_motivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_devoluciones_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_devoluciones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedidos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_factura_diferencias: {
        Row: {
          acreditada: number | null
          cantidad_facturada: number | null
          cantidad_recibida: number | null
          clave: string | null
          contenido: number | null
          descripcion: string | null
          devolucion_codigo: string | null
          devolucion_id: string | null
          devuelta: number | null
          diferencia: number | null
          factura_id: string | null
          facturada_base: number | null
          facturada_base_real: boolean | null
          id: string | null
          item_id: string | null
          movimiento_id: string | null
          nota: string | null
          pedido_id: string | null
          pedido_item_id: string | null
          recibida_base: number | null
          recibida_base_real: boolean | null
          resolucion: string | null
          resuelto_en: string | null
          resuelto_por_nombre: string | null
          unidad: string | null
          unidad_base: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_factura_discrepancias_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "compras_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["devolucion_id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "compras_pedido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_factura_discrepancias_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_pedido_pendiente"
            referencedColumns: ["pedido_item_id"]
          },
          {
            foreignKeyName: "compras_facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_facturas: {
        Row: {
          anulada_en: string | null
          anulada_motivo: string | null
          anulada_por_nombre: string | null
          confirmada_en: string | null
          confirmada_por_nombre: string | null
          creado_por_nombre: string | null
          created_at: string | null
          devolucion_codigo: string | null
          devolucion_id: string | null
          diferencias_pendientes: number | null
          estado: string | null
          factura_origen_id: string | null
          factura_origen_numero: string | null
          fecha: string | null
          fecha_vencimiento: string | null
          gasto_descontado: number | null
          gasto_estado: string | null
          gasto_generado: boolean | null
          gasto_id: string | null
          gasto_local: string | null
          gasto_monto: number | null
          id: string | null
          iva: number | null
          mercaderia_llego: boolean | null
          nc_gasto: string | null
          notas_credito_total: number | null
          numero: string | null
          numero_normalizado: string | null
          observaciones: string | null
          pedido_estado_recepcion: string | null
          pedido_id: string | null
          pedido_numero: number | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          subtotal: number | null
          tipo_comprobante: string | null
          total: number | null
          total_papel: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_facturas_factura_origen_id_fkey"
            columns: ["factura_origen_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_factura_origen_id_fkey"
            columns: ["factura_origen_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_factura_origen_id_fkey"
            columns: ["factura_origen_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_facturas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_insumo_documentos: {
        Row: {
          cantidad: number | null
          cantidad_base: number | null
          cargado_en: string | null
          codigo: string | null
          documento_id: string | null
          fecha: string | null
          item_id: string | null
          linea_id: string | null
          origen: string | null
          pedido_id: string | null
          pedido_numero: number | null
          precio_por: string | null
          precio_unitario: number | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          subtotal: number | null
          tipo: string | null
          tipo_comprobante: string | null
        }
        Relationships: []
      }
      v_compras_insumos_resumen: {
        Row: {
          cobra_por_principal: string | null
          contenido: number | null
          conteos: number | null
          facturas: number | null
          item_id: string | null
          movimientos: number | null
          pedidos: number | null
          pedidos_abiertos: Json | null
          precio_ref_principal: number | null
          proveedor_principal_id: string | null
          puede_eliminar: boolean | null
          remitos: number | null
          solicitudes: number | null
          stock: number | null
          ultimo_precio: number | null
          ultimo_precio_factura_id: string | null
          ultimo_precio_fecha: string | null
          ultimo_precio_por: string | null
          ultimo_precio_proveedor_id: string | null
          ultimo_precio_unidad: string | null
          unidad_base: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_item_proveedores_proveedor_id_fkey"
            columns: ["proveedor_principal_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_items: {
        Row: {
          cantidad_por_masa: number | null
          cantidad_por_unidad: number | null
          categoria_id: string | null
          created_at: string | null
          estado: string | null
          id: string | null
          nombre: string | null
          precio: number | null
          proveedor_principal_id: string | null
          proveedor_principal_nombre: string | null
          redondeo: string | null
          stock_minimo: number | null
          unidad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_item_proveedores_proveedor_id_fkey"
            columns: ["proveedor_principal_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_items_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "compras_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_pedido_eventos: {
        Row: {
          detalle: Json | null
          fecha: string | null
          id: string | null
          pedido_id: string | null
          persona: string | null
          persona_id: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_compras_pedido_pendiente: {
        Row: {
          cantidad: number | null
          cobra_por: string | null
          contenido: number | null
          descripcion: string | null
          devuelto: number | null
          devuelto_base: number | null
          devuelto_sin_repone: number | null
          excedente: number | null
          item_id: string | null
          orden: number | null
          pedido_id: string | null
          pedido_item_id: string | null
          pendiente: number | null
          recibido: number | null
          recibido_base: number | null
          recibido_base_completo: boolean | null
          remitos: number | null
          unidad: string | null
          unidad_base: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_pedido_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedido_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_pedido_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "compras_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_pedidos_eliminados: {
        Row: {
          creado_en: string | null
          creado_por_nombre: string | null
          eliminado_en: string | null
          eliminado_por_nombre: string | null
          id: string | null
          lineas: Json | null
          motivo: string | null
          numero: number | null
          pedido_id: string | null
          proveedor_id: string | null
          proveedor_nombre: string | null
        }
        Relationships: []
      }
      v_compras_proveedor_insumos: {
        Row: {
          activo: boolean | null
          cobra_por: string | null
          codigo_proveedor: string | null
          contenido: number | null
          es_principal: boolean | null
          item_estado: string | null
          item_id: string | null
          item_nombre: string | null
          precio_ref: number | null
          proveedor_id: string | null
          ultima_factura_fecha: string | null
          ultima_factura_id: string | null
          ultimo_precio: number | null
          ultimo_precio_por: string | null
          unidad: string | null
          unidad_base: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_item_proveedores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_item_proveedores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_item_proveedores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_item_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_stock_actual: {
        Row: {
          actualizado_en: string | null
          actualizado_por: string | null
          actualizado_por_nombre: string | null
          cantidad: number | null
          item_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_stock_actual_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_actual_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_actual_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_stock_actual_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_stock_movimientos: {
        Row: {
          anula_movimiento_id: string | null
          cantidad_antes: number | null
          cantidad_despues: number | null
          conteo_id: string | null
          creado_por_nombre: string | null
          created_at: string | null
          delta: number | null
          discrepancia_id: string | null
          factura_id: string | null
          id: string | null
          item_id: string | null
          item_nombre: string | null
          motivo: string | null
          remito_codigo: string | null
          remito_id: string | null
          revertido: boolean | null
          tipo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_stock_movimientos_anula_movimiento_id_fkey"
            columns: ["anula_movimiento_id"]
            isOneToOne: false
            referencedRelation: "compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_anula_movimiento_id_fkey"
            columns: ["anula_movimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "fabrica_conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_compras_conteos_historial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_fabrica_conteo_diferencias"
            referencedColumns: ["superado_por_conteo_id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_discrepancia_id_fkey"
            columns: ["discrepancia_id"]
            isOneToOne: false
            referencedRelation: "compras_factura_discrepancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_discrepancia_id_fkey"
            columns: ["discrepancia_id"]
            isOneToOne: false
            referencedRelation: "v_compras_factura_diferencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_compras_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_gastos"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_stock_movimientos_remito_id_fkey"
            columns: ["remito_id"]
            isOneToOne: false
            referencedRelation: "compras_remitos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fabrica_conteo_diferencias: {
        Row: {
          contado: number | null
          contado_en: string | null
          conteo_cerrado_en: string | null
          conteo_estado: string | null
          conteo_fecha: string | null
          conteo_id: string | null
          definicion_nombre: string | null
          diferencia: number | null
          diferencia_estado: string | null
          diferencia_mov_id: string | null
          diferencia_nota: string | null
          diferencia_resuelta_en: string | null
          diferencia_resuelta_por_nombre: string | null
          id: string | null
          item_id: string | null
          item_nombre: string | null
          movido_desde_cierre: number | null
          movido_mientras_contaba: number | null
          stock_hoy: number | null
          stock_teorico: number | null
          superado_por: string | null
          superado_por_conteo_id: string | null
          unidad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fabrica_conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "fabrica_conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_compras_conteos_historial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "v_fabrica_conteo_diferencias"
            referencedColumns: ["superado_por_conteo_id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_diferencia_mov_id_fkey"
            columns: ["diferencia_mov_id"]
            isOneToOne: false
            referencedRelation: "compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_diferencia_mov_id_fkey"
            columns: ["diferencia_mov_id"]
            isOneToOne: false
            referencedRelation: "v_compras_stock_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compras_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_insumos_resumen"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "fabrica_conteo_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fudo_gastos_pagados: {
        Row: {
          caja: string | null
          comprobante_url: string | null
          created_at: string | null
          descripcion: string | null
          fecha_gasto: string | null
          fecha_pago: string | null
          forma_pago: string | null
          fudo_expense_id: string | null
          id: string | null
          monto: number | null
          pagado_por: string | null
          pagado_por_nombre: string | null
          sucursal: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fudo_gastos_pagados_pagado_por_fkey"
            columns: ["pagado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_gastos: {
        Row: {
          caja: string | null
          categoria: string | null
          comprobante_url: string | null
          creado_por_nombre: string | null
          created_at: string | null
          estado: string | null
          factura_id: string | null
          factura_numero: string | null
          factura_pedido_numero: number | null
          fecha: string | null
          fecha_pago: string | null
          forma_pago: string | null
          id: string | null
          local: string | null
          monto: number | null
          observaciones: string | null
          pagado_por_nombre: string | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          rubro: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _compras_anular_nc_de_devolucion: {
        Args: {
          p_dev: Database["public"]["Tables"]["compras_devoluciones"]["Row"]
          p_motivo: string
        }
        Returns: Json
      }
      _compras_avisos_candidatos: {
        Args: { p_pedido_id: string; p_tipos: string[] }
        Returns: {
          cantidad: number
          codigo: string
          dias: number
          entidad_id: string
          huella: string
          insumo_nombre: string
          minimo: number
          numero: number
          pedido_id: string
          pendientes: number
          proveedor_nombre: string
          tipo: string
          unidad: string
        }[]
      }
      _compras_cant_txt: { Args: { p: number }; Returns: string }
      _compras_cobra_por: {
        Args: { p_item: string; p_prov: string }
        Returns: string
      }
      _compras_codigo_devolucion: {
        Args: { p_numero: number; p_secuencia: number }
        Returns: string
      }
      _compras_config_bool: {
        Args: { p_clave: string; p_default: boolean }
        Returns: boolean
      }
      _compras_config_num: {
        Args: { p_clave: string; p_default: number }
        Returns: number
      }
      _compras_crear_nota_credito: {
        Args: {
          p_devolucion: Database["public"]["Tables"]["compras_devoluciones"]["Row"]
          p_factura: Database["public"]["Tables"]["compras_facturas"]["Row"]
          p_fecha: string
          p_lineas: Json
          p_numero: string
          p_total_papel: number
        }
        Returns: {
          anulada_en: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          confirmada_en: string | null
          confirmada_por: string | null
          creado_por: string | null
          created_at: string
          estado: string
          factura_origen_id: string | null
          fecha: string
          fecha_vencimiento: string | null
          gasto_descontado: number | null
          gasto_forma_pago_anterior: string | null
          gasto_generado: boolean
          gasto_id: string | null
          id: string
          iva: number
          mercaderia_llego: boolean | null
          nc_gasto: string | null
          numero: string
          numero_normalizado: string | null
          observaciones: string | null
          pedido_id: string
          proveedor_id: string
          subtotal: number
          tipo_comprobante: string
          total: number
          total_papel: number | null
        }
        SetofOptions: {
          from: "*"
          to: "compras_facturas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _compras_devoluciones_esperan_nc: {
        Args: never
        Returns: {
          codigo: string
          desde: string
          devolucion_id: string
          numero: number
          pedido_id: string
          proveedor_nombre: string
          secuencia: number
        }[]
      }
      _compras_devuelto: {
        Args: { p_pedido_id: string }
        Returns: {
          devuelto: number
          devuelto_base: number
          devuelto_base_real: boolean
          devuelto_sin_repone: number
          item_id: string
          pedido_item_id: string
        }[]
      }
      _compras_exigir_proveedor_activo: {
        Args: { p_para: string; p_proveedor_id: string }
        Returns: undefined
      }
      _compras_exigir_sin_ajuste_factura: {
        Args: { p_accion: string; p_item_ids: string[]; p_pedido_id: string }
        Returns: undefined
      }
      _compras_insumos_bajo_minimo: {
        Args: never
        Returns: {
          cantidad: number
          en_pedido: boolean
          item_id: string
          minimo: number
          nombre: string
          unidad: string
        }[]
      }
      _compras_item_hist: {
        Args: {
          p_ant: string
          p_campo: string
          p_item: string
          p_lote: string
          p_nue: string
          p_prov: string
        }
        Returns: undefined
      }
      _compras_marcar_esperando_nc: {
        Args: { p_devolucion_id: string }
        Returns: undefined
      }
      _compras_nc_aplicar_gasto: { Args: { p_nc_id: string }; Returns: Json }
      _compras_nc_revertir_gasto: { Args: { p_nc_id: string }; Returns: Json }
      _compras_num_txt: { Args: { p: number }; Returns: string }
      _compras_par_tiene_historia: {
        Args: { p_item: string; p_prov: string }
        Returns: boolean
      }
      _compras_pedidos_abiertos_de: {
        Args: { p_proveedor_id: string }
        Returns: {
          id: string
          numero: number
        }[]
      }
      _compras_pedidos_con_diferencias: {
        Args: never
        Returns: {
          desde: string
          factura_id: string
          numero: number
          pedido_id: string
          pendientes: number
          proveedor_nombre: string
        }[]
      }
      _compras_pedidos_demorados: {
        Args: { p_dias: number }
        Returns: {
          dias: number
          enviado_en: string
          numero: number
          pedido_id: string
          proveedor_nombre: string
        }[]
      }
      _compras_pedidos_por_facturar: {
        Args: never
        Returns: {
          desde: string
          numero: number
          pedido_id: string
          proveedor_id: string
          proveedor_nombre: string
        }[]
      }
      _compras_pedidos_por_recibir: {
        Args: never
        Returns: {
          enviado_en: string
          numero: number
          pedido_id: string
          proveedor_nombre: string
        }[]
      }
      _compras_pesos_txt: { Args: { p: number }; Returns: string }
      _proveedores_referencias: {
        Args: { p_proveedor_id: string }
        Returns: Json
      }
      ajustar_stock_terminado_manual: {
        Args: { p_delta_kg: number; p_producto_id: string }
        Returns: undefined
      }
      cerrar_conteo_fabrica: { Args: { p_conteo_id: string }; Returns: string }
      compras_ajustar_stock: {
        Args: {
          p_cantidad_objetivo?: number
          p_item_id?: string
          p_motivo?: string
        }
        Returns: Json
      }
      compras_anular_devolucion: {
        Args: { p_devolucion_id?: string; p_motivo?: string }
        Returns: Json
      }
      compras_anular_factura: {
        Args: { p_factura_id?: string; p_motivo?: string }
        Returns: Json
      }
      compras_anular_nota_credito: {
        Args: { p_devolucion_id?: string; p_motivo?: string }
        Returns: Json
      }
      compras_archivar_insumo: {
        Args: { p_archivar?: boolean; p_item_id?: string }
        Returns: Json
      }
      compras_avisos_tomar: {
        Args: { p_pedido_id?: string; p_tipos?: string[] }
        Returns: {
          cantidad: number
          codigo: string
          dias: number
          entidad_id: string
          insumo_nombre: string
          minimo: number
          numero: number
          pedido_id: string
          pendientes: number
          proveedor_nombre: string
          repetido: boolean
          tipo: string
          unidad: string
        }[]
      }
      compras_buscar_gasto_candidato: {
        Args: { p_fecha?: string; p_monto?: number; p_proveedor_id?: string }
        Returns: {
          categoria: string
          estado: string
          fecha: string
          id: string
          local: string
          monto: number
          observaciones: string
        }[]
      }
      compras_cargar_nota_credito: {
        Args: {
          p_devolucion_id?: string
          p_fecha?: string
          p_lineas?: Json
          p_numero?: string
          p_total_papel?: number
        }
        Returns: Json
      }
      compras_cerrar_pedido_manual: {
        Args: { p_motivo: string; p_pedido_id: string }
        Returns: undefined
      }
      compras_confirmar_factura: {
        Args: {
          p_actualizar_precios?: boolean
          p_factura_id?: string
          p_gasto_existente_id?: string
          p_gasto_local?: string
          p_mercaderia_llego?: boolean
        }
        Returns: Json
      }
      compras_descartar_factura: {
        Args: { p_factura_id?: string }
        Returns: undefined
      }
      compras_diferencias_calculadas: {
        Args: { p_factura_id: string }
        Returns: {
          acreditada: number
          clave: string
          contenido: number
          descripcion: string
          devuelta: number
          facturada: number
          facturada_base: number
          facturada_base_real: boolean
          item_id: string
          pedido_item_id: string
          recibida: number
          recibida_base: number
          recibida_base_real: boolean
          unidad: string
          unidad_base: string
        }[]
      }
      compras_diff_lineas: {
        Args: { p_antes: Json; p_despues: Json }
        Returns: Json
      }
      compras_diff_lineas_remito: {
        Args: { p_antes: Json; p_despues: Json }
        Returns: Json
      }
      compras_eliminar_insumo: { Args: { p_item_id?: string }; Returns: Json }
      compras_eliminar_pedido: {
        Args: { p_motivo?: string; p_pedido_id?: string }
        Returns: undefined
      }
      compras_eliminar_remito: { Args: { p_remito_id: string }; Returns: Json }
      compras_guardar_factura: {
        Args: {
          p_factura_id?: string
          p_fecha?: string
          p_ids_conocidos?: string[]
          p_items?: Json
          p_numero?: string
          p_observaciones?: string
          p_pedido_id?: string
          p_total_papel?: number
          p_vencimiento?: string
        }
        Returns: Json
      }
      compras_guardar_insumo: {
        Args: { p_datos?: Json; p_item_id?: string; p_proveedores?: Json }
        Returns: Json
      }
      compras_guardar_mensaje_pedido: {
        Args: {
          p_local_facturacion_id?: string
          p_mensaje: string
          p_pedido_id: string
        }
        Returns: undefined
      }
      compras_guardar_pedido: {
        Args: {
          p_items?: Json
          p_local_facturacion_id?: string
          p_pedido_id?: string
          p_proveedor_id?: string
        }
        Returns: Json
      }
      compras_guardar_remito: {
        Args: {
          p_fecha?: string
          p_items?: Json
          p_numero?: string
          p_pedido_id?: string
          p_remito_id?: string
        }
        Returns: Json
      }
      compras_lineas_devolucion_snapshot: {
        Args: { p_devolucion_id: string }
        Returns: Json
      }
      compras_lineas_pedido_snapshot: {
        Args: { p_pedido_id: string }
        Returns: Json
      }
      compras_lineas_remito_snapshot: {
        Args: { p_remito_id: string }
        Returns: Json
      }
      compras_marcar_pedido_enviado: {
        Args: { p_pedido_id: string; p_reenvio?: boolean }
        Returns: undefined
      }
      compras_marcar_plantilla_default: {
        Args: { p_plantilla_id: string }
        Returns: undefined
      }
      compras_mover_stock: {
        Args: {
          p_anula_movimiento_id?: string
          p_conteo_id?: string
          p_delta: number
          p_devolucion_id?: string
          p_discrepancia_id?: string
          p_factura_id?: string
          p_item_id: string
          p_motivo?: string
          p_remito_id?: string
          p_tipo: string
        }
        Returns: string
      }
      compras_reabrir_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      compras_recalcular_diferencias_factura: {
        Args: { p_factura_id: string }
        Returns: undefined
      }
      compras_recalcular_estado_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      compras_registrar_devolucion: {
        Args: {
          p_diferencia_id?: string
          p_items?: Json
          p_motivo_id?: string
          p_nota?: string
          p_nota_credito?: Json
          p_pedido_id?: string
          p_repone?: boolean
        }
        Returns: Json
      }
      compras_registrar_evento_pedido: {
        Args: { p_detalle?: Json; p_pedido_id: string; p_tipo: string }
        Returns: string
      }
      compras_resolver_diferencia: {
        Args: {
          p_diferencia_id?: string
          p_nota?: string
          p_resolucion?: string
        }
        Returns: Json
      }
      compras_resolver_diferencias_conteo: {
        Args: {
          p_accion?: string
          p_conteo_id?: string
          p_item_ids?: string[]
          p_nota?: string
        }
        Returns: Json
      }
      compras_revertir_diferencia: {
        Args: { p_diferencia_id?: string }
        Returns: Json
      }
      compras_revertir_movimiento: {
        Args: { p_motivo?: string; p_movimiento_id?: string }
        Returns: Json
      }
      compras_sugerencias_sobrestock: {
        Args: { p_excluir_solicitud?: string }
        Returns: {
          cerrado_en: string
          conteo_id: string
          descuento: number
          exceso: number
          item_id: string
          nombre: string
          origen: string
          unidad: string
        }[]
      }
      compras_tablero_resumen: { Args: never; Returns: Json }
      compras_trazabilidad_insumo: {
        Args: { p_desde: string; p_hasta: string; p_item_id?: string }
        Returns: {
          categoria_nombre: string
          consumido_produccion: number
          contenido: number
          facturado_base: number
          facturado_cantidad: number
          facturado_neto: number
          facturado_total: number
          facturas: number
          item_estado: string
          item_id: string
          item_nombre: string
          mov_conteo: number
          mov_devolucion: number
          mov_factura: number
          mov_manual: number
          mov_otros: number
          mov_remitos: number
          pedido_cantidad: number
          pedidos: number
          pendiente_recibir: number
          precio_prom_base: number
          precio_prom_unidad: number
          proveedores_facturados: number
          recibido_base_real: number
          recibido_cantidad: number
          recibido_sin_pesar: number
          remitos: number
          stock_actual: number
          stock_fin: number
          stock_inicio: number
          ultimo_precio: number
          ultimo_precio_factura_id: string
          ultimo_precio_fecha: string
          ultimo_precio_por: string
          ultimo_precio_proveedor: string
          unidad: string
          unidad_base: string
        }[]
      }
      convertir_solicitud_a_pedidos: {
        Args: { p_solicitud_id: string }
        Returns: number
      }
      descartar_solicitud: {
        Args: { p_motivo?: string; p_solicitud_id: string }
        Returns: undefined
      }
      dia_fabrica: { Args: never; Returns: string }
      eliminar_congelado_fabrica: { Args: { p_id: string }; Returns: undefined }
      eliminar_conteo_fabrica: { Args: { p_id: string }; Returns: undefined }
      eliminar_devolucion_fabrica: {
        Args: { p_id: string }
        Returns: undefined
      }
      eliminar_produccion_fabrica: {
        Args: { p_id: string }
        Returns: undefined
      }
      es_admin: { Args: never; Returns: boolean }
      fabrica_confirmar_recepcion_pedido: {
        Args: { p_items: Json; p_items_nuevos?: Json; p_pedido_id: string }
        Returns: undefined
      }
      fabrica_guardar_cantidad_conteo: {
        Args: { p_cantidad?: number; p_conteo_item_id?: string }
        Returns: undefined
      }
      fabrica_marcar_pedido_enviado: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      fabrica_puede_editar_fecha: {
        Args: { p_fecha: string }
        Returns: boolean
      }
      fudo_deshacer_pago: { Args: { p_id?: string }; Returns: undefined }
      fudo_registrar_pago: {
        Args: {
          p_caja?: string
          p_comprobante_url?: string
          p_descripcion?: string
          p_fecha_gasto?: string
          p_fecha_pago?: string
          p_forma_pago?: string
          p_fudo_expense_id?: string
          p_monto?: number
          p_sucursal?: string
        }
        Returns: string
      }
      gastos_deshacer_pago: { Args: { p_id?: string }; Returns: undefined }
      gastos_eliminar: { Args: { p_id?: string }; Returns: undefined }
      gastos_guardar: {
        Args: {
          p_categoria?: string
          p_fecha?: string
          p_forma_pago?: string
          p_id?: string
          p_local?: string
          p_monto?: number
          p_observaciones?: string
          p_pago?: Json
          p_proveedor_id?: string
          p_rubro?: string
        }
        Returns: string
      }
      gastos_registrar_pago: {
        Args: {
          p_caja?: string
          p_comprobante_url?: string
          p_fecha_pago?: string
          p_forma_pago?: string
          p_id?: string
        }
        Returns: undefined
      }
      generar_solicitud_base: { Args: never; Returns: string }
      get_user_rol: { Args: never; Returns: string }
      guardar_congelado_fabrica: {
        Args: {
          p_cantidad_kg: number
          p_fecha: string
          p_id: string
          p_operario_fabrica_id: string
          p_presentacion_id: string
          p_sabor_id: string
          p_tamanio_id: string
        }
        Returns: string
      }
      guardar_devolucion_fabrica: {
        Args: {
          p_cantidad_kg: number
          p_destino: string
          p_fecha: string
          p_id: string
          p_motivo_id: string
          p_notas: string
          p_presentacion_id: string
          p_sabor_id: string
          p_tamanio_id: string
        }
        Returns: string
      }
      guardar_produccion_fabrica: {
        Args: {
          p_destino: string
          p_fecha: string
          p_fecula_kg: number
          p_id: string
          p_masa_kg: number
          p_operario_fabrica_id: string
          p_sabor_id: string
          p_tamanio_id: string
          p_turno: string
        }
        Returns: string
      }
      mover_stock_terminado: {
        Args: {
          p_delta_kg: number
          p_embolsado_id?: string
          p_pedido_id?: string
          p_producto_id: string
          p_tipo: string
        }
        Returns: undefined
      }
      proveedores_archivar: {
        Args: { p_archivar: boolean; p_id: string }
        Returns: Json
      }
      proveedores_eliminar: { Args: { p_id: string }; Returns: undefined }
      proveedores_guardar: {
        Args: { p_datos?: Json; p_id?: string }
        Returns: Json
      }
      proveedores_impacto: { Args: { p_id: string }; Returns: Json }
      recalcular_conciliacion: {
        Args: { p_fecha: string; p_local_id: string }
        Returns: undefined
      }
      reordenar_plantilla_base: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      tiene_acceso_compras: { Args: never; Returns: boolean }
      tiene_acceso_fabrica: { Args: never; Returns: boolean }
      tiene_lectura_conteos: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
