import { requireRolApi } from './requireRol'

/** Copiado antes en ~10 API routes (ver ARQUITECTURA.md §8, Q4) — extraído acá.
 * Ahora es un caso particular de requireRol(['admin']). */
export async function requireAdmin() {
  return requireRolApi(['admin'], 'Solo un administrador puede hacer esto')
}
