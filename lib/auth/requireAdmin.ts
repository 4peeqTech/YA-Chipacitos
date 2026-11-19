import { exigirApi } from '@/lib/permisos/servidor'

/**
 * Rutas API "solo Admin": lo que todavía no es una acción del catálogo de
 * permisos (épica roles y permisos, T3) y la base también reserva con es_admin().
 */
export async function requireAdmin() {
  return exigirApi('admin', 'Solo un administrador puede hacer esto')
}
