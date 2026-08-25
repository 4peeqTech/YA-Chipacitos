'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizarTelefonoAR, formatearTelefono } from '@/lib/compras/telefono'

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

export default function ProveedoresClient({ proveedoresIniciales }: { proveedoresIniciales: Proveedor[] }) {
  const supabase = createClient()
  const [proveedores, setProveedores] = useState<Proveedor[]>(proveedoresIniciales)
  const [filtro, setFiltro] = useState<FiltroEstado>('activo')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<Proveedor>>(emptyForm())
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const filtrados = proveedores.filter(p => {
    const matchEstado = filtro === 'todos' || p.estado === filtro
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchEstado && matchBusqueda
  })

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
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Proveedores</h1>
          <p className="text-[#888] text-sm mt-0.5">{proveedores.filter(p => p.estado === 'activo').length} activos · {proveedores.filter(p => p.estado === 'archivado').length} archivados</p>
        </div>
        <button onClick={abrirCrear} className="bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          + Nuevo proveedor
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
      </div>

      {/* Form modal */}
      {(creando || editando) && (
        <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#f0f0f0]">{creando ? 'Nuevo proveedor' : `Editar — ${editando?.nombre}`}</h2>

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
              <label className={labelClass}>CUIT</label>
              <input className={inputClass} placeholder="20-12345678-9" value={form.cuit ?? ''} onChange={e => setForm(f => ({...f, cuit: e.target.value}))} />
            </div>

            <div>
              <label className={labelClass}>Contacto</label>
              <input className={inputClass} placeholder="Nombre" value={form.contacto_nombre ?? ''} onChange={e => setForm(f => ({...f, contacto_nombre: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Teléfono</label>
              <input className={inputClass} placeholder="+54 9..." value={form.contacto_telefono ?? ''} onChange={e => setForm(f => ({...f, contacto_telefono: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} type="email" value={form.contacto_email ?? ''} onChange={e => setForm(f => ({...f, contacto_email: e.target.value}))} />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelClass}>Dirección</label>
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

          <div className="flex gap-3">
            <button onClick={guardar} disabled={isPending} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-6 rounded-xl transition-all">
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={cerrarForm} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-6 rounded-xl transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay proveedores</p>
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
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{p.nombre}</td>
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
                      <div className="flex gap-2 justify-end">
                        {normalizarTelefonoAR(p.contacto_telefono) && (
                          <a
                            href={`https://wa.me/${normalizarTelefonoAR(p.contacto_telefono)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={formatearTelefono(p.contacto_telefono)}
                            className="text-xs text-[#888] hover:text-green-400 transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]"
                          >
                            WhatsApp
                          </a>
                        )}
                        <button onClick={() => abrirEditar(p)} className="text-xs text-[#888] hover:text-[#e8c547] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          Editar
                        </button>
                        <button onClick={() => archivar(p)} className="text-xs text-[#888] hover:text-[#f0f0f0] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          {p.estado === 'activo' ? 'Archivar' : 'Activar'}
                        </button>
                        <button onClick={() => eliminar(p)} className="text-xs text-[#888] hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          Eliminar
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
    </div>
  )
}
