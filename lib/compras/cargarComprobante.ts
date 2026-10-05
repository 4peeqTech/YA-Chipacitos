import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { armarComprobante, type DatosComprobante } from './comprobanteFactura'

// Una sola fuente para la imagen (ruta /api/compras/facturas/[id]/comprobante)
// y el mensaje (server action datosCompartirFactura): no pueden decir cosas
// distintas. Corre con la sesión del usuario (nada de service role): la vista y
// las tablas de factura ya filtran con es_admin().

export type CargaComprobante =
  | { ok: true; data: DatosComprobante }
  | { ok: false; status: 401 | 403 | 404 | 409 | 500; error: string }

export async function cargarComprobante(supabase: SupabaseClient<Database>, facturaId: string): Promise<CargaComprobante> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Iniciá sesión' }

  const { data: perfil } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).maybeSingle()
  if (perfil?.rol !== 'admin') return { ok: false, status: 403, error: 'Solo un administrador puede compartir facturas' }

  const { data: f, error: errorFactura } = await supabase
    .from('v_compras_facturas')
    .select('id, numero, fecha, fecha_vencimiento, subtotal, iva, total, estado, tipo_comprobante, gasto_estado, confirmada_en, confirmada_por_nombre, pedido_id, proveedor_id')
    .eq('id', facturaId)
    .maybeSingle()
  if (errorFactura) {
    console.error(errorFactura)
    return { ok: false, status: 500, error: 'No se pudo leer la factura' }
  }
  if (!f?.id) return { ok: false, status: 404, error: 'La factura no existe' }
  if (f.tipo_comprobante !== 'factura') return { ok: false, status: 409, error: 'Por ahora solo se comparten facturas' }
  if (f.estado === 'anulada') return { ok: false, status: 409, error: 'La factura está anulada: no se comparte' }
  if (f.estado !== 'confirmada') return { ok: false, status: 409, error: 'Confirmá la factura antes de compartirla' }

  const [items, pedido, proveedor] = await Promise.all([
    supabase
      .from('compras_factura_items')
      .select('descripcion, cantidad, unidad, precio_unitario, alicuota_iva, subtotal')
      .eq('factura_id', facturaId)
      .order('orden'),
    supabase
      .from('compras_pedidos')
      .select('numero, local_facturacion_id, locales_facturacion(razon_social, cuit, sucursal), compras_remitos(secuencia)')
      .eq('id', f.pedido_id!)
      .maybeSingle(),
    supabase.from('proveedores').select('nombre, cuit').eq('id', f.proveedor_id!).maybeSingle(),
  ])
  const fallaLectura = items.error ?? pedido.error ?? proveedor.error
  if (fallaLectura || !pedido.data || !proveedor.data) {
    if (fallaLectura) console.error(fallaLectura)
    return { ok: false, status: 500, error: 'No se pudo leer la factura' }
  }

  return {
    ok: true,
    data: armarComprobante({
      factura: {
        id: f.id,
        numero: f.numero ?? '',
        fecha: f.fecha!,
        fecha_vencimiento: f.fecha_vencimiento,
        subtotal: f.subtotal ?? 0,
        iva: f.iva ?? 0,
        total: f.total ?? 0,
        gasto_estado: f.gasto_estado,
        confirmada_en: f.confirmada_en,
        confirmada_por_nombre: f.confirmada_por_nombre,
      },
      pedidoNumero: pedido.data.numero,
      items: items.data ?? [],
      remitos: pedido.data.compras_remitos ?? [],
      local: pedido.data.locales_facturacion ?? null,
      proveedor: proveedor.data,
      generadoPor: perfil.nombre ?? 'Administración',
      ahora: new Date().toISOString(),
    }),
  }
}
