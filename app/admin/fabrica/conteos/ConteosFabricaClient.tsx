'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Ban, ClipboardCheck, FileText, PackagePlus, User } from 'lucide-react'
import { formatearNumero } from '@/lib/formato'
import { createClient } from '@/lib/supabase/client'
import type { ModoCalculo, Redondeo } from '@/lib/fabrica/calculoSugerido'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import SearchInput from '@/components/ui/SearchInput'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { Chip, SegmentedControl } from '@/components/ui/Chip'
import { IconoRenderer } from '@/components/ui/IconoPicker'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { useToast } from '@/components/ui/ProveedorUI'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { useAlCambiarParam, useQuitarParams } from '@/components/ui/useParamDeepLink'
import { MODO_LABEL, REDONDEO_LABEL } from '@/lib/estados'
import DiferenciasConteo from './DiferenciasConteo'

interface ConteoHistorial {
  id: string | null
  fecha: string | null
  semana_desde: string | null
  semana_hasta: string | null
  masas_proyectadas: number | null
  cerrado_en: string | null
  definicion_id: string | null
  definicion_nombre: string | null
  definicion_icono: string | null
  cerrado_por_nombre: string | null
  estado: string | null
  solicitud_id: string | null
  solicitud_estado: string | null
  diferencias_pendientes: number | null
  diferencias_resueltas: number | null
}

interface DetalleItem {
  id: string
  cantidad: number
  contado_en: string | null
  necesidad: number
  sugerido: number
  modo_calculo: ModoCalculo
  meta: number
  cantidad_fija: number
  cantidad_por_masa: number
  cantidad_por_unidad: number
  redondeo: Redondeo
  exceso: number | null
  sobrestock: boolean
  descuento_base_sugerido: number | null
  diferencia: number | null
  compras_items: { nombre: string; unidad: string } | null
}

type Pestania = 'diferencias' | 'sugerido'

const SOLICITUD_LABEL: Record<string, string> = {
  abierta: 'Abierta',
  convertida: 'Convertida en pedido',
  descartada: 'Descartada',
}

function formatearFecha(fecha: string | null) {
  if (!fecha) return '—'
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function formatearFechaHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const TONO = {
  alerta: 'text-warning bg-warning-bg',
  exito: 'text-success bg-green-bg',
  neutro: 'text-muted bg-surface2',
} as const

function Pill({ tono, children }: { tono: keyof typeof TONO; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${TONO[tono]}`}>
      {children}
    </span>
  )
}

export default function ConteosFabricaClient({
  conteosIniciales,
  conteoInicial,
  umbralPct,
}: {
  conteosIniciales: ConteoHistorial[]
  conteoInicial: string | null
  umbralPct: number
}) {
  const supabase = createClient()
  const toast = useToast()

  const [abiertoId, setAbiertoId] = useState<string | null>(conteoInicial)
  const [pestania, setPestania] = useState<Pestania>('diferencias')
  // Si ?conteo= cambia sin desmontar (link desde otra pantalla al mismo route), se abre el nuevo.
  useAlCambiarParam(conteoInicial ?? undefined, id => { setAbiertoId(id); setPestania('diferencias') })
  const quitarParam = useQuitarParams('conteo')
  const [detalle, setDetalle] = useState<{ id: string; items: DetalleItem[] } | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)

  const abierto = conteosIniciales.find(c => c.id === abiertoId) ?? null
  const cargando = !!abierto && detalle?.id !== abierto.id
  const items = detalle?.id === abierto?.id ? detalle?.items ?? [] : []
  const conSobrestock = items.filter(d => d.sobrestock).length

  // Deep link a un conteo que no está en la lista.
  const noEncontrado = !!conteoInicial && !conteosIniciales.some(c => c.id === conteoInicial)
  useEffect(() => {
    if (noEncontrado) toast.error('No encontramos ese conteo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noEncontrado, conteoInicial])

  useEffect(() => {
    if (!abierto?.id) return
    let vigente = true
    const id = abierto.id
    supabase
      .from('fabrica_conteo_items')
      .select('id, cantidad, contado_en, necesidad, sugerido, modo_calculo, meta, cantidad_fija, cantidad_por_masa, cantidad_por_unidad, redondeo, exceso, sobrestock, descuento_base_sugerido, diferencia, compras_items(nombre, unidad)')
      .eq('conteo_id', id)
      .then(({ data }) => {
        if (!vigente) return
        const lista = ((data ?? []) as unknown as DetalleItem[])
          .sort((a, b) => (a.compras_items?.nombre ?? '').localeCompare(b.compras_items?.nombre ?? ''))
        setDetalle({ id, items: lista })
      })
    return () => { vigente = false }
  }, [supabase, abierto?.id])

  const conPendientes = conteosIniciales.filter(c => (c.diferencias_pendientes ?? 0) > 0).length
  const hayFiltros = !!busqueda || !!desde || !!hasta || soloPendientes
  function limpiarFiltros() { setBusqueda(''); setDesde(''); setHasta(''); setSoloPendientes(false) }

  const conteosFiltrados = useMemo(() => conteosIniciales.filter(c => {
    const matchBusqueda = (c.definicion_nombre ?? '').toLowerCase().includes(busqueda.toLowerCase())
    const fechaCierre = (c.cerrado_en ?? '').slice(0, 10)
    const matchDesde = !desde || fechaCierre >= desde
    const matchHasta = !hasta || fechaCierre <= hasta
    const matchPendientes = !soloPendientes || (c.diferencias_pendientes ?? 0) > 0
    return matchBusqueda && matchDesde && matchHasta && matchPendientes
  }), [conteosIniciales, busqueda, desde, hasta, soloPendientes])

  function abrir(c: ConteoHistorial) {
    setAbiertoId(c.id)
    setPestania('diferencias')
  }

  function cerrar() {
    setAbiertoId(null)
    quitarParam()
  }

  function abrirOtroConteo(id: string) {
    if (!conteosIniciales.some(c => c.id === id)) {
      toast.error('No encontramos ese conteo')
      return
    }
    setAbiertoId(id)
    setPestania('diferencias')
  }

  function badgeDiferencias(c: ConteoHistorial): ReactNode {
    if (c.estado === 'descartado') return <Pill tono="neutro"><Ban size={11} /> Descartado</Pill>
    const pendientes = c.diferencias_pendientes ?? 0
    if (pendientes > 0) return <Pill tono="alerta">{pendientes} pendiente{pendientes === 1 ? '' : 's'}</Pill>
    if ((c.diferencias_resueltas ?? 0) > 0) return <Pill tono="exito">Revisado</Pill>
    return <Pill tono="neutro">Sin diferencias</Pill>
  }

  const columnas: Columna<ConteoHistorial>[] = [
    {
      key: 'conteo',
      header: 'Conteo',
      render: c => (
        <span className="flex items-center gap-2 font-medium">
          <IconoRenderer nombre={c.definicion_icono} size={16} className="text-accent shrink-0" />
          {c.definicion_nombre}
        </span>
      ),
      ordenar: c => c.definicion_nombre ?? '',
    },
    {
      key: 'ventana',
      header: 'Ventana',
      render: c => <span className="text-muted">{formatearFecha(c.semana_desde)} — {formatearFecha(c.semana_hasta)}</span>,
      ordenar: c => c.semana_desde ?? '',
    },
    {
      key: 'cerrado',
      header: 'Cerrado',
      ocultarHasta: 'sm',
      render: c => <span className="text-muted">{formatearFechaHora(c.cerrado_en)}</span>,
      ordenar: c => c.cerrado_en ?? '',
    },
    {
      key: 'por',
      header: 'Por',
      ocultarHasta: 'md',
      render: c => <span className="flex items-center gap-1 text-muted"><User size={13} /> {c.cerrado_por_nombre ?? '—'}</span>,
    },
    {
      key: 'diferencias',
      header: 'Diferencias',
      render: badgeDiferencias,
      ordenar: c => (c.estado === 'descartado' ? -1 : c.diferencias_pendientes ?? 0),
    },
  ]

  const pendientesAbierto = abierto?.diferencias_pendientes ?? 0
  const descartado = abierto?.estado === 'descartado'

  return (
    <div className="space-y-6">
      <PageHeader
        icono={ClipboardCheck}
        titulo="Conteos de fábrica"
        descripcion="Lo que contó Fábrica comparado con el stock del sistema. Las diferencias no cambian el stock hasta que las aplicás."
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por conteo..." className="w-full sm:w-64" />
        <DateRangeInputs desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} />
        <Chip active={soloPendientes} onClick={() => setSoloPendientes(v => !v)}>
          Con diferencias pendientes ({conPendientes})
        </Chip>
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      <DataTable
        filas={conteosFiltrados}
        columnas={columnas}
        filaKey={c => c.id ?? ''}
        onFilaClick={abrir}
        vacio={conteosIniciales.length === 0
          ? <EmptyState icono={ClipboardCheck} titulo="Todavía no hay conteos cerrados" descripcion="Cuando Fábrica cierre un conteo, aparece acá." />
          : <EmptyState icono={ClipboardCheck} titulo="Ningún conteo coincide con los filtros" />}
      />

      <Modal open={!!abierto} onClose={cerrar} title={abierto?.definicion_nombre ?? ''} size="xl" pantallaCompletaMobile>
        {abierto && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                Ventana {formatearFecha(abierto.semana_desde)} — {formatearFecha(abierto.semana_hasta)} · cerrado {formatearFechaHora(abierto.cerrado_en)} por {abierto.cerrado_por_nombre ?? '—'}
                {abierto.masas_proyectadas != null && (
                  <>
                    · {abierto.masas_proyectadas} masas proyectadas
                    <HelpTooltip text="Lo carga Fábrica a mano en /fabrica/stock: cuántas masas (batches de producción) proyecta hacer en esta ventana. De ahí sale la Necesidad de cada insumo (cantidad por masa × masas proyectadas) — no es un cálculo automático del sistema." />
                  </>
                )}
              </p>
              {abierto.solicitud_id && (
                <LinkEntidad
                  entidad={{ tipo: 'solicitud', id: abierto.solicitud_id }}
                  variante="chip"
                  onNavegar={cerrar}
                  className="min-h-11 sm:min-h-9 px-3 text-xs font-semibold text-text"
                >
                  <FileText size={13} /> Solicitud de compra · {SOLICITUD_LABEL[abierto.solicitud_estado ?? ''] ?? abierto.solicitud_estado}
                </LinkEntidad>
              )}
            </div>

            {descartado && (
              <p className="flex items-center gap-2 rounded-xl border border-border bg-surface2 px-4 py-2.5 text-sm text-text">
                <Ban size={16} className="shrink-0 text-muted" />
                Compras descartó la solicitud de este conteo: las diferencias no se aplican.
              </p>
            )}

            <SegmentedControl<Pestania>
              opciones={[
                { value: 'diferencias', label: `Diferencias con el stock${pendientesAbierto > 0 ? ` (${pendientesAbierto})` : ''}` },
                { value: 'sugerido', label: 'Pedido sugerido' },
              ]}
              value={pestania}
              onChange={setPestania}
            />

            {pestania === 'diferencias' ? (
              <DiferenciasConteo
                key={abierto.id}
                conteoId={abierto.id ?? ''}
                descartado={descartado}
                umbralPct={umbralPct}
                onNavegar={cerrar}
                onAbrirConteo={abrirOtroConteo}
              />
            ) : (
              <>
                {!cargando && conSobrestock > 0 && (
                  <p className="flex items-center gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-2.5 text-sm text-text">
                    <PackagePlus size={16} className="text-warning shrink-0" />
                    {conSobrestock} insumo{conSobrestock === 1 ? '' : 's'} con sobrestock: se avisó a Compras y se sugiere pedir menos en el próximo pedido base.
                  </p>
                )}

                <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
                  {cargando ? (
                    <p className="p-6 text-center text-sm text-muted">Cargando…</p>
                  ) : items.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted">Este conteo no tiene ítems.</p>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-surface2 border-b border-border">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted uppercase tracking-wider">Insumo</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Contado</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1 justify-end">
                              Necesidad
                              <HelpTooltip text="Lo que pide la receta (cantidad por masa × masas proyectadas), en la unidad de la receta — no en la unidad de compra. Por eso el número no es directamente comparable con Contado/Sugerido; la equivalencia aproximada en unidad de compra va abajo, entre paréntesis." />
                            </span>
                          </th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Sugerido</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted uppercase tracking-wider min-w-55">Regla aplicada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map(d => (
                          <tr key={d.id}>
                            <td className="px-4 py-3 text-sm text-text align-top">{d.compras_items?.nombre ?? '—'}</td>
                            <td className="px-4 py-3 text-sm text-muted text-right align-top whitespace-nowrap">
                              {d.cantidad} {d.compras_items?.unidad}
                              {!d.contado_en && <span className="block text-xs text-muted">sin contar: stock del sistema</span>}
                              {d.sobrestock && d.exceso != null && (
                                <span className="mt-1 flex items-center justify-end gap-1 text-xs font-semibold text-warning">
                                  <PackagePlus size={12} /> Sobrestock +{formatearNumero(Number(d.exceso), 1)}
                                </span>
                              )}
                              {d.sobrestock && d.descuento_base_sugerido != null && (
                                <span className="block text-xs text-muted">pedir {formatearNumero(Number(d.descuento_base_sugerido), 1)} menos en el base</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted text-right align-top whitespace-nowrap">
                              {d.necesidad}
                              {d.cantidad_por_unidad > 0 && (
                                <span className="block text-xs text-faint">≈ {(d.necesidad / d.cantidad_por_unidad).toFixed(1)} {d.compras_items?.unidad}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-text font-medium text-right align-top whitespace-nowrap">{d.sugerido}</td>
                            <td className="px-4 py-3 text-xs text-muted align-top leading-relaxed">
                              {MODO_LABEL[d.modo_calculo]}
                              {d.modo_calculo === 'meta_semanal' && ` (meta ${d.meta})`}
                              {d.modo_calculo === 'cantidad_fija' && ` (${d.cantidad_fija})`}
                              {d.modo_calculo === 'por_masa' && ` (${d.cantidad_por_masa}/masa)`}
                              <br />{REDONDEO_LABEL[d.redondeo]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
