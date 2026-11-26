'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirmar } from '@/components/ui/ProveedorUI'

// Mientras `hayCambios`, avisa antes de perderlos: al recargar o cerrar la
// pestaña (beforeunload, el navegador pone su propio texto) y al tocar un link
// a otra pantalla de la app (el menú, la barra inferior), que en Next es
// navegación del cliente y no dispara beforeunload. Ese link se frena y, si se
// confirma, se navega con el router.
export function useAvisoSinGuardar(hayCambios: boolean) {
  const router = useRouter()
  const confirmar = useConfirmar()
  const refs = useRef({ router, confirmar })
  useEffect(() => { refs.current = { router, confirmar } })

  useEffect(() => {
    if (!hayCambios) return
    const alSalir = (e: BeforeUnloadEvent) => { e.preventDefault() }
    const alTocarLink = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const destino = new URL(a.href, location.href)
      if (destino.origin !== location.origin || destino.pathname === location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      refs.current.confirmar({
        titulo: 'Cambios sin guardar',
        mensaje: 'Si salís de esta pantalla, los cambios se pierden.',
        textoConfirmar: 'Salir sin guardar',
        textoCancelar: 'Seguir editando',
        peligroso: true,
        onConfirmar: () => refs.current.router.push(destino.pathname + destino.search + destino.hash),
      })
    }
    window.addEventListener('beforeunload', alSalir)
    document.addEventListener('click', alTocarLink, true)
    return () => {
      window.removeEventListener('beforeunload', alSalir)
      document.removeEventListener('click', alTocarLink, true)
    }
  }, [hayCambios])
}
