'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconChartBar, IconClipboardCheck, IconClipboardPlus, IconCloudUpload, IconHistory, IconRefresh, type Icon } from '@tabler/icons-react'
import { ToastStack, useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { cargarVisitas } from '@/lib/supervision/datos'
import type { BloqueSupervision, SucursalSupervision, VisitaSupervision } from '@/lib/supervision/tipos'
import NuevaVisita from './NuevaVisita'
import ListaVisitas from './ListaVisitas'
import AnalisisSupervision from './AnalisisSupervision'
import { CLAVE_BORRADOR } from './ui'

export type VistaSupervision = 'nueva' | 'visitas' | 'analisis'

const VISTAS: { key: VistaSupervision; label: string; corto: string; icono: Icon }[] = [
  { key: 'nueva', label: 'Nueva visita', corto: 'Nueva', icono: IconClipboardPlus },
  { key: 'visitas', label: 'Visitas', corto: 'Visitas', icono: IconHistory },
  { key: 'analisis', label: 'Análisis', corto: 'Análisis', icono: IconChartBar },
]

interface Props {
  sucursales: SucursalSupervision[]
  bloques: BloqueSupervision[]
  visitasIniciales: VisitaSupervision[]
  errorCarga: boolean
  nombreUsuario: string
  vistaInicial: VistaSupervision
  aviso: string | null
}

export default function SupervisionClient({ sucursales, bloques, visitasIniciales, errorCarga, nombreUsuario, vistaInicial, aviso }: Props) {
  const [supabase] = useState(() => createClient())
  const pathname = usePathname()
  const toast = useToasts()
  const [vista, setVista] = useState<VistaSupervision>(vistaInicial)
  const [visitas, setVisitas] = useState(visitasIniciales)
  const [actualizando, setActualizando] = useState(false)
  const [borrador, setBorrador] = useState<{ id: string; sucursal: string } | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const avisado = useRef(false)

  useEffect(() => {
    // Una visita que quedó guardada solo en este celular (se cortó la conexión).
    try {
      const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? 'null')
      if (b?.visita?.id) {
        const nombre = sucursales.find(s => s.id === b.visita.sucursal_id)?.nombre ?? ''
        setBorrador({ id: b.visita.id, sucursal: nombre }) // eslint-disable-line react-hooks/set-state-in-effect
      }
    } catch {}
    if (aviso && !avisado.current) {
      avisado.current = true
      toast.success(aviso)
      // Que recargar no repita el aviso.
      window.history.replaceState(null, '', `${pathname}?vista=${vistaInicial}`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarVista(v: VistaSupervision) {
    setVista(v)
    window.history.replaceState(null, '', v === 'nueva' ? pathname : `${pathname}?vista=${v}`)
  }

  async function actualizar() {
    setActualizando(true)
    const { visitas: nuevas, error } = await cargarVisitas(supabase)
    setActualizando(false)
    if (error) { toast.error('No se pudieron traer las visitas. Revisá la conexión.'); return }
    setVisitas(nuevas)
    setAhora(Date.now())
    toast.success('Visitas actualizadas')
  }

  return (
    <div className="w-full space-y-4">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-['Syne'] text-xl font-bold text-text sm:text-2xl">
            <IconClipboardCheck size={22} className="text-accent" aria-hidden /> Supervisión de locales
          </h1>
          <p className="mt-0.5 hidden text-sm text-muted sm:block">Checklist de la recorrida por las sucursales.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div role="tablist" aria-label="Vista" className="grid flex-1 grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1 sm:flex-none">
            {VISTAS.map(v => {
              const Icono = v.icono
              const activa = vista === v.key
              return (
                <button key={v.key} type="button" role="tab" aria-selected={activa} aria-label={v.label} onClick={() => cambiarVista(v.key)}
                  className={`inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:px-4 ${
                    activa ? 'bg-accent text-black' : 'text-muted hover:bg-surface2 hover:text-text'
                  }`}>
                  <Icono size={16} aria-hidden className="shrink-0" />
                  <span className="sm:hidden">{v.corto}</span>
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              )
            })}
          </div>
          <button type="button" onClick={actualizar} disabled={actualizando} aria-label="Actualizar visitas" title="Actualizar visitas"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted hover:border-accent hover:text-accent disabled:opacity-50">
            <IconRefresh size={16} className={actualizando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {errorCarga && (
        <p role="alert" className="rounded-card border border-brand-red/40 bg-danger-bg px-4 py-3 text-sm text-brand-red">
          No se pudieron traer las visitas. Revisá la conexión y tocá Actualizar.
        </p>
      )}

      {borrador && (
        <div className="flex items-center gap-3 rounded-card border border-accent/40 bg-accent-bg px-4 py-3">
          <IconCloudUpload size={18} className="shrink-0 text-accent" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-text">
            Hay una visita{borrador.sucursal ? ` en ${borrador.sucursal}` : ''} con cambios guardados solo en este celular.
          </p>
          <Link href={`/admin/supervision/${borrador.id}/checklist`}
            className="shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-black hover:opacity-90">
            Continuar
          </Link>
        </div>
      )}

      {vista === 'nueva' && (
        <NuevaVisita sucursales={sucursales} bloques={bloques} visitas={visitas} nombreUsuario={nombreUsuario} ahora={ahora} toast={toast} />
      )}
      {vista === 'visitas' && <ListaVisitas sucursales={sucursales} bloques={bloques} visitas={visitas} ahora={ahora} />}
      {vista === 'analisis' && <AnalisisSupervision sucursales={sucursales} bloques={bloques} visitas={visitas} ahora={ahora} />}
    </div>
  )
}
