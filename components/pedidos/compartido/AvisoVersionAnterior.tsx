'use client'

import { useEffect, useState } from 'react'
import { History, Info } from 'lucide-react'
import { obtenerInicioVersion } from '@/lib/pedidos/acciones'
import type { Pedido } from '@/lib/types'

// D13: asentar en pantalla el corte de versión. Va arriba de los historiales
// (local, mayorista y conciliación). Cada pedido viejo lleva su marca.

function formatoFecha(iso: string) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

interface Props {
  /** Fecha del corte (YYYY-MM-DD). Si no se pasa, se lee con pedidos_inicio_version(). */
  fecha?: string | null
  className?: string
}

export default function AvisoVersionAnterior({ fecha: fechaProp, className = '' }: Props) {
  const [fechaLeida, setFechaLeida] = useState<string | null>(null)
  const fecha = fechaProp ?? fechaLeida

  useEffect(() => {
    if (fechaProp !== undefined) return
    let vigente = true
    // Si falla la lectura el aviso se muestra igual, sin la fecha.
    obtenerInicioVersion().then(r => { if (vigente && r.ok) setFechaLeida(r.data) })
    return () => { vigente = false }
  }, [fechaProp])

  return (
    <div role="note" className={`flex items-start gap-2.5 rounded-xl border border-border bg-surface2 px-4 py-3 ${className}`}>
      <Info size={16} className="text-info shrink-0 mt-0.5" aria-hidden />
      <p className="text-xs text-muted leading-relaxed">
        Los pedidos anteriores {fecha ? <>al <strong className="text-text">{formatoFecha(fecha)}</strong></> : 'a la versión nueva'} son
        de la versión anterior del sistema. Los que quedaron en camino se cerraron como recibidos
        automáticamente y pueden no reflejar lo que llegó.
      </p>
    </div>
  )
}

/** Marcas "Versión anterior" y "Cerrado automáticamente" de un pedido. No muestra nada si no aplica. */
export function MarcaVersionAnterior({ pedido }: { pedido: Pick<Pedido, 'version_anterior' | 'cierre_automatico'> }) {
  if (!pedido.version_anterior && !pedido.cierre_automatico) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {pedido.version_anterior && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-surface2 text-faint border border-border">
          <History size={11} aria-hidden />
          Versión anterior
        </span>
      )}
      {pedido.cierre_automatico && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-warning-bg text-warning">
          Cerrado automáticamente
        </span>
      )}
    </span>
  )
}
