'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { IconDeviceMobileDown, IconX } from '@tabler/icons-react'

// Si lo cerró, no se vuelve a mostrar en este dispositivo.
const CLAVE_CERRADO = 'instalar-app-cerrado'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [visible, setVisible] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const yaInstalada =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (yaInstalada) return
    try { if (localStorage.getItem(CLAVE_CERRADO)) return } catch {}

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // iOS Safari nunca dispara beforeinstallprompt — mostramos instrucción manual.
    const ua = window.navigator.userAgent
    const esIos = /iphone|ipad|ipod/i.test(ua)
    const esSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
    if (esIos && esSafari) {
      // Solo se sabe en el navegador (window): tiene que ser después de montar, no en el render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIosHint(true)
      setVisible(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  async function instalar() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  function cerrar() {
    setVisible(false)
    try { localStorage.setItem(CLAVE_CERRADO, '1') } catch {}
  }

  // En el login no: ahí no hay menú abajo y quedaba encima del botón Ingresar.
  if (!visible || pathname === '/login') return null

  return (
    <div className="lg:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 -translate-x-1/2 z-40 bg-surface border border-border border-t-2 border-t-accent rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3 max-w-[92vw]">
      {iosHint ? (
        <p className="text-xs text-text">
          <IconDeviceMobileDown size={16} className="mr-1 inline align-[-3px] text-accent" aria-hidden />Para instalar: tocá <strong>Compartir</strong> y después <strong>“Agregar a pantalla de inicio”</strong>
        </p>
      ) : (
        <>
          <p className="text-xs text-text flex-1 whitespace-nowrap"><IconDeviceMobileDown size={16} className="mr-1 inline align-[-3px] text-accent" aria-hidden />Instalá la app en tu celular</p>
          <button onClick={instalar} className="bg-accent text-black text-xs font-['Syne'] font-bold px-3 py-1.5 rounded-lg cursor-pointer shrink-0">
            Instalar
          </button>
        </>
      )}
      <button onClick={cerrar} aria-label="No mostrar más" title="No mostrar más" className="text-muted hover:text-text cursor-pointer shrink-0"><IconX size={16} /></button>
    </div>
  )
}
