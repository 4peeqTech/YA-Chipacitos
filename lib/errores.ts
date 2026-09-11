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
}

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

  if (codigo === '23503') return 'No se puede borrar porque hay otros registros que lo están usando.'

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
