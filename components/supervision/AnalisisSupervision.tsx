'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { IconAlertTriangle, IconChartBar, IconClipboardCheck, IconDownload, IconPercentage } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import KpiCard from '@/components/ui/KpiCard'
import SelectBuscador from '@/components/ui/SelectBuscador'
import { aCsv, analizar, filasCsv, nivelCumplimiento, textoPct } from '@/lib/supervision/calculos'
import { COLOR_NIVEL, fechaCorta, fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, SucursalSupervision, VisitaSupervision } from '@/lib/supervision/tipos'
import { opcionesSucursal } from './ListaVisitas'
import { BarraCumplimiento, Tarjeta } from './ui'

interface Props {
  sucursales: SucursalSupervision[]
  bloques: BloqueSupervision[]
  visitas: VisitaSupervision[]
}

const EJE = { fill: '#888', fontSize: 11 }
const colorPct = (p: number | null) => (p == null ? '#444' : COLOR_NIVEL[nivelCumplimiento(p)!].hex)

export default function AnalisisSupervision({ sucursales, bloques, visitas }: Props) {
  const [filtro, setFiltro] = useState('todas')
  const nombre = (id: string) => sucursales.find(s => s.id === id)?.nombre ?? id
  const a = useMemo(() => analizar(visitas, bloques, filtro), [visitas, bloques, filtro])
  const textoItem = useMemo(() => new Map(bloques.flatMap(b => b.items.map(i => [i.id, { texto: i.texto, bloque: b.titulo }]))), [bloques])
  const hayCerradas = visitas.some(v => v.estado === 'cerrada')

  const porSucursal = sucursales
    .map(s => { const v = a.ultimas.find(u => u.sucursal_id === s.id); return v ? { nombre: s.nombre, pct: a.resumenes.get(v.id)!.pct } : null })
    .filter((x): x is { nombre: string; pct: number | null } => !!x)
  const evolucion = a.cerradas.map(v => ({ fecha: fechaCorta(v.fecha), pct: a.resumenes.get(v.id)?.pct ?? null }))

  function descargar() {
    const lista = visitas.filter(v => filtro === 'todas' || v.sucursal_id === filtro)
    const blob = new Blob([aCsv(filasCsv(lista, bloques, nombre, fechaHora))], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `supervision-locales-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SelectBuscador value={filtro} onChange={v => setFiltro(v || 'todas')} opciones={opcionesSucursal(sucursales)}
          placeholder="Sucursal" className="min-w-0 flex-1 sm:max-w-xs" />
        {hayCerradas && (
          <button type="button" onClick={descargar}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-text hover:border-accent hover:text-accent">
            <IconDownload size={16} aria-hidden /> CSV
          </button>
        )}
      </div>
      <p className="text-xs text-muted">Se toma la última visita cerrada de cada sucursal, salvo en la evolución y en los ítems más incumplidos, que cuentan todas.</p>

      {!hayCerradas ? (
        <div className="rounded-card border border-dashed border-border">
          <EmptyState icono={IconChartBar} titulo="Todavía no hay visitas cerradas para analizar" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard icon={<IconClipboardCheck size={20} />} label="Visitas cerradas" value={String(a.cerradas.length)} />
            <KpiCard icon={<IconPercentage size={20} />} label={filtro === 'todas' ? 'Cumplimiento promedio' : 'Última visita'}
              value={textoPct(a.promedio)}
              tono={a.promedio == null ? 'neutro' : a.promedio >= 85 ? 'exito' : a.promedio >= 65 ? 'neutro' : 'peligro'} />
            <KpiCard icon={<IconAlertTriangle size={20} />} label="Ítems sin cumplir hoy" value={String(a.noCumplenHoy)}
              tono={a.noCumplenHoy ? 'peligro' : 'exito'} />
          </div>

          {filtro === 'todas' ? (
            <Tarjeta titulo="Cumplimiento por sucursal" descripcion="Última visita cerrada de cada una.">
              <ResponsiveContainer width="100%" height={Math.max(160, porSucursal.length * 38)}>
                <BarChart data={porSucursal} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#2a2a2a" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={EJE} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nombre" width={110} tick={{ fill: '#ccc', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(232,197,71,.08)' }} formatter={v => [`${v}%`, 'Cumplimiento']}
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {porSucursal.map(r => <Cell key={r.nombre} fill={colorPct(r.pct)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Tarjeta>
          ) : a.cerradas.length > 0 && (
            <Tarjeta titulo={`Evolución de ${nombre(filtro)}`} descripcion="Cumplimiento de cada visita cerrada.">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={evolucion} margin={{ left: -12, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#2a2a2a" />
                  <XAxis dataKey="fecha" tick={EJE} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={EJE} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => [`${v}%`, 'Cumplimiento']}
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12 }} />
                  <Line type="monotone" dataKey="pct" stroke="#e8c547" strokeWidth={2} dot={{ r: 4, fill: '#e8c547' }} />
                </LineChart>
              </ResponsiveContainer>
            </Tarjeta>
          )}

          {a.cerradas.length === 0 ? (
            <div className="rounded-card border border-dashed border-border">
              <EmptyState icono={IconChartBar} titulo="Esta sucursal no tiene visitas cerradas" />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Cumplimiento por bloque" descripcion={filtro === 'todas' ? 'Promedio entre sucursales.' : 'Última visita.'}>
                <div className="space-y-3">
                  {a.porBloque.map(({ bloque, pct }) => <BarraCumplimiento key={bloque.id} titulo={bloque.titulo} pct={pct} />)}
                </div>
              </Tarjeta>

              <Tarjeta titulo="Ítems que más se incumplen" descripcion="Cantidad de visitas en que se marcaron “No cumple”.">
                {a.top.length === 0 ? (
                  <p className="text-sm text-muted">Sin incumplimientos registrados.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {a.top.map(({ itemId, veces }, i) => (
                      <li key={itemId} className="flex gap-3">
                        <span className="w-5 shrink-0 text-right font-['Syne'] text-sm font-bold text-faint">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-text">{textoItem.get(itemId)?.texto}</p>
                          <p className="text-xs text-muted">{textoItem.get(itemId)?.bloque} · {veces} {veces === 1 ? 'visita' : 'visitas'}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Tarjeta>
            </div>
          )}
        </>
      )}
    </div>
  )
}
