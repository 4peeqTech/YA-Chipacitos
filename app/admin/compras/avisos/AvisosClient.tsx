'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import {
  AlertTriangle, BellRing, FileMinus, History, Loader2, PackageCheck, PackageMinus, RefreshCw, Repeat, Save, Scale, Truck,
  type LucideIcon,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import InputNumero from '@/components/ui/InputNumero'
import LinkEntidad from '@/components/ui/LinkEntidad'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import { useToast } from '@/components/ui/ProveedorUI'
import { formatearFechaHora } from '@/lib/formato'
import { RANGO, RECIBEN, TIPOS_AVISO, type ConfigAvisos, type TipoAviso } from '@/lib/compras/avisos'
import type { Entidad } from '@/lib/compras/rutas'
import { guardarConfigAvisos, revisarAvisosAhora } from './acciones'

export interface Corrida {
  origen: 'cron' | 'manual' | 'remito'
  corridaEn: string
  avisos: number
  error: string | null
}

export interface AvisoReciente {
  id: string
  tipo: TipoAviso
  entidadId: string
  pedidoId: string | null
  /** P-0081, D-0080-02 o el nombre del insumo; null si ya no existe. */
  etiqueta: string | null
  enviadoEn: string
  envios: number
}

type CampoDias = 'diasDemora' | 'diasDiferencias' | 'diasNc'

const AVISOS: Record<TipoAviso, { icono: LucideIcon; nombre: string; corto: string; cuando: (dias: number) => string; dias?: CampoDias; ayudaDias?: string }> = {
  remito_listo: {
    icono: PackageCheck,
    nombre: 'Listo para facturar',
    corto: 'Para facturar',
    cuando: () => 'Cuando un remito completa un pedido y falta cargar su factura. Llega en el momento.',
  },
  pedido_demorado: {
    icono: Truck,
    nombre: 'Pedido demorado',
    corto: 'Demorado',
    cuando: d => `Un pedido enviado que no llegó completo después de ${d} ${d === 1 ? 'día' : 'días'}.`,
    dias: 'diasDemora',
    ayudaDias: 'Se usa también en Pedidos y en la ficha del proveedor.',
  },
  diferencias: {
    icono: Scale,
    nombre: 'Diferencias sin resolver',
    corto: 'Diferencias',
    cuando: d => `La factura no coincide con lo recibido y sigue sin resolverse después de ${d} ${d === 1 ? 'día' : 'días'}.`,
    dias: 'diasDiferencias',
  },
  nc_pendiente: {
    icono: FileMinus,
    nombre: 'Falta la nota de crédito',
    corto: 'Nota de crédito',
    cuando: d => `Una devolución sigue esperando la nota de crédito del proveedor después de ${d} ${d === 1 ? 'día' : 'días'}.`,
    dias: 'diasNc',
  },
  stock_bajo: {
    icono: PackageMinus,
    nombre: 'Stock bajo el mínimo',
    corto: 'Stock bajo',
    cuando: () => 'Un insumo quedó por debajo de su mínimo y no está en ningún pedido abierto.',
  },
}

// Los días se editan como texto (InputNumero): null mientras el campo está vacío.
type Borrador = Omit<ConfigAvisos, CampoDias | 'repetirDias'> & Record<CampoDias | 'repetirDias', number | null>

function errorDias(v: number | null, min: number, max: number): string | null {
  if (v == null) return 'Poné un número'
  if (!Number.isInteger(v) || v < min || v > max) return `Entre ${min} y ${max}`
  return null
}

function Interruptor({ prendido, onChange, etiqueta }: { prendido: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={prendido}
      aria-label={etiqueta}
      onClick={() => onChange(!prendido)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        prendido ? 'border-accent bg-accent' : 'border-border bg-surface2'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full shadow-sm transition-transform ${prendido ? 'translate-x-6 bg-black' : 'translate-x-1 bg-muted'}`}
      />
    </button>
  )
}

function CampoNumero({
  valor, onChange, etiqueta, sufijo, error, deshabilitado,
}: {
  valor: number | null
  onChange: (v: number | null) => void
  etiqueta: string
  sufijo: string
  error: string | null
  deshabilitado?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>{etiqueta}</span>
        <InputNumero
          value={valor}
          onChange={onChange}
          enteros
          ariaLabel={etiqueta}
          disabled={deshabilitado}
          className={`!w-16 text-center tabular-nums ${error ? '!border-brand-red' : ''}`}
        />
        <span>{sufijo}</span>
      </div>
      {error && <p role="alert" className="text-xs text-brand-red">{error}</p>}
    </div>
  )
}

function Seccion({ icono: Icon, titulo, children, acciones }: { icono: LucideIcon; titulo: string; children: ReactNode; acciones?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Icon size={16} className="text-muted" /> {titulo}
        </h2>
        {acciones}
      </div>
      {children}
    </section>
  )
}

function entidadDe(a: AvisoReciente): Entidad | null {
  if (a.tipo === 'stock_bajo') return { tipo: 'insumo', id: a.entidadId }
  if (a.tipo === 'nc_pendiente') return a.pedidoId ? { tipo: 'devolucion', id: a.entidadId, pedidoId: a.pedidoId } : null
  return { tipo: 'pedido', id: a.entidadId }
}

const ORIGEN: Record<Corrida['origen'], string> = { cron: 'automática', manual: 'manual', remito: 'al cargar un remito' }

function textoCorrida(c: Corrida): string {
  const cuando = formatearFechaHora(c.corridaEn)
  const cuantos = c.error ? 'con error' : c.avisos === 0 ? 'sin avisos nuevos' : `${c.avisos} ${c.avisos === 1 ? 'aviso' : 'avisos'}`
  return `${cuando} · ${ORIGEN[c.origen]} · ${cuantos}`
}

export default function AvisosClient({
  config,
  ultima,
  ultimaAutomatica,
  recientes,
}: {
  config: ConfigAvisos
  ultima: Corrida | null
  /** La última corrida del cron (solo corre en producción). */
  ultimaAutomatica: string | null
  recientes: AvisoReciente[]
}) {
  const toast = useToast()
  const [base, setBase] = useState<ConfigAvisos>(config)
  const [b, setB] = useState<Borrador>(config)
  const [guardando, startGuardar] = useTransition()
  const [revisando, startRevisar] = useTransition()
  const [mostrarErrores, setMostrarErrores] = useState(false)
  // El chequeo de "atrasado" se hace una vez, al montar (no en cada render).
  const [ahora] = useState(() => Date.now())

  const errores = useMemo(() => ({
    diasDemora: errorDias(b.diasDemora, RANGO.dias.min, RANGO.dias.max),
    diasDiferencias: errorDias(b.diasDiferencias, RANGO.dias.min, RANGO.dias.max),
    diasNc: errorDias(b.diasNc, RANGO.dias.min, RANGO.dias.max),
    repetirDias: errorDias(b.repetirDias, RANGO.repetir.min, RANGO.repetir.max),
  }), [b])
  const hayErrores = Object.values(errores).some(Boolean)
  const sucio = JSON.stringify(b) !== JSON.stringify(base)

  const atrasado = ultimaAutomatica != null && ahora - new Date(ultimaAutomatica).getTime() > 26 * 3600 * 1000

  function cambiar<K extends keyof Borrador>(k: K, v: Borrador[K]) { setB(prev => ({ ...prev, [k]: v })) }
  function cambiarActivo(t: TipoAviso, v: boolean) { setB(prev => ({ ...prev, activo: { ...prev.activo, [t]: v } })) }

  function guardar() {
    if (hayErrores) { setMostrarErrores(true); toast.error('Revisá los días marcados.'); return }
    const cfg = b as ConfigAvisos
    startGuardar(async () => {
      const r = await guardarConfigAvisos(cfg)
      if (!r.ok) { toast.error(r.error); return }
      setBase(cfg)
      setMostrarErrores(false)
      toast.success(r.data.cambios === 0 ? 'No había cambios' : 'Avisos guardados')
    })
  }

  function revisar() {
    startRevisar(async () => {
      const r = await revisarAvisosAhora()
      if (!r.ok) { toast.error(r.error); return }
      toast.success(r.data.texto)
    })
  }

  const columnas: Columna<AvisoReciente>[] = [
    {
      key: 'cuando',
      header: 'Cuándo',
      render: a => <span className="whitespace-nowrap tabular-nums text-muted">{formatearFechaHora(a.enviadoEn)}</span>,
      ordenar: a => a.enviadoEn,
    },
    {
      key: 'tipo',
      header: 'Aviso',
      render: a => {
        const { icono: Icon, corto } = AVISOS[a.tipo]
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface2 px-2 py-0.5 text-xs text-text">
            <Icon size={13} className="text-muted" /> {corto}
          </span>
        )
      },
      ordenar: a => a.tipo,
    },
    {
      key: 'que',
      header: 'Qué',
      render: a => {
        const ent = entidadDe(a)
        if (!a.etiqueta || !ent) return <span className="text-muted">Ya no existe</span>
        return (
          <LinkEntidad entidad={ent} variante={a.tipo === 'stock_bajo' ? 'texto' : 'codigo'} className="text-text">
            {a.etiqueta}
          </LinkEntidad>
        )
      },
    },
    {
      key: 'veces',
      header: 'Veces',
      alinear: 'right',
      render: a => a.envios > 1
        ? <span className="inline-flex items-center gap-1 text-xs text-muted"><Repeat size={12} /> repetido {a.envios}</span>
        : <span className="text-xs text-muted">1</span>,
      ordenar: a => a.envios,
      ocultarHasta: 'sm',
    },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-4">
      <PageHeader
        icono={BellRing}
        titulo="Avisos de compras"
        descripcion="Qué avisa el sistema solo, cuándo y a quién. Cada aviso llega una vez por caso, a la campanita y al celular."
        acciones={
          <button
            type="button"
            onClick={revisar}
            disabled={revisando}
            className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text hover:border-accent disabled:opacity-60"
          >
            {revisando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Revisar ahora
          </button>
        }
      />

      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
        <History size={16} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1 space-y-1">
          <p>
            <span className="text-muted">Última revisión: </span>
            <span className="text-text">{ultima ? textoCorrida(ultima) : 'Todavía no corrió'}</span>
          </p>
          {atrasado ? (
            <p className="flex items-center gap-1.5 text-warning">
              <AlertTriangle size={14} /> El aviso automático no corrió ayer (el último fue el {formatearFechaHora(ultimaAutomatica!)}).
            </p>
          ) : ultimaAutomatica == null ? (
            <p className="text-xs text-muted">
              La revisión automática corre todos los días a las 7 de la mañana, solo en producción. Acá usá Revisar ahora.
            </p>
          ) : (
            <p className="text-xs text-muted">La revisión automática corre todos los días a las 7 de la mañana.</p>
          )}
        </div>
      </div>

      <Seccion icono={BellRing} titulo="Qué se avisa">
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {TIPOS_AVISO.map(t => {
            const a = AVISOS[t]
            const Icon = a.icono
            const prendido = b.activo[t]
            const dias = a.dias ? b[a.dias] : null
            return (
              <li key={t} className="flex gap-3 px-4 py-4 sm:gap-4">
                <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${prendido ? 'bg-accent/15 text-accent' : 'bg-surface2 text-muted'}`}>
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-semibold ${prendido ? 'text-text' : 'text-muted'}`}>{a.nombre}</p>
                      <p className="text-sm text-muted">{a.cuando(dias ?? (a.dias ? base[a.dias] : 0))}</p>
                    </div>
                    <Interruptor prendido={prendido} onChange={v => cambiarActivo(t, v)} etiqueta={`Avisar: ${a.nombre}`} />
                  </div>
                  {a.dias && (
                    <div>
                      <CampoNumero
                        etiqueta="Avisar a los"
                        sufijo="días"
                        valor={b[a.dias]}
                        onChange={v => cambiar(a.dias!, v)}
                        error={mostrarErrores || b[a.dias] !== base[a.dias] ? errores[a.dias] : null}
                      />
                      {a.ayudaDias && <p className="mt-1 text-xs text-muted">{a.ayudaDias}</p>}
                    </div>
                  )}
                  <p className="text-xs text-muted">Lo reciben: <span className="text-text">{RECIBEN[t]}</span></p>
                </div>
              </li>
            )
          })}
        </ul>
      </Seccion>

      <Seccion icono={Repeat} titulo="Si sigue sin resolverse">
        <div className="rounded-2xl border border-border bg-surface px-4 py-4">
          <CampoNumero
            etiqueta="Volver a avisar cada"
            sufijo="días"
            valor={b.repetirDias}
            onChange={v => cambiar('repetirDias', v)}
            error={mostrarErrores || b.repetirDias !== base.repetirDias ? errores.repetirDias : null}
          />
          <p className="mt-1 text-xs text-muted">0 = una sola vez. El dashboard muestra lo pendiente todos los días igual.</p>
        </div>
      </Seccion>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        {sucio && <span className="mr-auto text-xs text-warning">Cambios sin guardar</span>}
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
        >
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
        </button>
      </div>

      <Seccion icono={History} titulo="Avisos recientes">
        {recientes.length === 0 ? (
          <div className="rounded-2xl border border-border">
            <EmptyState icono={BellRing} titulo="Todavía no se mandó ningún aviso" descripcion="Cuando el sistema avise algo, aparece acá con un link a lo que avisó." />
          </div>
        ) : (
          <DataTable filas={recientes} columnas={columnas} filaKey={a => a.id} />
        )}
      </Seccion>
    </div>
  )
}
