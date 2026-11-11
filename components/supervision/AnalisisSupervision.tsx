'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  IconAlertTriangle, IconCalendar, IconCalendarOff, IconChartBar, IconClipboardCheck, IconCoins, IconDownload, IconPercentage,
} from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import KpiCard from '@/components/ui/KpiCard'
import Modal from '@/components/ui/Modal'
import {
  PERIODOS, aCsv, analizar, bloquesDeVisita, diferenciaPuntos, diferenciasArqueo, filasCsv, filtrarVisitas, nivelCumplimiento,
  rangoAnterior, rangoPeriodo,
  sinVisitarDesde, textoPct, type NivelCumplimiento, type Periodo,
} from '@/lib/supervision/calculos'
import { fechaCorta, fechaHora, pesos } from '@/lib/supervision/formato'
import { TIPOS_VISITA, type BloqueSupervision, type LugarSupervision, type TipoVisita, type VisitaSupervision } from '@/lib/supervision/tipos'
import { ChipFiltro, OPCIONES_NIVEL } from './Filtros'
import { Tarjeta } from './ui'

interface Props {
  sucursales: LugarSupervision[]
  bloques: BloqueSupervision[]
  visitas: VisitaSupervision[]
  ahora: number
  tipo?: TipoVisita
}

const INICIAL = { periodo: '90d' as Periodo, zona: 'todas', supervisor: 'todos', bloque: 'todos', nivel: 'todos' }

// Celdas del mapa: fondo suave y número en el color del nivel.
const CELDA: Record<NivelCumplimiento, string> = {
  alto: 'bg-success/20 text-success',
  medio: 'bg-accent/20 text-accent',
  bajo: 'bg-brand-red/20 text-brand-red',
}

/** "Stock, depósito y cadena de frío" → "Stock". */
const corto = (titulo: string) => titulo.split(' ')[0].replace(/[,.]$/, '')

export default function AnalisisSupervision({ sucursales, bloques, visitas, ahora, tipo = 'sucursal' }: Props) {
  const [f, setF] = useState(INICIAL)
  const [celda, setCelda] = useState<{ visita: VisitaSupervision; bloque: BloqueSupervision; sucursal: string } | null>(null)
  const cambiar = (k: keyof typeof INICIAL) => (v: string) => setF(prev => ({ ...prev, [k]: v }))

  const zonas = useMemo(() => [...new Set(sucursales.map(s => s.zona).filter((z): z is string => !!z))], [sucursales])
  const supervisores = useMemo(() => [...new Set(visitas.map(v => v.supervisor_nombre))].sort((a, b) => a.localeCompare(b, 'es')), [visitas])
  const sucursalesZona = useMemo(() => sucursales.filter(s => f.zona === 'todas' || s.zona === f.zona), [sucursales, f.zona])
  const textoItem = useMemo(() => new Map(bloques.flatMap(b => b.items.map(i => [i.id, { texto: i.texto, bloque: b.titulo }]))), [bloques])
  const columnas = f.bloque === 'todos' ? bloques : bloques.filter(b => b.id === f.bloque)

  const rango = rangoPeriodo(f.periodo, ahora)
  const filtrar = (r: typeof rango) => filtrarVisitas(visitas, { rango: r, zona: f.zona, supervisor: f.supervisor }, sucursales, bloques)
  const enPeriodo = filtrar(rango)
  const opciones = { bloqueId: f.bloque === 'todos' ? undefined : f.bloque, nivel: f.nivel as 'todos' | NivelCumplimiento }
  const a = analizar(enPeriodo, bloques, sucursalesZona, opciones)
  const rAnt = rangoAnterior(rango, ahora)
  const promedioAnterior = rAnt ? analizar(filtrar(rAnt), bloques, sucursalesZona, opciones).promedio : null
  const difPromedio = diferenciaPuntos(a.promedio, promedioAnterior)
  const sinVisitar = sinVisitarDesde(visitas, sucursalesZona, ahora)
  const nombres = (ss: LugarSupervision[]) => ss.map(s => s.nombre).join(', ')
  const hayArqueo = bloques.some(b => b.items.some(i => i.con_monto))
  const arqueo = hayArqueo ? diferenciasArqueo(enPeriodo, bloques, sucursalesZona) : []

  function descargar() {
    const nombre = (id: string) => sucursales.find(s => s.id === id)?.nombre ?? id
    const tipoTexto = TIPOS_VISITA.find(t => t.valor === tipo)?.texto ?? ''
    const filas = filasCsv(enPeriodo, bloques, nombre, fechaHora, {
      tipo: () => tipoTexto,
      bloquesDe: v => bloquesDeVisita(v, bloques, sucursales.find(s => s.id === v.lugar_id)),
    })
    const blob = new Blob([aCsv(filas)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `supervision-${tipo}-${new Date(ahora).toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const hayFiltros = JSON.stringify(f) !== JSON.stringify(INICIAL)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ChipFiltro nombre="Período" valor={f.periodo} porDefecto="90d" mostrarValor icono={IconCalendar}
          opciones={PERIODOS.map(p => ({ valor: p.valor, texto: p.texto }))} onChange={cambiar('periodo')} />
        <ChipFiltro nombre="Zona" valor={f.zona} porDefecto="todas"
          opciones={[{ valor: 'todas', texto: 'Todas las zonas' }, ...zonas.map(z => ({ valor: z, texto: z }))]} onChange={cambiar('zona')} />
        {supervisores.length > 1 && (
          <ChipFiltro nombre="Supervisor" valor={f.supervisor} porDefecto="todos"
            opciones={[{ valor: 'todos', texto: 'Todos' }, ...supervisores.map(s => ({ valor: s, texto: s }))]} onChange={cambiar('supervisor')} />
        )}
        <ChipFiltro nombre="Bloque" valor={f.bloque} porDefecto="todos"
          opciones={[{ valor: 'todos', texto: 'Todos los bloques' }, ...bloques.map(b => ({ valor: b.id, texto: b.titulo }))]} onChange={cambiar('bloque')} />
        <ChipFiltro nombre="Nivel" valor={f.nivel} porDefecto="todos" opciones={OPCIONES_NIVEL} onChange={cambiar('nivel')} />
        {hayFiltros && <button type="button" onClick={() => setF(INICIAL)} className="px-1 text-xs font-semibold text-accent hover:underline">Limpiar</button>}
        <button type="button" onClick={descargar} disabled={enPeriodo.length === 0}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-text hover:border-accent hover:text-accent disabled:opacity-40">
          <IconDownload size={14} aria-hidden /> CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<IconClipboardCheck size={20} />} label="Visitas cerradas" value={String(a.cerradas.length)}
          detalle={`${a.ultimas.length} sucursal${a.ultimas.length === 1 ? '' : 'es'} visitada${a.ultimas.length === 1 ? '' : 's'}`} />
        <KpiCard icon={<IconPercentage size={20} />} label="Cumplimiento promedio" value={textoPct(a.promedio)}
          tono={a.promedio == null ? 'neutro' : a.promedio >= 85 ? 'exito' : a.promedio >= 65 ? 'neutro' : 'peligro'}
          detalle={difPromedio == null ? 'Última visita de cada sucursal' : `${difPromedio > 0 ? '+' : difPromedio < 0 ? '−' : ''}${Math.abs(difPromedio)} pts vs. período anterior`} />
        <KpiCard icon={<IconAlertTriangle size={20} />} label="Sucursales en rojo" value={String(a.enRojo.length)}
          tono={a.enRojo.length ? 'peligro' : 'exito'} detalle={a.enRojo.length ? nombres(a.enRojo) : 'Ninguna por debajo de 65 %'} />
        <KpiCard icon={<IconCalendarOff size={20} />} label="Sin visitar en 30 días" value={String(sinVisitar.length)}
          tono={sinVisitar.length ? 'alerta' : 'exito'} detalle={sinVisitar.length ? nombres(sinVisitar) : 'Todas visitadas'} />
      </div>

      {a.cerradas.length === 0 ? (
        <div className="rounded-card border border-dashed border-border">
          <EmptyState icono={IconChartBar} titulo={hayFiltros ? 'No hay visitas cerradas con estos filtros' : 'Todavía no hay visitas cerradas para analizar'} />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <Tarjeta titulo="Sucursal × bloque" descripcion="Última visita cerrada de cada sucursal. Tocá una celda para ver los ítems.">
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full border-separate border-spacing-[3px] text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface" />
                    {columnas.map(b => (
                      <th key={b.id} title={b.titulo} className="h-24 min-w-[34px] px-0 pb-1 align-bottom font-semibold text-muted">
                        <span className="inline-block -rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{columnas.length === 1 ? b.titulo : corto(b.titulo)}</span>
                      </th>
                    ))}
                    <th className="h-24 min-w-[38px] px-0 pb-1 align-bottom font-semibold text-text">
                      <span className="inline-block -rotate-180 [writing-mode:vertical-rl]">Total</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {a.mapa.map(({ sucursal, visita, bloques: pcts, total }) => (
                    <tr key={sucursal.id}>
                      <th scope="row" className="sticky left-0 z-10 max-w-[120px] truncate bg-surface pr-2 text-left font-semibold text-text sm:max-w-none">
                        {visita
                          ? <Link href={`/admin/supervision/${visita.id}`} className="hover:text-accent">{sucursal.nombre}</Link>
                          : sucursal.nombre}
                      </th>
                      {!visita ? (
                        <td colSpan={columnas.length + 1} className="h-8 pl-1.5 text-faint">Sin visitas cerradas en el período</td>
                      ) : (
                        <>
                          {columnas.map(b => {
                            const p = pcts[b.id] ?? null
                            const nivel = nivelCumplimiento(p)
                            return (
                              <td key={b.id} className="p-0">
                                <button type="button" onClick={() => setCelda({ visita, bloque: b, sucursal: sucursal.nombre })}
                                  aria-label={`${sucursal.nombre}, ${b.titulo}: ${textoPct(p)}`}
                                  className={`h-8 w-full min-w-[34px] rounded-md font-bold tabular-nums transition-opacity hover:opacity-80 ${nivel ? CELDA[nivel] : 'bg-surface2 text-faint'}`}>
                                  {p == null ? '–' : Math.round(p)}
                                </button>
                              </td>
                            )
                          })}
                          <td className={`h-8 min-w-[38px] rounded-md text-center font-bold tabular-nums ring-1 ring-inset ring-border ${(() => { const n = nivelCumplimiento(total); return n ? CELDA[n] : 'text-faint' })()}`}>
                            {total == null ? '–' : Math.round(total)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Lo que más se incumple" descripcion="Visitas con “No cumple” en el período (sin contar los no respondidos).">
            {a.top.length === 0 ? (
              <p className="text-sm text-muted">Sin incumplimientos registrados.</p>
            ) : (
              <ol className="divide-y divide-border">
                {a.top.map(({ itemId, veces, sucursales: n }, i) => (
                  <li key={itemId} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="w-5 shrink-0 text-right font-['Syne'] text-sm font-bold text-faint">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text">{textoItem.get(itemId)?.texto}</p>
                      <p className="text-xs text-muted">
                        {corto(textoItem.get(itemId)?.bloque ?? '')} · {veces} {veces === 1 ? 'visita' : 'visitas'} · {n} {n === 1 ? 'sucursal' : 'sucursales'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Tarjeta>
        </div>
      )}

      {hayArqueo && a.cerradas.length > 0 && (
        <Tarjeta titulo="Diferencias de arqueo" descripcion="Montos anotados en el arqueo de caja de las visitas cerradas del período. Faltantes y sobrantes suman igual.">
          {arqueo.length === 0 ? (
            <p className="text-sm text-muted">No se anotaron diferencias en el período.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-2xs uppercase tracking-wider text-muted">
                    <th className="py-1.5 pr-3 font-semibold">Sucursal</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Visitas</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Total</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Mayor</th>
                    <th className="py-1.5 text-right font-semibold">Última</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {arqueo.map(d => (
                    <tr key={d.lugar.id}>
                      <td className="py-2 pr-3 font-semibold text-text">{d.lugar.nombre}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted">{d.visitas}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-bold tabular-nums text-text">{pesos(d.total)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-muted">{d.mayor < 0 ? '−' : ''}{pesos(Math.abs(d.mayor))}</td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums text-muted">{fechaCorta(d.ultima)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="flex items-center gap-1.5 text-xs text-faint"><IconCoins size={14} aria-hidden /> Solo informa: no cambia el cumplimiento.</p>
        </Tarjeta>
      )}

      <Modal open={!!celda} onClose={() => setCelda(null)} title={celda ? `${celda.sucursal} · ${celda.bloque.titulo}` : ''} size="lg">
        {celda && (
          <div className="space-y-3">
            <p className="text-xs text-muted">Visita del {fechaHora(celda.visita.fecha)} · {celda.visita.supervisor_nombre}</p>
            <ul className="divide-y divide-border">
              {celda.bloque.items.filter(it => !celda.visita.items_visibles || celda.visita.items_visibles.includes(it.id)).map(it => {
                const r = celda.visita.respuestas[it.id]
                return (
                  <li key={it.id} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text">{it.texto}</p>
                      {r?.obs && <p className="mt-1 border-l-2 border-brand-red/60 pl-2 text-xs text-muted">{r.obs}</p>}
                    </div>
                    <Resultado r={r?.r ?? null} auto={!!r?.auto} />
                  </li>
                )
              })}
            </ul>
            <Link href={`/admin/supervision/${celda.visita.id}`} className="inline-block text-sm font-semibold text-accent hover:underline">
              Ver la visita completa
            </Link>
          </div>
        )}
      </Modal>
    </div>
  )
}

export function Resultado({ r, auto }: { r: string | null; auto?: boolean }) {
  const [texto, clase] = r === 'C' ? ['Cumple', 'bg-green-bg text-success']
    : r === 'NC' ? [auto ? 'Sin responder' : 'No cumple', auto ? 'bg-warning-bg text-warning' : 'bg-danger-bg text-brand-red']
    : r === 'NA' ? ['N/A', 'bg-surface2 text-muted']
    : ['–', 'bg-surface2 text-faint']
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${clase}`}>{texto}</span>
}
