'use client'

import { useMemo, useState } from 'react'
import { ClipboardCheck, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ModoCalculo, Redondeo } from '@/lib/fabrica/calculoSugerido'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { IconoRenderer } from '@/components/ui/IconoPicker'
import { MODO_LABEL } from '@/app/admin/compras/insumos/listas-conteo/ConteosClient'
import { REDONDEO_LABEL } from '@/app/admin/compras/insumos/InsumosClient'

interface ConteoHistorial {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  masas_proyectadas: number | null
  cerrado_en: string
  definicion_id: string
  definicion_nombre: string
  definicion_icono: string | null
  cerrado_por_nombre: string | null
}

interface DetalleItem {
  id: string
  cantidad: number
  necesidad: number
  sugerido: number
  modo_calculo: ModoCalculo
  meta: number
  cantidad_fija: number
  cantidad_por_masa: number
  redondeo: Redondeo
  compras_items: { nombre: string; unidad: string } | null
}

function formatearFecha(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function formatearFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ConteosFabricaClient({ conteosIniciales }: { conteosIniciales: ConteoHistorial[] }) {
  const supabase = createClient()

  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<DetalleItem[]>([])
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const abierto = conteosIniciales.find(c => c.id === abiertoId) ?? null

  const hayFiltros = !!busqueda || !!desde || !!hasta
  function limpiarFiltros() { setBusqueda(''); setDesde(''); setHasta('') }

  const conteosFiltrados = useMemo(() => conteosIniciales.filter(c => {
    const matchBusqueda = c.definicion_nombre.toLowerCase().includes(busqueda.toLowerCase())
    const fechaCierre = c.cerrado_en.slice(0, 10)
    const matchDesde = !desde || fechaCierre >= desde
    const matchHasta = !hasta || fechaCierre <= hasta
    return matchBusqueda && matchDesde && matchHasta
  }), [conteosIniciales, busqueda, desde, hasta])

  async function abrir(conteo: ConteoHistorial) {
    setAbiertoId(conteo.id)
    setCargando(true)
    const { data } = await supabase
      .from('fabrica_conteo_items')
      .select('id, cantidad, necesidad, sugerido, modo_calculo, meta, cantidad_fija, cantidad_por_masa, redondeo, compras_items(nombre, unidad)')
      .eq('conteo_id', conteo.id)
    setDetalle(((data ?? []) as unknown as DetalleItem[]).sort((a, b) => (a.compras_items?.nombre ?? '').localeCompare(b.compras_items?.nombre ?? '')))
    setCargando(false)
  }

  function cerrar() {
    setAbiertoId(null)
    setDetalle([])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-text"><ClipboardCheck size={22} className="text-accent" /> Conteos de fábrica</h1>
        <p className="text-muted text-sm mt-0.5">Historial de conteos cerrados: qué había, qué pedía la receta y qué se sugirió.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por conteo..." className="w-64" />
        <DateRangeInputs desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} />
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface2 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Conteo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Ventana</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider hidden sm:table-cell">Cerrado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider hidden md:table-cell">Por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {conteosFiltrados.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-sm text-muted">{conteosIniciales.length === 0 ? 'Todavía no hay conteos cerrados.' : 'Ningún conteo coincide con los filtros.'}</td></tr>
            ) : conteosFiltrados.map(c => (
              <tr key={c.id} onClick={() => abrir(c)} className="hover:bg-surface2 transition-colors cursor-pointer">
                <td className="px-4 py-3 text-text font-medium">
                  <span className="flex items-center gap-2">
                    <IconoRenderer nombre={c.definicion_icono} size={16} className="text-accent shrink-0" />
                    {c.definicion_nombre}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted text-sm">{formatearFecha(c.semana_desde)} — {formatearFecha(c.semana_hasta)}</td>
                <td className="px-4 py-3 text-muted text-sm hidden sm:table-cell">{formatearFechaHora(c.cerrado_en)}</td>
                <td className="px-4 py-3 text-muted text-sm hidden md:table-cell">
                  <span className="flex items-center gap-1"><User size={13} /> {c.cerrado_por_nombre ?? '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!abierto} onClose={cerrar} title={abierto?.definicion_nombre ?? ''} size="xl">
        {abierto && (
          <div className="space-y-4">
            <p className="text-xs text-muted">
              Ventana {formatearFecha(abierto.semana_desde)} — {formatearFecha(abierto.semana_hasta)} · cerrado {formatearFechaHora(abierto.cerrado_en)} por {abierto.cerrado_por_nombre ?? '—'}
              {abierto.masas_proyectadas != null && <> · {abierto.masas_proyectadas} masas proyectadas</>}
            </p>

            <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
              {cargando ? (
                <p className="p-6 text-center text-sm text-muted">Cargando…</p>
              ) : detalle.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">Este conteo no tiene ítems.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-surface2 border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted uppercase tracking-wider">Insumo</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Contado</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Necesidad</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Sugerido</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted uppercase tracking-wider min-w-55">Regla aplicada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detalle.map(d => (
                      <tr key={d.id}>
                        <td className="px-4 py-3 text-sm text-text align-top">{d.compras_items?.nombre ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-muted text-right align-top whitespace-nowrap">{d.cantidad} {d.compras_items?.unidad}</td>
                        <td className="px-4 py-3 text-sm text-muted text-right align-top whitespace-nowrap">{d.necesidad}</td>
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
          </div>
        )}
      </Modal>
    </div>
  )
}
