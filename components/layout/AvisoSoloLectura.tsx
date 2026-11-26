'use client'

import { useEffect, useState } from 'react'
import { IconLock } from '@tabler/icons-react'
import { EVENTO_BLOQUEO } from '@/lib/permisos/verComo'

// "Ver como" (T7): cuando el cliente de Supabase corta una escritura, lo dice acá,
// arriba de todo (también de los modales), aunque la pantalla muestre su propio error.
export default function AvisoSoloLectura({ nombre }: { nombre: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const mostrar = () => {
      setVisible(true)
      clearTimeout(timer)
      timer = setTimeout(() => setVisible(false), 6000)
    }
    window.addEventListener(EVENTO_BLOQUEO, mostrar)
    return () => { window.removeEventListener(EVENTO_BLOQUEO, mostrar); clearTimeout(timer) }
  }, [])

  if (!visible) return null
  return (
    <div role="alert" className="fixed left-1/2 -translate-x-1/2 top-16 z-[1100] w-[calc(100%-2rem)] max-w-md bg-black text-white rounded-xl shadow-lg px-4 py-3 flex items-start gap-2 text-sm">
      <IconLock size={18} className="shrink-0 mt-0.5 text-accent2" aria-hidden />
      <p>No se guardó: estás viendo como <strong>{nombre}</strong>, en solo lectura. Para guardar, tocá <strong>Salir</strong>.</p>
    </div>
  )
}
