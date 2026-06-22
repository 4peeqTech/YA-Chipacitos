'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Producto, TipoProducto, DestinoProducto } from '@/lib/types'
import Card from '@/components/ui/Card'

interface Props {
  productosIniciales: Producto[]
  mapeos: { nombre_posberry: string; producto_id: string | null }[]
}

const CATEGORIAS = [
  'Bolsas Congelados',
  'Cajas Congelados',
  'Toppings',
  'Productos Ya!',
  'Masas',
  'Insumos Facturas',
  'Insumos General',
  'Bolsas Ya!',
  'Cajas Ya!',
  'Vasos Café Ya!',
]

const FORM_VACIO = { nombre: '', descripcion: '', unidad: 'unidad', tipo: 'producto' as TipoProducto, destino: 'fabrica' as DestinoProducto, categoria: '', precio: '', codigo: '' }

export default function AdminCatalogoClient({ productosIniciales, mapeos }: Props) {
  const mapeosPorProductoId = mapeos.reduce<Record<string, string[]>>((acc, m) => {
    if (m.producto_id) {
      if (!acc[m.producto_id]) acc[m.producto_id] = []
      acc[m.producto_id].push(m.nombre_posberry)
    }
    return acc
  }, {})
  const [productos, setProductos] = useState(productosIniciales)
  const [tab, setTab] = useState<DestinoProducto>('fabrica')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [formEdit, setFormEdit] = useState({ nombre: '', descripcion: '', unidad: '', categoria: '', precio: '', codigo: '' })
  const [guardando, setGuardando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [importMsg, setImportMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const inputCsvRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  function descargarCSV() {
    const cabecera = ['codigo', 'nombre', 'descripcion', 'unidad', 'tipo', 'destino', 'categoria', 'precio', 'activo']
    const filas = filtrados.map(p => [
      p.codigo ?? '',
      p.nombre,
      p.descripcion ?? '',
      p.unidad,
      p.tipo,
      p.destino,
      p.categoria ?? '',
      p.precio ?? '',
      p.activo ? 'true' : 'false',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [cabecera.join(','), ...filas].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `catalogo_${tab}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function subirCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportMsg(null)
    try {
      const text = await file.text()
      const lines = text.trim().split('\n')
      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
      const rows = lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || []
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '').replace(/""/g, '"') })
        return obj
      }).filter(r => r.nombre)

      let creados = 0, actualizados = 0, errores = 0
      for (const row of rows) {
        const payload = {
          nombre: row.nombre,
          descripcion: row.descripcion || null,
          unidad: row.unidad || 'unidad',
          tipo: (row.tipo as TipoProducto) || (tab === 'fabrica' ? 'producto' : 'insumo'),
          destino: (row.destino as DestinoProducto) || tab,
          categoria: row.categoria || null,
          precio: row.precio ? parseFloat(row.precio.replace(',', '.')) : null,
          codigo: row.codigo ? parseInt(row.codigo) : null,
          activo: row.activo !== 'false',
        }
        const existing = productos.find(p => p.nombre.toLowerCase() === payload.nombre.toLowerCase() && p.destino === payload.destino)
        if (existing) {
          const { data } = await supabase.from('productos').update(payload).eq('id', existing.id).select().single()
          if (data) { setProductos(prev => prev.map(p => p.id === data.id ? data : p)); actualizados++ }
          else errores++
        } else {
          const { data } = await supabase.from('productos').insert(payload).select().single()
          if (data) { setProductos(prev => [...prev, data]); creados++ }
          else errores++
        }
      }
      setImportMsg({ tipo: 'ok', texto: `Importado: ${creados} creados, ${actualizados} actualizados${errores > 0 ? `, ${errores} errores` : ''}.` })
    } catch {
      setImportMsg({ tipo: 'error', texto: 'Error al leer el archivo. Verificá el formato CSV.' })
    }
    setImportando(false)
    if (inputCsvRef.current) inputCsvRef.current.value = ''
  }

  const filtrados = productos.filter(p => p.destino === tab)
  const activos = filtrados.filter(p => p.activo).length

  async function toggleActivo(producto: Producto) {
    const { data } = await supabase
      .from('productos').update({ activo: !producto.activo }).eq('id', producto.id).select().single()
    if (data) setProductos(prev => prev.map(p => p.id === data.id ? data : p))
  }

  async function agregar() {
    if (!form.nombre) return
    setGuardando(true)
    const { data } = await supabase
      .from('productos').insert({ ...form, precio: form.precio ? parseFloat(form.precio.replace(',', '.')) : null, codigo: form.codigo ? parseInt(form.codigo) : null, activo: true }).select().single()
    if (data) { setProductos(prev => [...prev, data]); setModalNuevo(false); setForm({ ...FORM_VACIO, destino: tab, tipo: tab === 'fabrica' ? 'producto' : 'insumo' }) }
    setGuardando(false)
  }

  function abrirEdicion(p: Producto) {
    setEditando(p)
    setFormEdit({ nombre: p.nombre, descripcion: p.descripcion ?? '', unidad: p.unidad, categoria: p.categoria ?? '', precio: p.precio != null ? String(p.precio) : '', codigo: p.codigo != null ? String(p.codigo) : '' })
  }

  async function guardarEdicion() {
    if (!editando || !formEdit.nombre) return
    setGuardando(true)
    const { data } = await supabase
      .from('productos')
      .update({ nombre: formEdit.nombre, descripcion: formEdit.descripcion, unidad: formEdit.unidad, categoria: formEdit.categoria || null, precio: formEdit.precio ? parseFloat(formEdit.precio.replace(',', '.')) : null, codigo: formEdit.codigo ? parseInt(formEdit.codigo) : null })
      .eq('id', editando.id).select().single()
    if (data) { setProductos(prev => prev.map(p => p.id === data.id ? data : p)); setEditando(null) }
    setGuardando(false)
  }

  function abrirNuevo() {
    setForm({ ...FORM_VACIO, destino: tab, tipo: tab === 'fabrica' ? 'producto' : 'insumo' })
    setModalNuevo(true)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-['Syne'] font-bold text-xl text-[#f0f0f0]">Catálogo de productos</h1>
        <p className="text-xs text-[#888] mt-1">Gestioná los productos y insumos disponibles para pedidos.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['fabrica', 'deposito'] as DestinoProducto[]).map(d => (
          <button
            key={d}
            onClick={() => setTab(d)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === d ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {d === 'fabrica' ? '🚚 Fábrica' : '📦 Depósito'}
          </button>
        ))}
      </div>

      {/* CSV */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={descargarCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#e8c547] hover:border-[#e8c547]/40 transition-colors">
          ↓ Descargar CSV
        </button>
        <label className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#f0f0f0] hover:border-[#e8c547]/40 transition-colors cursor-pointer ${importando ? 'opacity-50 pointer-events-none' : ''}`}>
          ↑ {importando ? 'Importando...' : 'Subir CSV'}
          <input ref={inputCsvRef} type="file" accept=".csv" className="hidden" onChange={subirCSV} />
        </label>
        {importMsg && (
          <span className={`text-xs ${importMsg.tipo === 'ok' ? 'text-[#56d68a]' : 'text-red-400'}`}>
            {importMsg.texto}
          </span>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[#e8c547] uppercase tracking-wider">
            {tab === 'fabrica' ? 'Productos' : 'Insumos'} · {tab === 'fabrica' ? 'Fábrica' : 'Depósito'}
          </p>
          <span className="text-[11px] text-[#888]">{activos} activos de {filtrados.length}</span>
        </div>
        <Card>
          {filtrados.length === 0 ? (
            <p className="text-xs text-[#888] text-center py-6">Sin {tab === 'fabrica' ? 'productos' : 'insumos'} en el catálogo.</p>
          ) : (
            filtrados.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-2 px-3 py-3 ${i < filtrados.length - 1 ? 'border-b border-[#2a2a2a]' : ''}`}>
                {p.codigo != null && (
                  <span className="shrink-0 w-8 text-center text-[11px] font-bold text-[#e8c547] bg-[#e8c547]/10 rounded-md py-0.5">{p.codigo}</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${p.activo ? 'text-[#f0f0f0]' : 'text-[#555]'}`}>{p.nombre}</p>
                  <p className="text-[11px] text-[#555] mt-0.5 flex flex-wrap items-center gap-1">
                    <span>{p.unidad}</span>
                    {p.categoria ? <span className="px-1.5 py-0.5 rounded bg-[#1e1e1e] text-[#e8c547] text-[10px] font-medium">{p.categoria}</span> : null}
                    {p.precio != null ? <span className="text-[#56d68a]">${p.precio.toLocaleString('es-AR')}</span> : null}
                    {p.descripcion ? <span>· {p.descripcion}</span> : null}
                  </p>
                  {(mapeosPorProductoId[p.id] || []).length > 0 && (
                    <p className="text-[10px] text-[#555] mt-0.5 flex flex-wrap gap-1">
                      <span className="text-[#444]">Posberry:</span>
                      {mapeosPorProductoId[p.id].map(n => (
                        <span key={n} className="px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-[#777]">{n}</span>
                      ))}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => abrirEdicion(p)}
                  className="text-[#444] hover:text-[#e8c547] transition-colors text-xs px-1.5 py-1 rounded shrink-0"
                  title="Editar"
                >
                  ✏️
                </button>
                <button
                  onClick={() => toggleActivo(p)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${p.activo ? 'bg-[#e8c547]' : 'bg-[#2a2a2a]'}`}
                >
                  <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full shadow transition-all ${p.activo ? 'right-[3px] bg-black' : 'left-[3px] bg-[#888]'}`} />
                </button>
              </div>
            ))
          )}
        </Card>
      </div>

      <button
        onClick={abrirNuevo}
        className="w-full border border-dashed border-[#e8c547]/30 text-[#e8c547] rounded-lg py-2.5 text-xs font-medium hover:bg-[#e8c547]/5 transition-colors"
      >
        + Agregar {tab === 'fabrica' ? 'producto' : 'insumo'}
      </button>

      {modalNuevo && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-t-2xl w-full max-w-lg p-5 space-y-3">
            <h3 className="font-['Syne'] font-bold text-sm text-[#f0f0f0]">
              Nuevo {tab === 'fabrica' ? 'producto' : 'insumo'} · {tab === 'fabrica' ? 'Fábrica' : 'Depósito'}
            </h3>
            {[
              { label: 'Código', key: 'codigo', placeholder: '1', type: 'number' },
              { label: 'Nombre *', key: 'nombre', placeholder: tab === 'fabrica' ? 'Chipacitos clásicos' : 'Harina de mandioca 1kg', type: 'text' },
              { label: 'Descripción', key: 'descripcion', placeholder: 'Descripción opcional', type: 'text' },
              { label: 'Unidad', key: 'unidad', placeholder: 'unidad, kg, bolsa...', type: 'text' },
              { label: 'Precio', key: 'precio', placeholder: '0.00', type: 'number' },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder} min={type === 'number' ? '0' : undefined} step={key === 'precio' ? '0.01' : '1'} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Categoría</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs text-[#f0f0f0] focus:outline-none focus:border-[#e8c547]">
                <option value="">Sin categoría</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModalNuevo(false)}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-xs font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={agregar} disabled={guardando || !form.nombre}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-xs font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-t-2xl w-full max-w-lg p-5 space-y-3">
            <h3 className="font-['Syne'] font-bold text-sm text-[#f0f0f0]">Editar producto</h3>
            {[
              { label: 'Código', key: 'codigo', type: 'number' },
              { label: 'Nombre *', key: 'nombre', type: 'text' },
              { label: 'Descripción', key: 'descripcion', type: 'text' },
              { label: 'Unidad', key: 'unidad', type: 'text' },
              { label: 'Precio', key: 'precio', type: 'number' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{label}</label>
                <input type={type} value={(formEdit as Record<string, string>)[key]}
                  onChange={e => setFormEdit(f => ({ ...f, [key]: e.target.value }))}
                  min={type === 'number' ? '0' : undefined} step={key === 'precio' ? '0.01' : '1'} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Categoría</label>
              <select value={formEdit.categoria} onChange={e => setFormEdit(f => ({ ...f, categoria: e.target.value }))}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs text-[#f0f0f0] focus:outline-none focus:border-[#e8c547]">
                <option value="">Sin categoría</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditando(null)}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-xs font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={guardando || !formEdit.nombre}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-xs font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
