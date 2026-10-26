'use client'

import { useMemo, useRef, useState } from 'react'
import {
  IconBuildingFactory2, IconDownload, IconLayersSubtract, IconPackage, IconPlus, IconSearch, IconTrash, IconUpload,
} from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { Producto, TipoProducto, DestinoProducto } from '@/lib/types'
import HelpTooltip from '@/components/ui/HelpTooltip'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToasts, ToastStack } from '@/components/ui/Toast'
import { Puntos } from '@/components/ui/Cargando'
import SelectorIcono from '@/components/pedidos/SelectorIcono'
import { estiloProducto, ordenCategoria } from '@/lib/pedidos/categorias'

// Catálogo de productos (admin). Grilla de tarjetas por categoría: cada producto se
// reconoce por su ícono; se toca la tarjeta para editarlo. "Agregar" y el CSV quedan
// arriba, siempre a mano (antes había que bajar hasta el final de la lista).

interface Parametro { id: string; nombre: string }
interface PresentacionParametro extends Parametro { pesoKg: number }

interface Props {
  productosIniciales: Producto[]
  mapeos: { nombre_posberry: string; producto_id: string | null }[]
  sabores: Parametro[]
  presentaciones: PresentacionParametro[]
  tamanios: Parametro[]
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

const SIN_CATEGORIA = 'Sin categoría'

const FORM_VACIO = { nombre: '', descripcion: '', unidad: 'unidad', tipo: 'producto' as TipoProducto, destino: 'fabrica' as DestinoProducto, categoria: '', precio: '', codigo: '', presentacion_id: '', sabor_id: '', tamanio_id: '', icono: '', activo: true }
type FormProducto = typeof FORM_VACIO

function mensajeErrorProducto(error: { code?: string; message: string }) {
  if (error.code === '23505') return 'Ya existe un producto con esa combinación de presentación, sabor y tamaño.'
  return error.message || 'No se pudo guardar el producto.'
}

const campo = 'w-full rounded-field border border-border bg-surface2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none'
const etiqueta = 'mb-1.5 block text-xs font-medium text-muted'

// sabores, presentaciones y tamanios llegan para la terna (oculta por ahora).
export default function AdminCatalogoClient({ productosIniciales, mapeos }: Props) {
  const mapeosPorProductoId = useMemo(() => mapeos.reduce<Record<string, string[]>>((acc, m) => {
    if (m.producto_id) (acc[m.producto_id] ??= []).push(m.nombre_posberry)
    return acc
  }, {}), [mapeos])
  const [productos, setProductos] = useState(productosIniciales)
  const [tab, setTab] = useState<DestinoProducto>('fabrica')
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [estado, setEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos')
  // null = cerrado; 'nuevo' = agregar; Producto = editar ese.
  const [modal, setModal] = useState<'nuevo' | Producto | null>(null)
  const [form, setForm] = useState<FormProducto>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [importMsg, setImportMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const inputCsvRef = useRef<HTMLInputElement>(null)
  const [supabase] = useState(() => createClient())
  const toast = useToasts()
  const { confirmar, dialog } = useConfirm()

  const delTab = productos.filter(p => p.destino === tab)
  const activos = delTab.filter(p => p.activo).length
  const esFabrica = tab === 'fabrica'
  const nombreTipo = esFabrica ? 'producto' : 'insumo'

  // ── CSV (igual que antes) ──────────────────────────────────────────────
  function csvCell(v: string | number | null | undefined) {
    return `"${String(v ?? '').replace(/"/g, '""')}"`
  }

  function descargarCSV() {
    const cabecera = ['codigo', 'nombre', 'descripcion', 'unidad', 'tipo', 'destino', 'categoria', 'precio', 'activo']
    const filas = delTab.map(p => [
      csvCell(p.codigo), csvCell(p.nombre), csvCell(p.descripcion), csvCell(p.unidad), csvCell(p.tipo),
      csvCell(p.destino), csvCell(p.categoria), csvCell(p.precio), csvCell(p.activo ? 'true' : 'false'),
    ].join(','))
    const csv = [cabecera.map(csvCell).join(','), ...filas].join('\r\n')
    // BOM: así Excel abre bien los acentos.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `catalogo_${tab}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function parsearCSV(text: string): Record<string, string>[] {
    const rows: string[][] = []
    let col = '', row: string[] = [], inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1]
      if (inQuotes) {
        if (ch === '"' && next === '"') { col += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else col += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { row.push(col); col = '' }
        else if (ch === '\n' || (ch === '\r' && next === '\n')) {
          row.push(col); rows.push(row); row = []; col = ''
          if (ch === '\r') i++
        } else col += ch
      }
    }
    if (col || row.length) { row.push(col); rows.push(row) }
    if (rows.length < 2) return []
    const headers = rows[0]
    return rows.slice(1).filter(r => r.some(v => v.trim())).map(r => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h.trim()] = (r[i] ?? '').trim() })
      return obj
    })
  }

  async function subirCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportMsg(null)
    try {
      const text = await file.text()
      const rows = parsearCSV(text).filter(r => r.nombre)
      let creados = 0, actualizados = 0, errores = 0
      for (const row of rows) {
        const payload = {
          nombre: row.nombre,
          descripcion: row.descripcion || null,
          unidad: row.unidad || 'unidad',
          tipo: (row.tipo as TipoProducto) || (esFabrica ? 'producto' : 'insumo'),
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

  // ── Acciones ───────────────────────────────────────────────────────────
  function abrirNuevo() {
    setForm({ ...FORM_VACIO, destino: tab, tipo: esFabrica ? 'producto' : 'insumo', categoria: categoria && categoria !== SIN_CATEGORIA ? categoria : '' })
    setErrorForm(null)
    setModal('nuevo')
  }

  function abrirEdicion(p: Producto) {
    setForm({
      nombre: p.nombre, descripcion: p.descripcion ?? '', unidad: p.unidad, tipo: p.tipo, destino: p.destino,
      categoria: p.categoria ?? '', precio: p.precio != null ? String(p.precio) : '', codigo: p.codigo != null ? String(p.codigo) : '',
      presentacion_id: p.presentacion_id ?? '', sabor_id: p.sabor_id ?? '', tamanio_id: p.tamanio_id ?? '', icono: p.icono ?? '',
      activo: p.activo,
    })
    setErrorForm(null)
    setModal(p)
  }

  function cerrarModal() { if (!guardando) setModal(null) }

  async function guardar() {
    if (!form.nombre.trim() || !modal) return
    setGuardando(true)
    setErrorForm(null)
    const comunes = {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, unidad: form.unidad,
      categoria: form.categoria || null,
      precio: form.precio ? parseFloat(form.precio.replace(',', '.')) : null,
      codigo: form.codigo ? parseInt(form.codigo) : null,
      presentacion_id: form.presentacion_id || null,
      sabor_id: form.sabor_id || null,
      tamanio_id: form.tamanio_id || null,
      icono: form.icono || null,
      activo: form.activo,
    }
    const { data, error } = modal === 'nuevo'
      ? await supabase.from('productos').insert({ ...comunes, tipo: form.tipo, destino: form.destino }).select().single()
      : await supabase.from('productos').update(comunes).eq('id', modal.id).select().single()
    setGuardando(false)
    if (error || !data) { setErrorForm(mensajeErrorProducto(error ?? { message: '' })); return }
    setProductos(prev => modal === 'nuevo' ? [...prev, data] : prev.map(p => p.id === data.id ? data : p))
    const cambioEstado = modal !== 'nuevo' && modal.activo !== data.activo
    toast.success(modal === 'nuevo' ? `${data.nombre} agregado.` : cambioEstado ? `${data.nombre} ${data.activo ? 'activado' : 'desactivado'}.` : `${data.nombre} guardado.`)
    setModal(null)
  }

  function pedirEliminar(p: Producto) {
    confirmar({
      titulo: `Eliminar ${p.nombre}`,
      mensaje: 'Se borra del catálogo. Si ya tiene pedidos no se puede borrar: en ese caso, desactivalo.',
      textoConfirmar: 'Sí, eliminar',
      peligroso: true,
      onConfirmar: async () => {
        setGuardando(true)
        const { error } = await supabase.from('productos').delete().eq('id', p.id)
        setGuardando(false)
        if (!error) {
          setProductos(prev => prev.filter(x => x.id !== p.id))
          setModal(null)
          toast.success(`${p.nombre} eliminado.`)
        } else if (error.code === '23503') {
          // FK: el producto ya aparece en pedidos (u otra tabla), borrarlo rompería ese historial.
          toast.error(`${p.nombre} ya tiene pedidos cargados y no se puede borrar. Desactivalo para que no se pueda pedir más.`)
        } else {
          toast.error(`No se pudo eliminar ${p.nombre}. Probá de nuevo.`)
        }
      },
    })
  }

  // ── Filtros y grupos ───────────────────────────────────────────────────
  const categoriasTab = useMemo(
    () => [...new Set(delTab.map(p => p.categoria || SIN_CATEGORIA))]
      .sort((a, b) => ordenCategoria(a) - ordenCategoria(b) || a.localeCompare(b, 'es')),
    [delTab],
  )
  const q = busqueda.trim().toLowerCase()
  const visibles = delTab.filter(p =>
    (estado === 'todos' || p.activo === (estado === 'activos')) &&
    (!categoria || (p.categoria || SIN_CATEGORIA) === categoria) &&
    (!q || p.nombre.toLowerCase().includes(q) || (p.codigo != null && String(p.codigo).includes(q))),
  )
  const grupos = categoriasTab
    .map(c => ({
      categoria: c,
      productos: visibles.filter(p => (p.categoria || SIN_CATEGORIA) === c)
        .sort((a, b) => (a.codigo ?? Infinity) - (b.codigo ?? Infinity) || a.nombre.localeCompare(b.nombre, 'es')),
    }))
    .filter(g => g.productos.length > 0)

  const editando = modal && modal !== 'nuevo' ? modal : null

  return (
    <div className="space-y-4">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />

      {/* Encabezado: título y acciones siempre a mano */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-['Syne'] text-xl font-bold text-text">Catálogo de productos</h1>
          <p className="mt-1 text-xs text-muted">Los productos de fábrica (los que piden los locales) y los insumos de depósito.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={descargarCSV} title="Descargar CSV"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted hover:border-accent/50 hover:text-text">
            <IconDownload size={15} aria-hidden /> <span className="hidden sm:inline">Descargar</span> CSV
          </button>
          <label title="Subir CSV"
            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted hover:border-accent/50 hover:text-text ${importando ? 'pointer-events-none opacity-60' : ''}`}>
            {importando ? <><Puntos /> Importando</> : <><IconUpload size={15} aria-hidden /> <span className="hidden sm:inline">Subir</span> CSV</>}
            <input ref={inputCsvRef} type="file" accept=".csv" className="hidden" onChange={subirCSV} />
          </label>
          <button type="button" onClick={abrirNuevo}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-black hover:opacity-90">
            <IconPlus size={16} aria-hidden /> Agregar {nombreTipo}
          </button>
        </div>
      </div>
      {importMsg && (
        <p role="status" className={`text-xs ${importMsg.tipo === 'ok' ? 'text-success' : 'text-brand-red'}`}>{importMsg.texto}</p>
      )}

      {/* Fábrica / Depósito + búsqueda */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Catálogo" className="flex shrink-0 gap-1 rounded-xl border border-border bg-surface p-1">
          {(['fabrica', 'deposito'] as DestinoProducto[]).map(d => {
            const activa = tab === d
            const Icono = d === 'fabrica' ? IconBuildingFactory2 : IconPackage
            const n = productos.filter(p => p.destino === d).length
            return (
              <button key={d} type="button" role="tab" aria-selected={activa}
                onClick={() => { setTab(d); setCategoria(null) }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${activa ? 'bg-accent text-black' : 'text-muted hover:bg-surface2 hover:text-text'}`}>
                <Icono size={15} aria-hidden /> {d === 'fabrica' ? 'Fábrica' : 'Depósito'}
                <span className={`rounded-full px-1.5 text-2xs font-bold ${activa ? 'bg-black/15' : 'bg-surface2'}`}>{n}</span>
              </button>
            )
          })}
        </div>
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o código…" className="min-w-[12rem] flex-1" />
        <div role="group" aria-label="Estado" className="flex shrink-0 gap-1 rounded-xl border border-border bg-surface p-1">
          {([['todos', 'Todos', delTab.length], ['activos', 'Activos', activos], ['inactivos', 'Inactivos', delTab.length - activos]] as const).map(([valor, texto, n]) => {
            const activa = estado === valor
            return (
              <button key={valor} type="button" aria-pressed={activa} onClick={() => setEstado(valor)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${activa ? 'bg-surface2 text-text' : 'text-muted hover:text-text'}`}>
                {texto} <span className="text-2xs text-faint tabular-nums">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Categorías */}
      {categoriasTab.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categoría">
          {categoriasTab.map(c => {
            const activa = categoria === c
            return (
              <button key={c} type="button" aria-pressed={activa} onClick={() => setCategoria(activa ? null : c)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${activa ? 'border-accent bg-accent text-black' : 'border-border bg-surface2 text-muted hover:text-text'}`}>
                {c}
              </button>
            )
          })}
        </div>
      )}

      {/* Grilla por categoría */}
      {grupos.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState icono={IconSearch}
            titulo={delTab.length === 0 ? `Todavía no hay ${nombreTipo}s en el catálogo` : 'No hay productos con esa búsqueda'}
            descripcion={delTab.length === 0 ? `Tocá "Agregar ${nombreTipo}" para cargar el primero.` : 'Probá con otra palabra o sacá los filtros de estado y categoría.'} />
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(g => (
            <section key={g.categoria} aria-label={g.categoria} className="space-y-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {g.categoria} <span className="font-normal normal-case tracking-normal text-faint">· {g.productos.length}</span>
              </h2>
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {g.productos.map(p => (
                  <TarjetaProducto key={p.id} producto={p} esFabrica={esFabrica} posberry={mapeosPorProductoId[p.id]?.length ?? 0}
                    onAbrir={() => abrirEdicion(p)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Agregar / editar */}
      <Modal open={modal !== null} onClose={cerrarModal} size="lg"
        title={editando ? `Editar ${nombreTipo}` : `Nuevo ${nombreTipo} · ${esFabrica ? 'Fábrica' : 'Depósito'}`}>
        <form onSubmit={e => { e.preventDefault(); guardar() }} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
            <label className="block">
              <span className={etiqueta}>Código</span>
              <input type="number" min="0" step="1" inputMode="numeric" value={form.codigo}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} className={campo} placeholder="1" />
            </label>
            <label className="block">
              <span className={etiqueta}>Nombre *</span>
              <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className={campo} placeholder={esFabrica ? 'MASA CLÁSICO Kg.' : 'Harina de mandioca 1 kg'} autoFocus={modal === 'nuevo'} />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={etiqueta}>Categoría</span>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className={campo}>
                <option value="">Sin categoría</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={etiqueta}>Unidad</span>
              <input type="text" value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
                className={campo} placeholder="Kg., unidad, bolsa…" />
            </label>
            <label className="block">
              <span className={etiqueta}>Precio</span>
              <input type="text" inputMode="decimal" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                className={campo} placeholder="0,00" />
            </label>
          </div>
          <label className="block">
            <span className={etiqueta}>Descripción</span>
            <input type="text" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              className={campo} placeholder="Opcional" />
          </label>

          <div>
            <span className={etiqueta}>Estado</span>
            <div role="radiogroup" aria-label="Estado" className="inline-flex gap-1 rounded-xl border border-border bg-surface2 p-1">
              {([true, false] as const).map(valor => {
                const elegido = form.activo === valor
                return (
                  <button key={String(valor)} type="button" role="radio" aria-checked={elegido}
                    onClick={() => setForm(f => ({ ...f, activo: valor }))}
                    className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                      elegido ? valor ? 'bg-green-bg text-success' : 'bg-warning-bg text-warning' : 'text-muted hover:text-text'
                    }`}>
                    {valor ? 'Activo' : 'Inactivo'}
                  </button>
                )
              })}
            </div>
            {/* En fábrica es el mismo dato que el "Con stock / Sin stock" del mayorista. */}
            {!form.activo && form.destino === 'fabrica' && (
              <p className="mt-1.5 text-2xs text-muted">Los locales lo ven como &quot;Sin stock por ahora&quot; y no lo pueden pedir.</p>
            )}
          </div>

          {form.destino === 'fabrica' && (
            <div>
              <span className={etiqueta}>Ícono</span>
              <SelectorIcono valor={form.icono} onCambiar={icono => setForm(f => ({ ...f, icono }))}
                nombre={form.nombre} categoria={form.categoria || null} />
            </div>
          )}

          {editando && (mapeosPorProductoId[editando.id] ?? []).length > 0 && (
            <div>
              <span className={etiqueta}>En Posberry se vende como</span>
              <div className="flex flex-wrap gap-1">
                {mapeosPorProductoId[editando.id].map(n => (
                  <span key={n} className="rounded-md border border-border bg-surface2 px-2 py-0.5 text-2xs text-muted">{n}</span>
                ))}
              </div>
            </div>
          )}

          {/* Terna presentación/sabor/tamaño — oculta junto con Fase 5/6 de Fábrica, no entregadas todavía.
          {form.destino === 'fabrica' && <TernaSelects value={form} onChange={v => setForm(f => ({ ...f, ...v }))} presentaciones={presentaciones} sabores={sabores} tamanios={tamanios} />}
          */}

          {errorForm && <p role="alert" className="text-xs text-brand-red">{errorForm}</p>}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
            {editando && (
              <button type="button" onClick={() => pedirEliminar(editando)} disabled={guardando}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted hover:border-brand-red/50 hover:text-brand-red disabled:opacity-40 sm:mr-auto">
                <IconTrash size={16} aria-hidden /> Eliminar
              </button>
            )}
            <button type="button" onClick={cerrarModal} disabled={guardando}
              className={`rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted hover:text-text ${editando ? '' : 'sm:ml-auto'}`}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando || !form.nombre.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40">
              {guardando ? <><Puntos /> Guardando</> : editando ? 'Guardar' : `Agregar ${nombreTipo}`}
            </button>
          </div>
        </form>
      </Modal>
      {/* Después del modal del producto: la confirmación de eliminar tiene que quedar encima. */}
      {dialog}
    </div>
  )
}

// La terna (presentación/sabor/tamaño) está oculta hasta las fases 5/6 de Fábrica;
// se deja el componente para volver a mostrarla sin rehacerlo.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TernaSelects({ value, onChange, presentaciones, sabores, tamanios }: {
  value: { presentacion_id: string; sabor_id: string; tamanio_id: string }
  onChange: (v: Partial<{ presentacion_id: string; sabor_id: string; tamanio_id: string }>) => void
  presentaciones: Parametro[]
  sabores: Parametro[]
  tamanios: Parametro[]
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-surface2 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
        <IconLayersSubtract size={13} /> Terna de producto terminado
        <HelpTooltip text="Solo para productos que salen del embolsado de Fábrica (Fase 4/5). Al asignar la misma combinación que carga una línea de embolsado, ese producto empieza a sumar stock terminado automáticamente." />
      </p>
      <div className="grid grid-cols-3 gap-2">
        {([['presentacion_id', 'Presentación', presentaciones], ['sabor_id', 'Sabor', sabores], ['tamanio_id', 'Tamaño', tamanios]] as const).map(([k, l, lista]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-2xs text-muted">{l}</span>
            <select value={value[k]} onChange={e => onChange({ [k]: e.target.value })} className={campo}>
              <option value="">Sin asignar</option>
              {lista.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}

// La tarjeta solo muestra el estado; se activa o desactiva desde la edición
// (antes había un interruptor en la tarjeta y se cambiaba con un toque sin querer).
function TarjetaProducto({ producto: p, esFabrica, posberry, onAbrir }: {
  producto: Producto
  esFabrica: boolean
  posberry: number
  onAbrir: () => void
}) {
  const { icono: Icono, clase } = esFabrica ? estiloProducto(p) : { icono: IconPackage, clase: 'bg-zinc-400/15 text-zinc-300' }
  const detalle = [p.unidad, p.precio != null ? `$ ${p.precio.toLocaleString('es-AR')}` : null].filter(Boolean).join(' · ')
  const atenuado = p.activo ? '' : 'opacity-60'
  return (
    <li>
      <button type="button" onClick={onAbrir} aria-label={`Editar ${p.nombre} (${p.activo ? 'activo' : 'inactivo'})`}
        className="flex h-full w-full flex-col gap-2 rounded-card border border-border bg-surface p-3 text-left transition-colors hover:border-accent/60">
        <span className="flex items-start justify-between gap-2">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${clase} ${atenuado}`} aria-hidden>
            <Icono size={20} />
          </span>
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${p.activo ? 'bg-green-bg text-success' : 'bg-warning-bg text-warning'}`}>
            {p.activo ? 'Activo' : 'Inactivo'}
          </span>
        </span>
        <span className={`min-w-0 ${atenuado}`}>
          {p.codigo != null && <span className="block text-xs font-bold tabular-nums text-accent">#{p.codigo}</span>}
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-text">{p.nombre}</span>
        </span>
        <span className={`mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted ${atenuado}`}>
          {detalle && <span>{detalle}</span>}
          {posberry > 0 && <span className="text-faint">Posberry: {posberry}</span>}
        </span>
      </button>
    </li>
  )
}
