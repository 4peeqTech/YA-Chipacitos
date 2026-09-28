'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useToast } from './ProveedorUI'

/**
 * Cuenta por qué el usuario terminó en una pantalla que no pidió. proxy.ts
 * rebota los links a módulos sin permiso (una notificación de Facturas, por
 * ejemplo) y agrega `?sinAcceso=<pantalla>`: sin este aviso, el rebote es
 * invisible y parece que el link está roto.
 *
 * El parámetro se saca de la URL enseguida, así el toast no vuelve a salir al
 * recargar ni queda en un link compartido.
 */
export default function AvisoRedireccion() {
  const toast = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const sinAcceso = params.get('sinAcceso')
  const avisado = useRef<string | null>(null)

  useEffect(() => {
    if (!sinAcceso || avisado.current === sinAcceso) return
    avisado.current = sinAcceso
    toast.error(`No tenés acceso a ${sinAcceso}. Pedile a un administrador que te lo habilite.`)
    const resto = new URLSearchParams(params.toString())
    resto.delete('sinAcceso')
    const query = resto.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [sinAcceso, params, pathname, router, toast])

  return null
}
