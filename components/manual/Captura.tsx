'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Maximize2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import type { Captura as CapturaTipo } from '@/lib/manual/tipos'

/** Captura de pantalla de un paso: miniatura que se amplía en un modal. */
export default function Captura({ captura }: { captura: CapturaTipo }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={`Ampliar captura: ${captura.alt}`}
        className="group relative mt-3 block w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface2 text-left transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Image src={captura.src} alt={captura.alt} width={captura.ancho} height={captura.alto} className="h-auto w-full" />
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/70 px-2 py-1 text-2xs font-medium text-white opacity-90 transition-opacity group-hover:opacity-100">
          <Maximize2 size={12} /> Ampliar
        </span>
      </button>
      <Modal open={abierta} onClose={() => setAbierta(false)} title={captura.alt} size="2xl">
        <Image src={captura.src} alt={captura.alt} width={captura.ancho} height={captura.alto} className="h-auto w-full rounded-lg" />
      </Modal>
    </>
  )
}
