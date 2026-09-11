'use client'

import { useMemo, useRef, useState } from 'react'
import {
  Inbox, ClipboardList, TrendingUp, Truck, ChevronRight,
  Ban, Send, History, Scale,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import InputNumero from '@/components/ui/InputNumero'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { useToasts, ToastStack } from '@/components/ui/Toast'

interface ConteoRef {
  semana_desde: string
  semana_hasta: string
  masas_proyectadas: number
}

interface SolicitudItem {
  id: string
  solicitud_id: string
  item_id: string | null
  proveedor_id: string
  descripcion: string
  unidad: string | null
  cantidad_sugerida: number
  cantidad_ajustada: number
  stock_actual: number | null
  incluir: boolean
  orden: number
}

export interface Solicitud {
  id: string
  conteo_id: string | null
  tipo: 'complementario' | 'base'
  estado: 'abierta' | 'convertida' | 'descartada'
  created_at: string
  convertida_en: string | null
  fabrica_conteos: ConteoRef | null
  compras_solicitud_items: SolicitudItem[]
}

interface ProveedorOption {
  id: string
  nombre: string
}

const ESTADO_BADGE: Record<Solicitud['estado'], string> = {
  abierta: 'bg-yellow-900/50 text-yellow-300',
  convertida: 'bg-green-900/50 text-green-300',
  descartada: 'bg-[#2a2a2a] text-[#666]',
}

const ESTADO_LABEL: Record<Solicitud['estado'], string> = {
  abierta: 'Pendiente',
  convertida: 'Convertida',
  descartada: 'Descartada',
}

function formatearFechaCorta(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function origenSolicitud(s: Solicitud) {
  if (s.tipo === 'base') return 'Pedido base'
  if (s.fabrica_conteos) return `Conteo ${formatearFechaCorta(s.fabrica_conteos.semana_desde)} → ${formatearFechaCorta(s.fabrica_conteos.semana_hasta)}`
  return 'Conteo semanal'
}

export default function SolicitudesClient({
  solicitudesIniciales,
  proveedores,
  proveedoresPorItem,
}: {
  solicitudesIniciales: Solicitud[]
  proveedores: ProveedorOption[]
  proveedoresPorItem: Record<string, string[]>
}) {
  const supabase = createClient()
  const toast = useToasts()

  const [solicitudes, setSolicitudes] = useState(solicitudesIniciales)
  const [filtro, setFiltro] = useState<'abiertas' | 'todas'>('abiertas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abiertaId, setAbiertaId] = useState<string | null>(null)
  const [items, setItems] = useState<SolicitudItem[]>([])
  const [guardado, setGuardado] = useState<'idle' | 'guardando' | 'guardado'>('idle')
  const [confirmando, setConfirmando] = useState<'generar' | 'descartar' | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const abierta = solicitudes.find(s => s.id === abiertaId) ?? null
  const nombreProveedor = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? '—'

  // Limita el select a los proveedores asociados al ítem; sin ítem (línea libre)
  // o sin asociaciones cargadas, se ve la lista completa.
  function proveedoresParaItem(itemId: string | null): ProveedorOption[] {
    const asociados = itemId ? proveedoresPorItem[itemId] : undefined
    if (!asociados?.length) return proveedores
    return proveedores.filter(p => asociados.includes(p.id))
  }

  const pendientes = solicitudes.filter(s => s.estado === 'abierta').length
  const lista = solicitudes
    .filter(s => filtro === 'todas' || s.estado === 'abierta')
    .filter(s => !desde || s.created_at.slice(0, 10) >= desde)
    .filter(s => !hasta || s.created_at.slice(0, 10) <= hasta)

  const hayFiltros = !!desde || !!hasta
  function limpiarFiltros() { setDesde(''); setHasta('') }

  function marcarGuardado() {
    setGuardado('guardando')
    setTimeout(() => setGuardado('guardado'), 300)
  }

  function abrir(s: Solicitud) {
    setAbiertaId(s.id)
    setItems([...s.compras_solicitud_items].sort((a, b) => (a.orden - b.orden) || a.descripcion.localeCompare(b.descripcion)))
    setGuardado('idle')
  }

  function cerrar() {
    setAbiertaId(null)
    setItems([])
  }

  function actualizarCantidad(itemId: string, cantidad_ajustada: number) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, cantidad_ajustada } : i))
    marcarGuardado()
    if (timers.current[itemId]) clearTimeout(timers.current[itemId])
    timers.current[itemId] = setTimeout(async () => {
      const { error } = await supabase.from('compras_solicitud_items').update({ cantidad_ajustada }).eq('id', itemId)
      if (error) toast.error('No se pudo guardar la cantidad')
    }, 500)
  }

  async function toggleIncluir(itemId: string) {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const incluir = !item.incluir
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, incluir } : i))
    marcarGuardado()
    const { error } = await supabase.from('compras_solicitud_items').update({ incluir }).eq('id', itemId)
    if (error) toast.error('No se pudo actualizar la línea')
  }

  async function cambiarProveedor(itemId: string, proveedor_id: string) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, proveedor_id } : i))
    marcarGuardado()
    const { error } = await supabase.from('compras_solicitud_items').update({ proveedor_id }).eq('id', itemId)
    if (error) toast.error('No se pudo cambiar el proveedor')
  }

  const grupos = useMemo(() => {
    const mapa = new Map<string, SolicitudItem[]>()
    for (const i of items) {
      if (!i.incluir || i.cantidad_ajustada <= 0) continue
      if (!mapa.has(i.proveedor_id)) mapa.set(i.proveedor_id, [])
      mapa.get(i.proveedor_id)!.push(i)
    }
    return [...mapa.entries()]
  }, [items])

  async function confirmarGenerar() {
    if (!abierta) return
    setProcesando(true)
    const { data: creados, error } = await supabase.rpc('convertir_solicitud_a_pedidos', { p_solicitud_id: abierta.id })
    setProcesando(false)
    if (error) { toast.error(error.message || 'No se pudieron generar los pedidos'); return }
    setSolicitudes(prev => prev.map(s => s.id === abierta.id ? { ...s, estado: 'convertida' } : s))
    toast.success(`${creados} pedido${creados === 1 ? '' : 's'} en borrador — revisalos en la tab Pedidos`)
    setConfirmando(null)
    cerrar()
  }

  async function confirmarDescartar() {
    if (!abierta) return
    setProcesando(true)
    const { error } = await supabase.rpc('descartar_solicitud', { p_solicitud_id: abierta.id, p_motivo: motivo.trim() || null })
    setProcesando(false)
    if (error) { toast.error(error.message || 'No se pudo descartar la solicitud'); return }
    setSolicitudes(prev => prev.map(s => s.id === abierta.id ? { ...s, estado: 'descartada' } : s))
    fetch('/api/fabrica/solicitudes/descartada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solicitudId: abierta.id }),
    }).catch(() => { /* notificación best-effort */ })
    toast.success('Solicitud descartada. Se le avisó a Fábrica.')
    setConfirmando(null)
    cerrar()
  }

  const inputClass = "w-24 shrink-0 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:border-[#e8c547] transition-colors disabled:opacity-40"
  const selectClass = "bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-[#e8c547] transition-colors disabled:opacity-40"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-[#f0f0f0]"><Inbox size={22} className="text-[#e8c547]" /> Solicitudes</h1>
          <p className="text-[#888] text-sm mt-0.5">Revisá lo que pide Fábrica y convertilo en pedidos a proveedores</p>
        </div>
      </div>

      <div className="flex gap-2">
        {([
          { key: 'abiertas' as const, label: 'Pendientes', count: pendientes },
          { key: 'todas' as const, label: 'Todas', count: solicitudes.length },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filtro === f.key ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] hover:text-[#f0f0f0]'
            }`}
          >
            {f.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filtro === f.key ? 'bg-black/20 text-black' : 'bg-[#2a2a2a] text-[#666]'}`}>{f.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeInputs desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} />
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {lista.length === 0 ? (
          <p className="p-8 text-center text-[#888] text-sm flex flex-col items-center gap-2">
            <History size={20} className="text-[#444]" />
            {hayFiltros ? 'Ninguna solicitud coincide con el rango de fechas.' : filtro === 'abiertas' ? 'No hay solicitudes pendientes de revisión.' : 'Todavía no hay solicitudes.'}
          </p>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {lista.map(s => (
              <button
                key={s.id}
                onClick={() => abrir(s)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#1a1a1a] transition-colors"
              >
                <span className="text-[#e8c547] shrink-0">
                  {s.tipo === 'base' ? <ClipboardList size={18} /> : <TrendingUp size={18} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f0] font-medium truncate">{origenSolicitud(s)}</p>
                  <p className="text-xs text-[#666] mt-0.5">{new Date(s.created_at).toLocaleDateString('es-AR')} · {s.compras_solicitud_items.length} ítems</p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE[s.estado]}`}>{ESTADO_LABEL[s.estado]}</span>
                <ChevronRight size={16} className="text-[#666] shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!abierta} onClose={cerrar} title={abierta ? origenSolicitud(abierta) : ''} size="xl">
        {abierta && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-[#666]">Creada el {new Date(abierta.created_at).toLocaleDateString('es-AR')}</p>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[11px] transition-opacity ${guardado === 'idle' ? 'opacity-0' : 'text-[#56d68a]'}`}>
                  {guardado === 'guardando' ? 'Guardando...' : '✓ Guardado'}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE[abierta.estado]}`}>{ESTADO_LABEL[abierta.estado]}</span>
              </div>
            </div>

            {abierta.tipo === 'complementario' && abierta.fabrica_conteos && (
              <div className="flex items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] px-4 py-3">
                <Scale size={16} className="text-[#e8c547] shrink-0" />
                <p className="text-sm text-[#ccc]">
                  Masas proyectadas ({formatearFechaCorta(abierta.fabrica_conteos.semana_desde)} a {formatearFechaCorta(abierta.fabrica_conteos.semana_hasta)}): <span className="text-[#f0f0f0] font-bold">{abierta.fabrica_conteos.masas_proyectadas}</span>
                </p>
              </div>
            )}

            <div className="rounded-xl border border-[#2a2a2a] overflow-hidden overflow-x-auto">
              {items.length === 0 ? (
                <p className="p-6 text-center text-sm text-[#666]">Esta solicitud no tiene líneas.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-surface2">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#888] uppercase tracking-wider">Ítem</th>
                      <th className="hidden sm:table-cell px-4 py-2.5 text-right text-[11px] font-semibold text-[#888] uppercase tracking-wider">
                        <span className="inline-flex items-center gap-1">Stock al contar<HelpTooltip text="Lo que había en stock cuando se cerró el conteo que generó esta solicitud — el contexto para decidir el ajuste." /></span>
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#888] uppercase tracking-wider">
                        <span className="inline-flex items-center gap-1">Ajustada<HelpTooltip text="Arrancó con el sugerido calculado al cerrar el conteo (o la cantidad de la plantilla, si es pedido base). Podés cambiarlo antes de generar los pedidos." /></span>
                      </th>
                      <th className="hidden sm:table-cell px-4 py-2.5 text-left text-[11px] font-semibold text-[#888] uppercase tracking-wider">Proveedor</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-[#888] uppercase tracking-wider">Incluir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface2">
                    {items.map(i => (
                      <tr key={i.id} className={!i.incluir ? 'opacity-40' : ''}>
                        <td className="px-4 py-2.5 min-w-40">
                          <p className="text-sm text-text truncate">{i.descripcion}</p>
                          <p className="text-xs text-[#666]">sugerido {i.cantidad_sugerida} {i.unidad}</p>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-2.5 text-sm text-[#888] text-right whitespace-nowrap">{i.stock_actual ?? '—'} {i.stock_actual != null ? i.unidad : ''}</td>
                        <td className="px-4 py-2.5">
                          <InputNumero
                            placeholder="0"
                            value={i.cantidad_ajustada === 0 ? null : i.cantidad_ajustada}
                            disabled={abierta.estado !== 'abierta'}
                            onChange={v => actualizarCantidad(i.id, v ?? 0)}
                            className={inputClass}
                          />
                        </td>
                        <td className="hidden sm:table-cell px-4 py-2.5">
                          <select
                            value={i.proveedor_id}
                            disabled={abierta.estado !== 'abierta'}
                            onChange={e => cambiarProveedor(i.id, e.target.value)}
                            className={selectClass}
                          >
                            {proveedoresParaItem(i.item_id).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={i.incluir}
                            disabled={abierta.estado !== 'abierta'}
                            onChange={() => toggleIncluir(i.id)}
                            className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {abierta.estado === 'abierta' && (
              <>
                <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">Al generar se crean {grupos.length} pedido{grupos.length === 1 ? '' : 's'}</p>
                  {grupos.length === 0 ? (
                    <p className="text-sm text-[#666]">Ninguna línea incluida todavía.</p>
                  ) : grupos.map(([proveedorId, lineas]) => (
                    <p key={proveedorId} className="flex items-center gap-1.5 text-sm text-[#ccc]">
                      <Truck size={13} className="text-[#666] shrink-0" /> {nombreProveedor(proveedorId)} <span className="text-[#666]">· {lineas.length} ítem{lineas.length === 1 ? '' : 's'}</span>
                    </p>
                  ))}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setConfirmando('generar')}
                    disabled={grupos.length === 0}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-['Syne'] font-bold text-sm py-3 rounded-xl transition-all"
                  >
                    <Send size={16} /> Generar pedidos
                  </button>
                  <button
                    onClick={() => { setMotivo(''); setConfirmando('descartar') }}
                    className="flex items-center justify-center gap-2 border border-[#2a2a2a] hover:border-red-800 hover:text-red-400 text-[#888] font-semibold text-sm py-3 px-4 rounded-xl transition-all"
                  >
                    <Ban size={16} /> Descartar
                  </button>
                </div>
              </>
            )}

            {abierta.estado === 'convertida' && (
              <p className="text-sm text-[#56d68a]">Convertida el {abierta.convertida_en ? new Date(abierta.convertida_en).toLocaleDateString('es-AR') : '—'}. Los pedidos ya están en la bandeja de Pedidos.</p>
            )}
            {abierta.estado === 'descartada' && (
              <p className="text-sm text-[#888]">Descartada el {abierta.convertida_en ? new Date(abierta.convertida_en).toLocaleDateString('es-AR') : '—'}.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={confirmando === 'generar'} onClose={() => !procesando && setConfirmando(null)} title="Generar pedidos">
        <p className="text-sm text-[#888]">
          Se van a crear <span className="text-[#f0f0f0] font-medium">{grupos.length} pedido{grupos.length === 1 ? '' : 's'} en borrador</span>, uno por proveedor, con las líneas incluidas. Vas a poder revisarlos antes de enviarlos por WhatsApp.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setConfirmando(null)} disabled={procesando} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarGenerar} disabled={procesando} className="flex-1 py-2.5 bg-[#e8c547] hover:opacity-90 text-black rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {procesando ? 'Generando...' : 'Confirmar'}
          </button>
        </div>
      </Modal>

      <Modal open={confirmando === 'descartar'} onClose={() => !procesando && setConfirmando(null)} title="Descartar solicitud" accent="red">
        <p className="text-sm text-[#888]">No se va a crear ningún pedido. Fábrica va a recibir el aviso y va a poder rehacer este conteo hoy mismo.</p>
        <div className="mt-3">
          <label className="block text-xs text-[#888] mb-1">Motivo (opcional) — se lo avisamos a Fábrica</label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            disabled={procesando}
            placeholder="Ej: Faltó contar la cámara de arriba"
            rows={2}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors disabled:opacity-40 resize-none"
          />
        </div>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setConfirmando(null)} disabled={procesando} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarDescartar} disabled={procesando} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {procesando ? 'Descartando...' : 'Descartar'}
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
