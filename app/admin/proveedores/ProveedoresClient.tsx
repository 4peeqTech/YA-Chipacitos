'use client'

import { useState, useTransition } from 'react'
import {
  Truck, Plus, Pencil, Archive, ArchiveRestore, Trash2, MessageCircle,
  User, Phone, Mail, MapPin, CreditCard, Package, ClipboardList, PackageSearch, Star,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { normalizarTelefonoAR, formatearTelefono } from '@/lib/compras/telefono'
import Modal from '@/components/ui/Modal'

interface InsumoAsociado {
  itemId: string
  itemNombre: string
  unidad: string
  esPrincipal: boolean
  precioRef: number | null
}

interface PedidoResumen {
  id: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  createdAt: string
}

interface Proveedor {
  id: string
  nombre: string
  categoria: string | null
  cuit: string | null
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_email: string | null
  direccion: string | null
  tiempo_entrega: string | null
  periodicidad_compra: string | null
  financiacion: string | null
  condiciones_pago: string | null
  notas: string | null
  estado: 'activo' | 'archivado'
  maneja_stock: boolean
  local: string | null
}

type FiltroEstado = 'activo' | 'archivado' | 'todos'

const emptyForm = (): Partial<Proveedor> => ({
  nombre: '',
  categoria: '',
  cuit: '',
  contacto_nombre: '',
  contacto_telefono: '',
  contacto_email: '',
  direccion: '',
  tiempo_entrega: '',
  periodicidad_compra: '',
  financiacion: '',
  condiciones_pago: '',
  notas: '',
  estado: 'activo',
  maneja_stock: false,
  local: null,
})

export default function ProveedoresClient({
  proveedoresIniciales,
  proveedorIdsConInsumos,
}: {
  proveedoresIniciales: Proveedor[]
  proveedorIdsConInsumos: string[]
}) {
  const supabase = createClient()
  const [proveedores, setProveedores] = useState<Proveedor[]>(proveedoresIniciales)
  const [filtro, setFiltro] = useState<FiltroEstado>('activo')
  const [soloSinInsumos, setSoloSinInsumos] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<Proveedor>>(emptyForm())
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const [ficha, setFicha] = useState<Proveedor | null>(null)
  const [fichaCargando, setFichaCargando] = useState(false)
  const [fichaInsumos, setFichaInsumos] = useState<InsumoAsociado[]>([])
  const [fichaPedidos, setFichaPedidos] = useState<PedidoResumen[]>([])

  const idsConInsumos = new Set(proveedorIdsConInsumos)

  const filtrados = proveedores.filter(p => {
    const matchEstado = filtro === 'todos' || p.estado === filtro
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchInsumos = !soloSinInsumos || !idsConInsumos.has(p.id)
    return matchEstado && matchBusqueda && matchInsumos
  })

  async function abrirFicha(p: Proveedor) {
    setFicha(p)
    setFichaCargando(true)
    const [{ data: insumos }, { data: pedidos }] = await Promise.all([
      supabase
        .from('compras_item_proveedores')
        .select('item_id, es_principal, precio_ref, compras_items(nombre, unidad)')
        .eq('proveedor_id', p.id)
        .eq('activo', true),
      supabase
        .from('compras_pedidos')
        .select('id, estado, created_at')
        .eq('proveedor_id', p.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    type FilaInsumoAsociado = {
      item_id: string
      es_principal: boolean
      precio_ref: number | null
      compras_items: { nombre: string; unidad: string } | null
    }
    setFichaInsumos(
      ((insumos ?? []) as unknown as FilaInsumoAsociado[]).map(i => ({
        itemId: i.item_id,
        itemNombre: i.compras_items?.nombre ?? '—',
        unidad: i.compras_items?.unidad ?? '',
        esPrincipal: i.es_principal,
        precioRef: i.precio_ref,
      }))
    )
    setFichaPedidos((pedidos ?? []).map(p => ({ id: p.id, estado: p.estado, createdAt: p.created_at })))
    setFichaCargando(false)
  }

  function cerrarFicha() {
    setFicha(null)
    setFichaInsumos([])
    setFichaPedidos([])
  }

  function abrirCrear() {
    setForm(emptyForm())
    setEditando(null)
    setCreando(true)
    setError('')
  }

  function abrirEditar(p: Proveedor) {
    setForm({ ...p })
    setEditando(p)
    setCreando(false)
    setError('')
  }

  function cerrarForm() {
    setCreando(false)
    setEditando(null)
    setError('')
  }

  async function guardar() {
    if (!form.nombre?.trim()) { setError('El nombre es requerido'); return }
    if (form.contacto_telefono?.trim() && !normalizarTelefonoAR(form.contacto_telefono)) {
      setError('El teléfono de contacto no parece un número argentino válido')
      return
    }
    setError('')

    const datos = {
      ...form,
      contacto_telefono: form.contacto_telefono?.trim() ? normalizarTelefonoAR(form.contacto_telefono) : null,
      updated_at: new Date().toISOString(),
    }

    startTransition(async () => {
      if (creando) {
        const { data, error: err } = await supabase
          .from('proveedores')
          .insert([{ ...datos, estado: 'activo' }])
          .select()
          .single()
        if (err) { setError(err.message); return }
        setProveedores(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      } else if (editando) {
        const { data, error: err } = await supabase
          .from('proveedores')
          .update(datos)
          .eq('id', editando.id)
          .select()
          .single()
        if (err) { setError(err.message); return }
        setProveedores(prev => prev.map(p => p.id === editando.id ? data : p))
      }
      cerrarForm()
    })
  }

  async function archivar(p: Proveedor) {
    const nuevoEstado = p.estado === 'activo' ? 'archivado' : 'activo'
    const { data, error: err } = await supabase
      .from('proveedores')
      .update({ estado: nuevoEstado })
      .eq('id', p.id)
      .select()
      .single()
    if (err) { setError(err.message); return }
    setProveedores(prev => prev.map(x => x.id === p.id ? data : x))
  }

  async function eliminar(p: Proveedor) {
    if (!confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error: err } = await supabase.from('proveedores').delete().eq('id', p.id)
    if (err) { setError(err.message); return }
    setProveedores(prev => prev.filter(x => x.id !== p.id))
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"
  const estadoPedidoBadge: Record<PedidoResumen['estado'], string> = {
    borrador: 'bg-[#2a2a2a] text-[#ccc]',
    enviado: 'bg-yellow-900/50 text-yellow-300',
    cerrado: 'bg-green-900/50 text-green-300',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#f0f0f0]"><Truck size={22} className="text-[#e8c547]" /> Proveedores</h1>
          <p className="text-[#888] text-sm mt-0.5">{proveedores.filter(p => p.estado === 'activo').length} activos · {proveedores.filter(p => p.estado === 'archivado').length} archivados</p>
        </div>
        <button onClick={abrirCrear} className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          <Plus size={16} /> Nuevo proveedor
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar proveedor..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#e8c547] w-64"
        />
        {(['activo', 'archivado', 'todos'] as FiltroEstado[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${filtro === f ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={() => setSoloSinInsumos(v => !v)}
          title="De la lista semilla de proveedores de gastos, separá los que además son proveedores reales de Compras"
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${soloSinInsumos ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
        >
          Sin insumos asociados
        </button>
      </div>

      {/* Form modal */}
      <Modal open={creando || !!editando} onClose={cerrarForm} title={creando ? 'Nuevo proveedor' : `Editar — ${editando?.nombre}`} size="xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className={labelClass}>Nombre *</label>
              <input className={inputClass} value={form.nombre ?? ''} onChange={e => setForm(f => ({...f, nombre: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Categoría</label>
              <input className={inputClass} placeholder="Ej: Lácteos, Harinas..." value={form.categoria ?? ''} onChange={e => setForm(f => ({...f, categoria: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}><CreditCard size={13} className="text-[#666]" /> CUIT</label>
              <input className={inputClass} placeholder="20-12345678-9" value={form.cuit ?? ''} onChange={e => setForm(f => ({...f, cuit: e.target.value}))} />
            </div>

            <div>
              <label className={labelClass}><User size={13} className="text-[#666]" /> Contacto</label>
              <input className={inputClass} placeholder="Nombre" value={form.contacto_nombre ?? ''} onChange={e => setForm(f => ({...f, contacto_nombre: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}><Phone size={13} className="text-[#666]" /> Teléfono</label>
              <input className={inputClass} placeholder="+54 9..." value={form.contacto_telefono ?? ''} onChange={e => setForm(f => ({...f, contacto_telefono: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}><Mail size={13} className="text-[#666]" /> Email</label>
              <input className={inputClass} type="email" value={form.contacto_email ?? ''} onChange={e => setForm(f => ({...f, contacto_email: e.target.value}))} />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelClass}><MapPin size={13} className="text-[#666]" /> Dirección</label>
              <input className={inputClass} value={form.direccion ?? ''} onChange={e => setForm(f => ({...f, direccion: e.target.value}))} />
            </div>

            <div>
              <label className={labelClass}>Tiempo de entrega</label>
              <input className={inputClass} placeholder="Ej: 24hs, 3-5 días" value={form.tiempo_entrega ?? ''} onChange={e => setForm(f => ({...f, tiempo_entrega: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Periodicidad de compra</label>
              <input className={inputClass} placeholder="Ej: Semanal, Mensual" value={form.periodicidad_compra ?? ''} onChange={e => setForm(f => ({...f, periodicidad_compra: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Financiación</label>
              <input className={inputClass} placeholder="Ej: 30 días, Contado" value={form.financiacion ?? ''} onChange={e => setForm(f => ({...f, financiacion: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Condiciones de pago</label>
              <input className={inputClass} placeholder="Ej: Factura A, efectivo" value={form.condiciones_pago ?? ''} onChange={e => setForm(f => ({...f, condiciones_pago: e.target.value}))} />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelClass}>Notas</label>
              <textarea className={`${inputClass} resize-none`} rows={2} value={form.notas ?? ''} onChange={e => setForm(f => ({...f, notas: e.target.value}))} />
            </div>

            <div className="md:col-span-2 lg:col-span-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="maneja_stock"
                checked={form.maneja_stock ?? false}
                onChange={e => setForm(f => ({...f, maneja_stock: e.target.checked}))}
                className="w-4 h-4 accent-[#e8c547]"
              />
              <label htmlFor="maneja_stock" className="text-sm text-[#f0f0f0]">
                Maneja stock (aparece como proveedor de insumos en Compras)
              </label>
            </div>

            <div>
              <label className={labelClass}>Local (facturación/entrega)</label>
              <select className={inputClass} value={form.local ?? ''} onChange={e => setForm(f => ({...f, local: e.target.value || null}))}>
                <option value="">Sin asignar</option>
                <option value="paraguay">Paraguay 388</option>
                <option value="lagrana">Gdor. Lagraña 388</option>
              </select>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={guardar} disabled={isPending} className="flex-1 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={cerrarForm} className="flex-1 border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0] font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
              Cancelar
            </button>
          </div>
      </Modal>

      {/* Lista */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888] flex flex-col items-center gap-2">
            <PackageSearch size={20} className="text-[#444]" />
            No hay proveedores
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Categoría</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden lg:table-cell">Entrega</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden lg:table-cell">Periodicidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden lg:table-cell">Financiación</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {filtrados.map(p => (
                  <tr key={p.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">
                      <button onClick={() => abrirFicha(p)} className="hover:text-[#e8c547] hover:underline text-left">{p.nombre}</button>
                    </td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{p.categoria || '—'}</td>
                    <td className="px-4 py-3 text-[#888] hidden lg:table-cell">{p.tiempo_entrega || '—'}</td>
                    <td className="px-4 py-3 text-[#888] hidden lg:table-cell">{p.periodicidad_compra || '—'}</td>
                    <td className="px-4 py-3 text-[#888] hidden lg:table-cell">{p.financiacion || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.estado === 'activo' ? 'bg-green-900/50 text-green-300' : 'bg-[#2a2a2a] text-[#666]'}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        {normalizarTelefonoAR(p.contacto_telefono) && (
                          <a
                            href={`https://wa.me/${normalizarTelefonoAR(p.contacto_telefono)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`WhatsApp — ${formatearTelefono(p.contacto_telefono)}`}
                            aria-label={`WhatsApp a ${p.nombre}`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-green-400 hover:bg-[#2a2a2a] transition-colors"
                          >
                            <MessageCircle size={15} />
                          </a>
                        )}
                        <button
                          onClick={() => abrirEditar(p)}
                          title="Editar"
                          aria-label={`Editar ${p.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => archivar(p)}
                          title={p.estado === 'activo' ? 'Archivar' : 'Reactivar'}
                          aria-label={p.estado === 'activo' ? `Archivar ${p.nombre}` : `Reactivar ${p.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#f0f0f0] hover:bg-[#2a2a2a] transition-colors"
                        >
                          {p.estado === 'activo' ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                        </button>
                        <button
                          onClick={() => eliminar(p)}
                          title="Eliminar"
                          aria-label={`Eliminar ${p.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!ficha} onClose={cerrarFicha} title={ficha?.nombre ?? ''} size="lg">
        {ficha && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <p className="flex items-center gap-1.5"><User size={13} className="text-[#666] shrink-0" /><span className="text-[#f0f0f0]">{ficha.contacto_nombre || '—'}</span></p>
              <p className="flex items-center gap-1.5">
                <Phone size={13} className="text-[#666] shrink-0" />
                <span className="text-[#f0f0f0]">{ficha.contacto_telefono ? formatearTelefono(ficha.contacto_telefono) : '—'}</span>
                {normalizarTelefonoAR(ficha.contacto_telefono) && (
                  <a
                    href={`https://wa.me/${normalizarTelefonoAR(ficha.contacto_telefono)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-green-400 hover:underline"
                  >
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                )}
              </p>
              <p className="flex items-center gap-1.5"><Mail size={13} className="text-[#666] shrink-0" /><span className="text-[#f0f0f0]">{ficha.contacto_email || '—'}</span></p>
              <p className="flex items-center gap-1.5"><CreditCard size={13} className="text-[#666] shrink-0" /><span className="text-[#f0f0f0]">{ficha.cuit || '—'}</span></p>
              <p className="sm:col-span-2 flex items-center gap-1.5"><MapPin size={13} className="text-[#666] shrink-0" /><span className="text-[#f0f0f0]">{ficha.direccion || '—'}</span></p>
            </div>

            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider mb-2"><Package size={13} /> Insumos asociados</h3>
              {fichaCargando ? (
                <p className="text-sm text-[#666]">Cargando...</p>
              ) : fichaInsumos.length === 0 ? (
                <p className="text-sm text-[#666]">Sin insumos asociados en Compras.</p>
              ) : (
                <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
                  <div className="divide-y divide-[#1a1a1a]">
                    {fichaInsumos.map(i => (
                      <div key={i.itemId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <span className="text-[#f0f0f0] flex items-center gap-1.5">
                          {i.itemNombre} <span className="text-[#666]">({i.unidad})</span>
                          {i.esPrincipal && <span className="flex items-center gap-1 text-xs text-[#e8c547]"><Star size={11} fill="currentColor" /> principal</span>}
                        </span>
                        <span className="text-[#888]">{i.precioRef != null ? `$${i.precioRef.toLocaleString('es-AR')}` : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider mb-2"><ClipboardList size={13} /> Últimos pedidos</h3>
              {fichaCargando ? (
                <p className="text-sm text-[#666]">Cargando...</p>
              ) : fichaPedidos.length === 0 ? (
                <p className="text-sm text-[#666]">Todavía no tiene pedidos.</p>
              ) : (
                <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
                  <div className="divide-y divide-[#1a1a1a]">
                    {fichaPedidos.map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <span className="text-[#f0f0f0]">{new Date(p.createdAt).toLocaleDateString('es-AR')}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoPedidoBadge[p.estado]}`}>{p.estado}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
