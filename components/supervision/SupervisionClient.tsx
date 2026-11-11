'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconBuildingStore, IconChartBar, IconClipboardCheck, IconClipboardPlus, IconCloudUpload, IconHistory, IconRefresh, type Icon,
} from '@tabler/icons-react'
import { ToastStack, useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { catalogoDeTipo } from '@/lib/supervision/calculos'
import { cargarVisitas } from '@/lib/supervision/datos'
import { TIPOS_VISITA, type BloqueSupervision, type LugarSupervision, type TipoVisita, type VisitaSupervision } from '@/lib/supervision/tipos'
import NuevaVisita from './NuevaVisita'
import ListaVisitas from './ListaVisitas'
import AnalisisSupervision from './AnalisisSupervision'
import LugaresSupervision from './LugaresSupervision'
import { CLAVE_BORRADOR } from './ui'

export type VistaSupervision = 'nueva' | 'visitas' | 'analisis' | 'lugares'

const VISTAS: { key: VistaSupervision; label: string; corto: string; icono: Icon }[] = [
  { key: 'nueva', label: 'Nueva visita', corto: 'Nueva', icono: IconClipboardPlus },
  { key: 'visitas', label: 'Visitas', corto: 'Visitas', icono: IconHistory },
  { key: 'analisis', label: 'Análisis', corto: 'Análisis', icono: IconChartBar },
  { key: 'lugares', label: 'Lugares', corto: 'Lugares', icono: IconBuildingStore },
]

interface Props {
  lugares: LugarSupervision[]
  esAdmin: boolean
  bloques: BloqueSupervision[]
  visitasIniciales: VisitaSupervision[]
  errorCarga: boolean
  nombreUsuario: string
  vistaInicial: VistaSupervision
  aviso: string | null
}

export default function SupervisionClient({ lugares: lugaresIniciales, esAdmin, bloques, visitasIniciales, errorCarga, nombreUsuario, vistaInicial, aviso }: Props) {
  const [supabase] = useState(() => createClient())
  const pathname = usePathname()
  const toast = useToasts()
  const [vista, setVista] = useState<VistaSupervision>(vistaInicial)
  const [visitas, setVisitas] = useState(visitasIniciales)
  const [actualizando, setActualizando] = useState(false)
  const [borrador, setBorrador] = useState<{ id: string; sucursal: string } | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const avisado = useRef(false)
  const [lugares, setLugares] = useState(lugaresIniciales)
  // Visitas y Análisis muestran un tipo de visita por vez: sucursal, fábrica,
  // depósito y mayoristas no se mezclan en un mismo promedio.
  const tipos = useMemo(() => TIPOS_VISITA.filter(t => lugares.some(l => l.tipo === t.valor)), [lugares])
  const [tipo, setTipo] = useState<TipoVisita>('sucursal')
  const lugaresTipo = useMemo(() => lugares.filter(l => l.tipo === tipo), [lugares, tipo])
  const bloquesTipo = useMemo(() => catalogoDeTipo(bloques, tipo), [bloques, tipo])
  const visitasTipo = useMemo(() => {
    const ids = new Set(lugaresTipo.map(s => s.id))
    return visitas.filter(v => ids.has(v.lugar_id))
  }, [visitas, lugaresTipo])
  const sucursales = useMemo(() => lugares.filter(l => l.tipo === 'sucursal'), [lugares])

  useEffect(() => {
    // Una visita que quedó guardada solo en este celular (se cortó la conexión).
    try {
      const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? 'null')
      if (b?.visita?.id) {
        // Los borradores anteriores a la v2 traen sucursal_id.
        const lugarId = b.visita.lugar_id ?? b.visita.sucursal_id
        const nombre = lugares.find(l => l.id === lugarId)?.nombre ?? ''
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
          <div role="tablist" aria-label="Vista" className="grid flex-1 grid-cols-4 gap-1 rounded-xl border border-border bg-surface p-1 sm:flex-none">
            {VISTAS.map(v => {
              const Icono = v.icono
              const activa = vista === v.key
              return (
                <button key={v.key} type="button" role="tab" aria-selected={activa} aria-label={v.label} onClick={() => cambiarVista(v.key)}
                  className={`inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:px-4 ${
                    activa ? 'bg-accent text-black' : 'text-muted hover:bg-surface2 hover:text-text'
                  }`}>
                  <Icono size={16} aria-hidden className="hidden shrink-0 min-[400px]:block" />
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
        <NuevaVisita lugares={lugares} bloques={bloques} visitas={visitas} nombreUsuario={nombreUsuario} ahora={ahora} toast={toast} />
      )}
      {(vista === 'visitas' || vista === 'analisis') && tipos.length > 1 && (
        <div role="group" aria-label="Tipo de visita" className="flex flex-wrap gap-1.5">
          {tipos.map(t => (
            <button key={t.valor} type="button" aria-pressed={tipo === t.valor} onClick={() => setTipo(t.valor)}
              className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
                tipo === t.valor ? 'border-accent bg-accent text-black' : 'border-border text-muted hover:border-accent/60 hover:text-text'
              }`}>
              {t.texto}
            </button>
          ))}
        </div>
      )}
      {vista === 'visitas' && <ListaVisitas key={tipo} sucursales={lugaresTipo} bloques={bloquesTipo} visitas={visitasTipo} ahora={ahora} />}
      {vista === 'analisis' && <AnalisisSupervision key={tipo} tipo={tipo} sucursales={lugaresTipo} bloques={bloquesTipo} visitas={visitasTipo} ahora={ahora} />}
      {vista === 'lugares' && (
        <LugaresSupervision sucursales={sucursales} esAdmin={esAdmin} toast={toast}
          onGuardado={l => setLugares(prev => prev.map(x => (x.id === l.id ? l : x)))} />
      )}
    </div>
  )
}
