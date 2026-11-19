'use client'

import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { puedeEntrarRuta, type AccesoUsuario } from '@/lib/permisos/acceso'

// Sin proveedor (fuera de /admin) no se restringe nada: el proxy sigue
// siendo el que decide.
const Ctx = createContext<AccesoUsuario | null>(null)

/** Lo carga el layout de /admin con el acceso efectivo (épica roles y permisos, T3). */
export function ProveedorAcceso({ acceso, children }: { acceso: AccesoUsuario; children: ReactNode }) {
  return <Ctx.Provider value={acceso}>{children}</Ctx.Provider>
}

/** El acceso de quien está logueado, dentro de /admin (null fuera). */
export function useAcceso(): AccesoUsuario | null {
  return useContext(Ctx)
}

/** Si el usuario puede abrir una ruta (mismo chequeo que proxy.ts). */
export function usePuedeEntrar() {
  const acceso = useContext(Ctx)
  return useCallback((href: string) => {
    if (!acceso) return true
    return puedeEntrarRuta(acceso, href.split('?')[0]).ok
  }, [acceso])
}
