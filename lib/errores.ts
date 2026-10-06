/**
 * Traduce errores de Supabase/Postgres y de red a mensajes en español que un
 * usuario final puede entender. El crudo siempre se loguea a consola para
 * debugging; nunca llega a pantalla salvo que ya sea texto para el usuario
 * (un `raise exception` nuestro, código P0001).
 */

const CONSTRAINTS: Record<string, string> = {
  fabrica_conteos_definicion_fecha_cerrado_unique:
    'Ya hay un conteo cerrado de esta lista para hoy. Si hay que rehacerlo, pedile a Compras que descarte la solicitud.',
  fabrica_conteos_un_borrador_por_definicion:
    'Ya hay un conteo abierto de esta lista. Recargá la página.',
  compras_solicitudes_conteo_unique:
    'Este conteo ya generó una solicitud.',
  compras_items_stock_maximo_positivo:
    'El stock máximo tiene que ser mayor a 0. Dejalo vacío si el insumo no tiene tope.',
  compras_remitos_pedido_secuencia_key:
    'Otra persona cargó un remito de este pedido al mismo tiempo. Probá guardar de nuevo.',
  compras_stock_movimientos_anula_unico:
    'Ese ajuste ya se revirtió. Recargá la página para ver el historial al día.',
  compras_stock_movimientos_delta_no_cero:
    'El movimiento no cambia el stock: no hay nada que registrar.',
  compras_facturas_numero_unique:
    'Ya cargaste una factura con ese número para este proveedor. Buscala por su número en la lista de facturas.',
  compras_facturas_una_por_pedido:
    'Ese pedido ya tiene una factura. Abrila desde la lista de facturas o anulala para cargar otra.',
  compras_factura_items_pedido_item_id_fkey:
    'Esa línea del pedido ya está facturada: no se puede borrar. Anulá la factura primero.',
  compras_items_alicuota_iva_valida:
    'Esa alícuota de IVA no existe. Elegí una de la lista: 0, 2,5, 5, 10,5, 21 o 27 %.',
  compras_factura_items_alicuota_iva_check:
    'Esa alícuota de IVA no existe. Elegí una de la lista: 0, 2,5, 5, 10,5, 21 o 27 %.',
  compras_facturas_gasto_unico:
    'Ese gasto ya está vinculado a otra factura. Recargá la página y elegí de nuevo.',
  fudo_gastos_pagados_unico:
    'Ese gasto de Fudo ya tiene el pago registrado. Recargá la página para verlo al día.',
  compras_factura_discrepancias_clave_unica:
    'Otra persona actualizó las diferencias de esta factura al mismo tiempo. Recargá la página.',
  // B4
  compras_devolucion_motivos_nombre_unico:
    'Ya hay un motivo con ese nombre.',
  compras_devolucion_motivos_flags_validos:
    'Un motivo que devuelve mercadería no puede ser a la vez una corrección de precio.',
  compras_devoluciones_motivo_id_fkey:
    'Ese motivo ya se usó en devoluciones: desactivalo en vez de borrarlo.',
  compras_devoluciones_pedido_secuencia_key:
    'Otra persona registró una devolución de este pedido al mismo tiempo. Probá de nuevo.',
  compras_devoluciones_nc_unica:
    'Esa nota de crédito ya está asociada a otra devolución. Recargá la página.',
  compras_devolucion_items_factura_item_id_fkey:
    'Esa línea de la factura tiene una corrección de precio registrada: anulá esa devolución primero.',
}

/** B4: el mismo unique de número, cuando lo que se guardaba era una nota de crédito. */
export const MENSAJE_NC_REPETIDA = 'Ya cargaste una nota de crédito con ese número para este proveedor.'

function extraerMensaje(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message ?? '')
  return ''
}

function extraerCodigo(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    return code != null ? String(code) : undefined
  }
  return undefined
}

export function mensajeError(error: unknown, fallback: string): string {
  console.error(error)

  const mensaje = extraerMensaje(error)
  const codigo = extraerCodigo(error)

  if (codigo === 'P0001') return mensaje || fallback

  if (codigo === '23505') {
    const match = mensaje.match(/unique constraint "([^"]+)"/)
    const constraint = match?.[1]
    return (constraint && CONSTRAINTS[constraint]) || 'Ya existe un registro con esos datos.'
  }

  if (codigo === '23503') {
    const constraint = mensaje.match(/foreign key constraint "([^"]+)"/)?.[1]
    return (constraint && CONSTRAINTS[constraint]) || 'No se puede borrar porque hay otros registros que lo están usando.'
  }

  if (codigo === '23514') {
    const constraint = mensaje.match(/check constraint "([^"]+)"/)?.[1]
    if (constraint && CONSTRAINTS[constraint]) return CONSTRAINTS[constraint]
  }

  if (codigo === '23502' || codigo === '23514' || codigo === '22P02' || codigo === '22003') {
    return 'Hay un dato incompleto o mal cargado. Revisá el formulario.'
  }

  if (codigo === '42501' || codigo === 'PGRST301') return 'No tenés permiso para hacer esto.'

  if (codigo === 'PGRST116') return 'No encontramos ese registro. Puede que alguien lo haya borrado.'

  if (/Failed to fetch|NetworkError|fetch failed/i.test(mensaje)) {
    return 'Sin conexión. Revisá internet y probá de nuevo.'
  }

  if (/JWT expired|Invalid Refresh Token/i.test(mensaje)) {
    return 'Tu sesión expiró. Volvé a iniciar sesión.'
  }

  return fallback
}
