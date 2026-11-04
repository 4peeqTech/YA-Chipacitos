'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { useToast } from '@/components/ui/ProveedorUI'

interface ResultadoLocal {
  local: string
  ok: boolean
  omitido?: boolean
  resumen?: { nuevos: number; cambiados: number; pagos: number; anulados: number }
  error?: string
}

/**
 * Trae los gastos de Fudo (solo lectura de Fudo). Al montar, en segundo plano y
 * solo las sucursales sin sincronizar en 10 minutos; con "Actualizar", todas.
 * Si cambió algo, la página se vuelve a armar con lo nuevo.
 */
export function useActualizarFudo(activo: boolean, toast: ReturnType<typeof useToast>) {
  const router = useRouter()
  const [actualizando, setActualizando] = useState(false)
  const corriendo = useRef(false)
  // El toast cambia en cada render del proveedor: va por ref para no re-disparar el efecto.
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast })

  const actualizar = useCallback(async (alAbrir: boolean) => {
    if (!activo || corriendo.current) return
    corriendo.current = true
    setActualizando(true)
    try {
      const r = await fetch('/api/gastos/fudo/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alAbrir }),
      })
      const data = await r.json().catch(() => null) as { locales?: ResultadoLocal[]; error?: string } | null
      if (!r.ok) {
        if (!alAbrir) toastRef.current.error(data?.error ?? 'No pudimos actualizar los gastos de Fudo.')
        return
      }
      const locales = data?.locales ?? []
      const corridos = locales.filter(l => !l.omitido)
      const cambios = corridos.reduce((s, l) => s + (l.resumen ? l.resumen.nuevos + l.resumen.cambiados + l.resumen.pagos + l.resumen.anulados : 0), 0)
      const fallas = corridos.filter(l => !l.ok)
      if (!alAbrir) {
        if (corridos.some(l => l.ok)) toastRef.current.success(cambios ? `Fudo: ${cambios} cambio${cambios === 1 ? '' : 's'} traído${cambios === 1 ? '' : 's'}` : 'Fudo: todo al día')
        if (fallas.length) toastRef.current.error(`No respondió Fudo de ${fallas.map(f => f.local).join(', ')}.`)
      }
      // Aunque no haya cambios, la hora de "actualizado" cambió.
      if (corridos.length) router.refresh()
    } catch {
      if (!alAbrir) toastRef.current.error('No pudimos actualizar los gastos de Fudo. Probá de nuevo en un rato.')
    } finally {
      corriendo.current = false
      setActualizando(false)
    }
  }, [activo, router])

  useEffect(() => { void actualizar(true) }, [actualizar])

  return { actualizando, actualizar }
}
