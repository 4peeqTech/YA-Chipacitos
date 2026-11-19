import { cache } from 'react'
import { exigirSesion } from '@/lib/permisos/servidor'
import { homeDe, pantallasDe } from '@/lib/permisos/acceso'
import type { Lector } from '@/lib/manual'

/** Usuario que lee el manual — compartido por el layout y las páginas de /ayuda en el mismo request. */
export const obtenerLector = cache(async () => {
  const { acceso } = await exigirSesion()
  const lector: Lector = {
    rol: acceso.rol,
    esAdmin: acceso.esAdmin,
    administracion: !acceso.esAdmin && acceso.areas.includes('administracion'),
    modulos: pantallasDe(acceso),
  }
  return { lector, inicio: homeDe(acceso), email: acceso.email, nombre: acceso.nombre as string | undefined }
})
