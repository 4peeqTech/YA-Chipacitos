'use client'

import { useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import { TicketWidget } from '@4peeqtech/ticket-widget'
import { TICKET_WIDGET_CONFIG } from '@/lib/ticketWidget'

interface Props {
  usuarioEmail?: string
  usuarioNombre?: string
  /** 'tarjeta' al pie de una sección; 'enlace' como acceso chico en el índice; 'boton' dentro de un vacío. */
  variante?: 'tarjeta' | 'enlace' | 'boton'
}

export default function ReportarProblema({ usuarioEmail, usuarioNombre, variante = 'tarjeta' }: Props) {
  const [abierto, setAbierto] = useState(false)

  const widget = (
    <TicketWidget
      isOpen={abierto}
      onClose={() => setAbierto(false)}
      endpoint={TICKET_WIDGET_CONFIG.endpoint}
      appOrigen={TICKET_WIDGET_CONFIG.appOrigen}
      empresaNombre={TICKET_WIDGET_CONFIG.empresaNombre}
      usuarioEmail={usuarioEmail}
      usuarioNombre={usuarioNombre}
      logoUrl={TICKET_WIDGET_CONFIG.logoUrl}
    />
  )

  if (variante === 'boton') {
    return (
      <>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent/60 px-4 text-sm font-medium text-text transition-colors hover:bg-accent-bg"
        >
          <LifeBuoy size={16} /> Contanos qué te faltó
        </button>
        {widget}
      </>
    )
  }

  if (variante === 'enlace') {
    return (
      <>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted transition-colors hover:text-text"
        >
          <LifeBuoy size={16} /> ¿Encontraste un error o te falta algo? <span className="font-medium text-text underline decoration-accent decoration-2 underline-offset-4">Reportalo</span>
        </button>
        {widget}
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center">
        <LifeBuoy size={22} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">¿No encontraste lo que buscabas?</p>
          <p className="mt-0.5 text-xs text-muted">Contanos qué te faltó o qué no funciona, y lo resolvemos.</p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="min-h-11 shrink-0 rounded-xl border border-accent/60 px-4 text-sm font-medium text-text transition-colors hover:bg-accent-bg"
        >
          Reportar un problema
        </button>
      </div>
      {widget}
    </>
  )
}
