'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const yaInstalada =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (yaInstalada) return

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

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[500] bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3 max-w-[92vw]">
      {iosHint ? (
        <p className="text-xs text-[#f0f0f0]">
          📲 Para instalar: tocá <strong>Compartir</strong> y después <strong>"Agregar a pantalla de inicio"</strong>
        </p>
      ) : (
        <>
          <p className="text-xs text-[#f0f0f0] flex-1 whitespace-nowrap">📲 Instalá la app en tu celular</p>
          <button onClick={instalar} className="bg-[#e8c547] text-black text-xs font-['Syne'] font-bold px-3 py-1.5 rounded-lg cursor-pointer shrink-0">
            Instalar
          </button>
        </>
      )}
      <button onClick={() => setVisible(false)} className="text-[#888] text-sm cursor-pointer shrink-0">✕</button>
    </div>
  )
}
