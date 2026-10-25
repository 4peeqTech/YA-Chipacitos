'use client'

import { IconBell } from '@tabler/icons-react'
import { useAvisosPush } from '@/lib/hooks/useAvisosPush'
import { Puntos } from '@/components/ui/Cargando'

// Cartel "Activar notificaciones": solo mientras nunca se respondió el permiso.
// Una vez activadas (o si se negaron) no aparece más; activar o desactivar los
// avisos de este dispositivo queda en el panel de la campana.

interface Props {
  tituloActivar?: string
  descripcionActivar?: string
  /** Ya no se usan (el estado activo/inactivo vive en la campana); quedan por compatibilidad. */
  descripcionActiva?: string
  descripcionInactiva?: string
}

export default function PushToggle({
  tituloActivar = 'Activar notificaciones',
  descripcionActivar = 'Te avisamos apenas pase algo, aunque cierres la pestaña.',
}: Props) {
  const { estado, ocupado, activar } = useAvisosPush()
  if (estado !== 'pedir') return null

  return (
    <div className="bg-accent-bg border border-accent/30 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-accent">
          <IconBell size={16} aria-hidden /> {tituloActivar}
        </p>
        <p className="text-xs text-muted mt-0.5">{descripcionActivar} Después lo podés cambiar desde la campana.</p>
      </div>
      <button onClick={activar} disabled={ocupado}
        className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-accent text-black text-xs font-['Syne'] font-bold px-4 py-2 rounded-lg whitespace-nowrap disabled:opacity-70">
        {ocupado ? <><Puntos /> Activando</> : 'Activar'}
      </button>
    </div>
  )
}
