'use client'

import { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Devuelve una función que saca de la URL los params de un deep link
 * (`?pedido=`, `?remito=`…) sin recargar. Se llama al cerrar el modal que
 * abrió el link: si el param queda, recargar la página lo vuelve a abrir.
 */
export function useQuitarParams(...nombres: string[]) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const clave = nombres.join(',')

  return useCallback(() => {
    const quitar = clave.split(',')
    if (!quitar.some(n => params.has(n))) return
    const resto = new URLSearchParams(params.toString())
    for (const n of quitar) resto.delete(n)
    const query = resto.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [clave, params, pathname, router])
}

/**
 * Corre `alCambiar` cuando el valor de un deep link cambia sin que la página se
 * desmonte: un link a otro pedido desde la misma pantalla de Pedidos llega como
 * una prop nueva, y el estado inicial del modal ya no se vuelve a leer.
 */
export function useAlCambiarParam(valor: string | undefined, alCambiar: (valor: string) => void) {
  const [previo, setPrevio] = useState(valor)
  if (valor !== previo) {
    setPrevio(valor)
    if (valor) alCambiar(valor)
  }
}
