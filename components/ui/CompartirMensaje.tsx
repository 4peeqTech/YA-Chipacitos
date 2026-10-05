'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, MessageCircle, UserRoundSearch } from 'lucide-react'
import { useToast } from '@/components/ui/ProveedorUI'
import { linkWhatsApp } from '@/lib/compartir'

/** Copiar un mensaje y mandarlo por WhatsApp. Lo usan el pedido y la factura. */
export default function CompartirMensaje({
  mensaje,
  deshabilitado = false,
  telefono = null,
  etiquetaWhatsApp = 'Enviar por WhatsApp',
  ofrecerSinNumero = false,
  onCompartido,
}: {
  mensaje: string | null
  deshabilitado?: boolean
  /** Pedido: el del proveedor. Factura: el de la administración. */
  telefono?: string | null
  etiquetaWhatsApp?: string
  /** Con teléfono, suma "Elegir otro contacto" (WhatsApp sin número). */
  ofrecerSinNumero?: boolean
  onCompartido?: () => void
}) {
  const toast = useToast()
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Un mensaje nuevo arranca sin el "Copiado" del anterior.
  const [mensajePrevio, setMensajePrevio] = useState(mensaje)
  if (mensaje !== mensajePrevio) {
    setMensajePrevio(mensaje)
    setCopiado(false)
  }

  async function copiar() {
    if (!mensaje) return
    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiado(true)
      onCompartido?.()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Seleccioná el texto y copialo a mano.')
    }
  }

  function whatsapp(conNumero: boolean) {
    if (!mensaje) return
    window.open(linkWhatsApp(conNumero ? telefono : null, mensaje), '_blank')
    onCompartido?.()
  }

  const inactivo = deshabilitado || !mensaje

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        onClick={copiar}
        disabled={inactivo}
        className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50"
      >
        {copiado ? <Check size={16} className="text-success" /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar mensaje'}
      </button>
      <button
        type="button"
        onClick={() => whatsapp(true)}
        disabled={inactivo}
        className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
      >
        <MessageCircle size={16} /> {etiquetaWhatsApp}
      </button>
      {ofrecerSinNumero && telefono && (
        <button
          type="button"
          onClick={() => whatsapp(false)}
          disabled={inactivo}
          className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-muted hover:text-text hover:bg-surface2 disabled:opacity-50"
        >
          <UserRoundSearch size={16} /> Elegir otro contacto
        </button>
      )}
    </div>
  )
}
