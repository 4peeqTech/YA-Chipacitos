'use client'

import { useState } from 'react'

export default function SalirVerComo() {
  const [saliendo, setSaliendo] = useState(false)

  async function salir() {
    setSaliendo(true)
    const res = await fetch('/api/ver-como', { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    // Recarga completa: el cliente de Supabase y los datos vuelven a ser de la sesión propia.
    window.location.assign(data.destino ?? '/')
  }

  return (
    <button type="button" onClick={salir} disabled={saliendo}
      className="shrink-0 min-h-9 px-3 rounded-lg bg-black text-white text-xs font-bold presionable disabled:opacity-60">
      {saliendo ? 'Saliendo…' : 'Salir'}
    </button>
  )
}
