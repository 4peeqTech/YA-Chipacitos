'use client'

import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { puedeEntrarAdmin } from '@/lib/modulos'

interface Acceso {
  rol: string | null
  modulosPermitidos: string[]
}

// Sin proveedor (fuera de /admin) no se restringe nada: el proxy sigue
// siendo el que decide.
const Ctx = createContext<Acceso | null>(null)

/** Lo carga el layout de /admin con el rol y los módulos del usuario. */
export function ProveedorAcceso({ rol, modulosPermitidos, children }: Acceso & { children: ReactNode }) {
  return <Ctx.Provider value={{ rol, modulosPermitidos }}>{children}</Ctx.Provider>
}

/** Si el usuario puede abrir una ruta de /admin/* (mismo chequeo que proxy.ts). */
export function usePuedeEntrar() {
  const acceso = useContext(Ctx)
  return useCallback((href: string) => {
    if (!acceso) return true
    const pathname = href.split('?')[0]
    return puedeEntrarAdmin(pathname, acceso.rol, acceso.modulosPermitidos)
  }, [acceso])
}
