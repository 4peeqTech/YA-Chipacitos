'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

// Carrito del local guardado en localStorage, para que sobreviva a una
// recarga. Se lee con useSyncExternalStore: en el servidor (y en el primer
// render del cliente) el carrito está vacío, así no hay desfasaje de
// hidratación. Si el navegador no deja usar localStorage (modo privado,
// datos bloqueados), queda en memoria mientras dure la pestaña.

export interface LineaGuardada { producto_id: string; cantidad: number }
export interface CarritoGuardado { lineas: LineaGuardada[]; notas: string }

const VACIO: CarritoGuardado = { lineas: [], notas: '' }
const EVENTO = 'carrito-local-cambio'
const enMemoria = new Map<string, string>()

function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave)
  } catch {
    return enMemoria.get(clave) ?? null
  }
}

function escribir(clave: string, valor: string | null) {
  try {
    if (valor == null) window.localStorage.removeItem(clave)
    else window.localStorage.setItem(clave, valor)
  } catch {
    if (valor == null) enMemoria.delete(clave)
    else enMemoria.set(clave, valor)
  }
  window.dispatchEvent(new Event(EVENTO))
}

function suscribir(cb: () => void) {
  window.addEventListener(EVENTO, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENTO, cb)
    window.removeEventListener('storage', cb)
  }
}

function parsear(raw: string | null): CarritoGuardado {
  if (!raw) return VACIO
  try {
    const v = JSON.parse(raw) as Partial<CarritoGuardado>
    const lineas = Array.isArray(v.lineas)
      ? v.lineas.filter(l => l && typeof l.producto_id === 'string' && typeof l.cantidad === 'number' && l.cantidad > 0)
      : []
    return { lineas, notas: typeof v.notas === 'string' ? v.notas : '' }
  } catch {
    return VACIO
  }
}

export function useCarritoGuardado(clave: string) {
  const raw = useSyncExternalStore(suscribir, () => leer(clave), () => null)
  const carrito = useMemo(() => parsear(raw), [raw])

  const actualizar = useCallback((fn: (c: CarritoGuardado) => CarritoGuardado) => {
    const siguiente = fn(parsear(leer(clave)))
    escribir(clave, siguiente.lineas.length === 0 && !siguiente.notas ? null : JSON.stringify(siguiente))
  }, [clave])

  return [carrito, actualizar] as const
}
