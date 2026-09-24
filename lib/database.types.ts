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
      compras_item_proveedores: {
        Row: {
          activo: boolean
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
          cantidad_por_masa: number
          cantidad_por_unidad: number
          categoria_id: string | null
          created_at: string | null
          estado: string
          id: string
          nombre: string
          precio: number | null
          redondeo: string
          stock_maximo: number | null
          stock_minimo: number
          unidad: string | null
        }
        Insert: {
          a_demanda?: boolean
          cantidad_por_masa?: number
          cantidad_por_unidad?: number
          categoria_id?: string | null
          created_at?: string | null
          estado?: string
          id?: string
          nombre: string
          precio?: number | null
          redondeo?: string
          stock_maximo?: number | null
          stock_minimo?: number
          unidad?: string | null
        }
        Update: {
          a_demanda?: boolean
          cantidad_por_masa?: number
          cantidad_por_unidad?: number
          categoria_id?: string | null
          created_at?: string | null
          estado?: string
          id?: string
          nombre?: string
          precio?: number | null
          redondeo?: string
          stock_maximo?: number | null
          stock_minimo?: number
          unidad?: string | null
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
      compras_pedido_items: {
        Row: {
          cantidad: number
          descripcion: string
          id: string
          item_id: string | null
          orden: number
          pedido_id: string
          unidad: string | null
        }
        Insert: {
          cantidad?: number
          descripcion: string
          id?: string
          item_id?: string | null
          orden?: number
          pedido_id: string
          unidad?: string | null
        }
        Update: {
          cantidad?: number
          descripcion?: string
          id?: string
          item_id?: string | null
          orden?: number
          pedido_id?: string
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
      compras_pedidos: {
        Row: {
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
        }
        Insert: {
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
        }
        Update: {
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
        }
        Relationships: [
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
          updated_at?: string
        }
        Relationships: []
      }
      compras_remito_items: {
        Row: {
          cantidad: number
          descripcion: string
          id: string
          item_id: string | null
          pedido_item_id: string | null
          precio: number | null
          remito_id: string
        }
        Insert: {
          cantidad?: number
          descripcion: string
          id?: string
          item_id?: string | null
          pedido_item_id?: string | null
          precio?: number | null
          remito_id: string
        }
        Update: {
          cantidad?: number
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
          fecha: string
          id: string
          numero: string
          pedido_id: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string | null
          fecha: string
          id?: string
          numero: string
          pedido_id: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string | null
          fecha?: string
          id?: string
          numero?: string
          pedido_id?: string
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
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_stock_movimientos: {
        Row: {
          conteo_id: string | null
          creado_por: string | null
          created_at: string
          delta: number
          id: string
          item_id: string
          remito_id: string | null
          tipo: string
        }
        Insert: {
          conteo_id?: string | null
          creado_por?: string | null
          created_at?: string
          delta: number
          id?: string
          item_id: string
          remito_id?: string | null
          tipo: string
        }
        Update: {
          conteo_id?: string | null
          creado_por?: string | null
          created_at?: string
          delta?: number
          id?: string
          item_id?: string
          remito_id?: string | null
          tipo?: string
        }
        Relationships: [
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
            foreignKeyName: "compras_stock_movimientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
          conteo_id: string
          descuento_base_sugerido: number | null
          exceso: number | null
          id: string
          item_id: string
          meta: number | null
          modo_calculo: string | null
          necesidad: number | null
          redondeo: string | null
          sobrestock: boolean
          sugerido: number | null
          unidad_compra: string | null
        }
        Insert: {
          cantidad?: number
          cantidad_fija?: number | null
          cantidad_por_masa?: number | null
          cantidad_por_unidad?: number | null
          conteo_id: string
          descuento_base_sugerido?: number | null
          exceso?: number | null
          id?: string
          item_id: string
          meta?: number | null
          modo_calculo?: string | null
          necesidad?: number | null
          redondeo?: string | null
          sobrestock?: boolean
          sugerido?: number | null
          unidad_compra?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_fija?: number | null
          cantidad_por_masa?: number | null
          cantidad_por_unidad?: number | null
          conteo_id?: string
          descuento_base_sugerido?: number | null
          exceso?: number | null
          id?: string
          item_id?: string
          meta?: number | null
          modo_calculo?: string | null
          necesidad?: number | null
          redondeo?: string | null
          sobrestock?: boolean
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
          local: string | null
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
          local?: string | null
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
          local?: string | null
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
          fecha: string | null
          id: string | null
          masas_proyectadas: number | null
          semana_desde: string | null
          semana_hasta: string | null
        }
        Relationships: []
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
          detalle: string | null
          fecha: string | null
          pedido_id: string | null
          persona: string | null
          remito_id: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_compras_pedido_pendiente: {
        Row: {
          cantidad: number | null
          descripcion: string | null
          excedente: number | null
          item_id: string | null
          orden: number | null
          pedido_id: string | null
          pedido_item_id: string | null
          pendiente: number | null
          recibido: number | null
          remitos: number | null
          unidad: string | null
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
            referencedRelation: "v_compras_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compras_stock_movimientos: {
        Row: {
          conteo_id: string | null
          creado_por_nombre: string | null
          created_at: string | null
          delta: number | null
          id: string | null
          item_id: string | null
          item_nombre: string | null
          remito_id: string | null
          tipo: string | null
        }
        Relationships: [
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
    }
    Functions: {
      ajustar_stock_terminado_manual: {
        Args: { p_delta_kg: number; p_producto_id: string }
        Returns: undefined
      }
      cerrar_conteo_fabrica: { Args: { p_conteo_id: string }; Returns: string }
      compras_cerrar_pedido_manual: {
        Args: { p_motivo: string; p_pedido_id: string }
        Returns: undefined
      }
      compras_eliminar_pedido: {
        Args: { p_pedido_id: string }
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
      compras_marcar_pedido_enviado: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      compras_reabrir_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      compras_recalcular_estado_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
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
      fabrica_marcar_pedido_enviado: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      fabrica_puede_editar_fecha: {
        Args: { p_fecha: string }
        Returns: boolean
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
