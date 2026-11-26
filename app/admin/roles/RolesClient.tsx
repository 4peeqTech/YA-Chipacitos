'use client'

// Roles (épica roles y permisos, T5): lista de roles + editor del elegido. El
// rol define áreas y pantallas/acciones por defecto; al guardar, una vista
// previa muestra a quién afecta. La base valida lo mismo (roles_guardar).

import { useMemo, useState } from 'react'
import { IconChevronLeft, IconInfoCircle, IconPencil, IconPlus, IconShield, IconTrash } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import EditorPermisos, { AreasChips } from '@/components/permisos/EditorPermisos'
import { AREAS, CATALOGO, type Area } from '@/lib/permisos/catalogo'
import { mismosElementos, nombrePermiso, normalizar, problemaAlGuardar } from '@/lib/permisos/editor'

const PALETA = ['#a78bfa', '#38bdf8', '#f0a849', '#e8c547', '#e84210', '#56d68a']

export interface RolEditable {
  key: string
  nombre: string
  color: string
  es_sistema: boolean
  areas: Area[]
  permisos: string[]
  /** Nombres de las personas activas con este rol. */
  personas: string[]
}

interface VistaPrevia {
  areas_gana: string[]
  areas_pierde: string[]
  personas: { id: string; nombre: string; gana: string[]; pierde: string[]; ajustes: string[]; sin_sucursal: boolean }[]
  total: number
}

function slugify(nombre: string) {
  return nombre.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const nombreArea = (a: string) => AREAS.find(x => x.clave === a)?.nombre ?? a
const TODO = new Set(CATALOGO.map(p => p.clave))

function resumenRol(r: RolEditable) {
  const n = r.personas.length
  const personas = n === 0 ? 'Sin personas' : `${n} persona${n === 1 ? '' : 's'}`
  if (r.key === 'admin') return `${personas} · todo`
  return `${personas} · ${r.areas.length ? r.areas.map(nombreArea).join(', ') : 'sin áreas'}`
}

function quienesLoTienen(r: RolEditable) {
  if (r.personas.length === 0) return 'Nadie tiene este rol todavía.'
  if (r.personas.length <= 3) return `Lo tiene${r.personas.length > 1 ? 'n' : ''} ${r.personas.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`
  return `Lo tienen ${r.personas.slice(0, 2).join(', ')} y ${r.personas.length - 2} más.`
}

const btnSecundario = 'min-h-11 sm:min-h-10 px-4 rounded-xl border border-border text-sm font-medium text-muted hover:text-text presionable disabled:opacity-40'
const btnPrimario = 'min-h-11 sm:min-h-10 px-5 rounded-xl bg-accent text-black text-sm font-[\'Syne\'] font-bold presionable disabled:opacity-40'

export default function RolesClient({ rolesIniciales, puedeGestionar }: { rolesIniciales: RolEditable[]; puedeGestionar: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const { confirmar, dialog } = useConfirm()
  const [roles, setRoles] = useState(rolesIniciales)
  const [elegido, setElegido] = useState<string | null>(rolesIniciales.find(r => r.key !== 'admin')?.key ?? rolesIniciales[0]?.key ?? null)
  // En el celular la lista y el editor no entran juntos: se ve uno u otro.
  const [enEditorMobile, setEnEditorMobile] = useState(false)

  const rol = roles.find(r => r.key === elegido) ?? null
  const esAdmin = rol?.key === 'admin'
  const editable = puedeGestionar && !!rol && !esAdmin

  const [areas, setAreas] = useState<Area[]>(rol?.areas ?? [])
  const [valor, setValor] = useState<Set<string>>(new Set(rol?.permisos ?? []))
  const hayCambios = !!rol && !esAdmin && (
    !mismosElementos(areas, rol.areas) || !mismosElementos(normalizar(valor, areas), normalizar(rol.permisos, rol.areas))
  )

  const [vista, setVista] = useState<VistaPrevia | null>(null)
  const [cargandoVista, setCargandoVista] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  // Crear, renombrar y borrar (como antes)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [form, setForm] = useState({ nombre: '', key: '', color: PALETA[0] })
  const [keyEditadaAMano, setKeyEditadaAMano] = useState(false)
  const [renombrando, setRenombrando] = useState(false)
  const [formEdit, setFormEdit] = useState({ nombre: '', color: PALETA[0] })
  const [eliminando, setEliminando] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  function cargarRol(r: RolEditable | null) {
    setElegido(r?.key ?? null)
    setAreas(r?.areas ?? [])
    setValor(new Set(r?.permisos ?? []))
    setError('')
  }

  function elegir(r: RolEditable) {
    const ir = () => { cargarRol(r); setEnEditorMobile(true); setAviso('') }
    if (hayCambios && r.key !== elegido) {
      confirmar({ titulo: 'Descartar cambios', mensaje: `Los cambios en ${rol?.nombre} no se guardaron.`, textoConfirmar: 'Descartar', peligroso: true, onConfirmar: ir })
    } else ir()
  }

  function alternarArea(a: Area) {
    setAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : AREAS.map(x => x.clave).filter(x => x === a || prev.includes(x)))
  }

  async function abrirVistaPrevia() {
    if (!rol) return
    const problema = problemaAlGuardar(valor)
    if (problema) { setError(problema); return }
    setCargandoVista(true); setError('')
    const { data, error: e } = await supabase.rpc('roles_vista_previa', {
      p_rol: rol.key, p_areas: areas, p_permisos: normalizar(valor, areas),
    })
    setCargandoVista(false)
    if (e) { setError(e.message); return }
    setVista(data as unknown as VistaPrevia)
  }

  async function guardar() {
    if (!rol) return
    setGuardando(true); setError('')
    const permisos = normalizar(valor, areas)
    const { data, error: e } = await supabase.rpc('roles_guardar', { p_rol: rol.key, p_areas: areas, p_permisos: permisos })
    setGuardando(false)
    setVista(null)
    if (e) { setError(e.message); return }
    const ordenadas = AREAS.map(a => a.clave).filter(a => areas.includes(a))
    setRoles(prev => prev.map(r => r.key === rol.key ? { ...r, areas: ordenadas, permisos } : r))
    setAreas(ordenadas)
    setValor(new Set(permisos))
    const afectadas = (data as { afectadas?: number } | null)?.afectadas ?? 0
    setAviso(afectadas ? `Guardado. Cambia el acceso de ${afectadas} persona${afectadas === 1 ? '' : 's'}.` : 'Guardado.')
  }

  function cancelar() {
    cargarRol(rol)
  }

  async function crearRol() {
    if (!form.nombre.trim() || !form.key.trim()) return
    setGuardando(true); setErrorModal('')
    const res = await fetch('/api/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setGuardando(false)
    if (!res.ok) { setErrorModal(data.error || 'Error'); return }
    const nuevo: RolEditable = { key: data.key, nombre: data.nombre, color: data.color, es_sistema: false, areas: [], permisos: [], personas: [] }
    setRoles(prev => [...prev, nuevo])
    cargarRol(nuevo)
    setEnEditorMobile(true)
    setModalNuevo(false)
    setForm({ nombre: '', key: '', color: PALETA[0] })
    setKeyEditadaAMano(false)
    setAviso('Rol creado. Elegí sus áreas, pantallas y acciones y guardá.')
  }

  async function renombrar() {
    if (!rol || !formEdit.nombre.trim()) return
    setGuardando(true); setErrorModal('')
    const res = await fetch('/api/roles', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: rol.key, nombre: formEdit.nombre, color: formEdit.color }),
    })
    setGuardando(false)
    if (!res.ok) { const d = await res.json(); setErrorModal(d.error || 'Error'); return }
    setRoles(prev => prev.map(r => r.key === rol.key ? { ...r, nombre: formEdit.nombre.trim(), color: formEdit.color } : r))
    setRenombrando(false)
  }

  async function eliminar() {
    if (!rol) return
    setGuardando(true); setErrorModal('')
    const res = await fetch('/api/roles', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: rol.key }),
    })
    setGuardando(false)
    if (!res.ok) { const d = await res.json(); setErrorModal(d.error || 'Error'); return }
    const resto = roles.filter(r => r.key !== rol.key)
    setRoles(resto)
    cargarRol(resto.find(r => r.key !== 'admin') ?? null)
    setEliminando(false)
    setEnEditorMobile(false)
  }

  const lista = (
    <div className="bg-surface border border-border rounded-card overflow-hidden divide-y divide-border">
      {roles.map(r => {
        const activo = r.key === elegido
        return (
          <button key={r.key} type="button" onClick={() => elegir(r)}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 min-h-14 ${activo ? 'bg-accent-bg' : 'hover:bg-surface2'}`}>
            <span className="flex-1 min-w-0">
              <span className={`block text-sm font-semibold break-words ${activo ? 'text-accent-fg' : 'text-text'}`}>{r.nombre}</span>
              <span className="block text-xs text-muted truncate">{resumenRol(r)}</span>
            </span>
            {r.es_sistema && <span className="shrink-0 text-3xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border text-muted">Sistema</span>}
          </button>
        )
      })}
    </div>
  )

  const editor = rol && (
    <div className="space-y-5 pb-20 md:pb-0">
      <button type="button" onClick={() => setEnEditorMobile(false)} className="md:hidden flex items-center gap-1 text-sm text-muted min-h-11 -my-2">
        <IconChevronLeft size={18} /> Roles
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-['Syne'] text-xl font-bold text-text">{rol.nombre}</h2>
          <p className="text-xs text-muted mt-0.5">{quienesLoTienen(rol)}</p>
        </div>
        {puedeGestionar && !rol.es_sistema && (
          <div className="flex gap-1 shrink-0">
            <button type="button" onClick={() => { setFormEdit({ nombre: rol.nombre, color: rol.color }); setErrorModal(''); setRenombrando(true) }}
              className="inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl text-sm text-muted hover:text-text">
              <IconPencil size={16} /> <span className="hidden sm:inline">Cambiar nombre</span>
            </button>
            <button type="button" onClick={() => { setErrorModal(''); setEliminando(true) }} disabled={rol.personas.length > 0}
              title={rol.personas.length > 0 ? 'Reasigná a las personas antes de eliminarlo' : 'Eliminar rol'}
              className="inline-flex items-center min-h-10 px-3 rounded-xl text-muted hover:text-brand-red disabled:opacity-40 disabled:hover:text-muted">
              <IconTrash size={16} />
            </button>
          </div>
        )}
      </div>

      {esAdmin && (
        <div className="flex gap-2 items-start bg-info-bg text-info rounded-card px-3 py-2.5 text-sm">
          <IconInfoCircle size={18} className="shrink-0 mt-0.5" />
          Admin entra a todo y tiene todas las pantallas y acciones. Es el rol del sistema que no se edita, así nadie se queda afuera.
        </div>
      )}
      {!puedeGestionar && !esAdmin && (
        <p className="text-sm text-muted">Para cambiar roles hace falta la acción &quot;Gestionar usuarios y roles&quot;.</p>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text">Áreas <span className="font-normal text-muted">a qué partes de la app entra</span></h3>
        <AreasChips areas={areas} onAlternar={editable ? alternarArea : undefined} />
        <p className="text-xs text-muted">
          Con más de un área, la persona elige en cuál está desde el encabezado. Las pantallas de Locales, Fábrica, Depósito y Mayorista vienen con el área.
        </p>
      </section>

      <EditorPermisos areas={areas} valor={esAdmin ? TODO : valor} onCambiar={setValor} soloLectura={!editable} />

      {error && <div role="alert" className="bg-danger-bg border border-brand-red/30 rounded-card px-3 py-2.5 text-sm text-brand-red">{error}</div>}
      {aviso && !hayCambios && <div role="status" className="bg-green-bg rounded-card px-3 py-2.5 text-sm text-success">{aviso}</div>}

      {editable && (
        <div className="fixed md:static inset-x-0 bottom-[57px] z-40 bg-surface md:bg-transparent border-t border-border px-4 py-2.5 md:px-0 md:pt-4 md:pb-0 flex items-center gap-2">
          <span className="hidden md:block flex-1 text-xs text-muted">{hayCambios ? 'Hay cambios sin guardar' : 'Sin cambios'}</span>
          {hayCambios && <button type="button" onClick={cancelar} className={`${btnSecundario} hidden md:block`}>Cancelar</button>}
          <button type="button" onClick={abrirVistaPrevia} disabled={!hayCambios || cargandoVista}
            className={`${btnPrimario} flex-1 md:flex-none`}>
            {cargandoVista ? 'Calculando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5 w-full">
      <div className={enEditorMobile ? 'hidden md:block' : ''}>
        <PageHeader icono={IconShield} titulo="Roles"
          descripcion="Cada rol define a qué áreas entra y qué pantallas y acciones trae. En la ficha de cada persona se ajusta lo puntual."
          acciones={<>
            <AyudaLink seccion="usuarios-roles" ancla="roles" />
            {puedeGestionar && (
              <button type="button" onClick={() => { setErrorModal(''); setModalNuevo(true) }} className={`${btnSecundario} inline-flex items-center gap-1.5`}>
                <IconPlus size={16} /> Nuevo rol
              </button>
            )}
          </>} />
      </div>

      <div className="md:grid md:grid-cols-[minmax(240px,300px)_1fr] lg:grid-cols-[320px_1fr] md:gap-6 items-start">
        <div className={`${enEditorMobile ? 'hidden' : ''} md:block md:sticky md:top-4`}>{lista}</div>
        <div className={enEditorMobile ? '' : 'hidden md:block'}>{editor}</div>
      </div>

      {/* Vista previa al guardar */}
      <Modal open={!!vista} onClose={() => setVista(null)} title={`Guardar ${rol?.nombre ?? ''}`} size="lg">
        {vista && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {vista.total === 0
                ? 'Nadie tiene este rol todavía: el cambio no afecta a nadie hoy.'
                : vista.personas.some(p => p.gana.length || p.pierde.length)
                  ? `El cambio afecta a ${vista.personas.filter(p => p.gana.length || p.pierde.length).length} de ${vista.total} persona${vista.total === 1 ? '' : 's'} desde que vuelvan a abrir la app.`
                  : 'Nadie gana ni pierde acceso con este cambio.'}
            </p>
            {(vista.areas_gana.length > 0 || vista.areas_pierde.length > 0) && (
              <p className="text-sm text-text">
                {vista.areas_gana.length > 0 && <>Suma el área {vista.areas_gana.map(nombreArea).join(', ')}. </>}
                {vista.areas_pierde.length > 0 && <>Saca el área {vista.areas_pierde.map(nombreArea).join(', ')}.</>}
              </p>
            )}
            <div className="divide-y divide-border border-y border-border max-h-[50vh] overflow-y-auto">
              {vista.personas.filter(p => p.gana.length || p.pierde.length).map(p => (
                <div key={p.id} className="py-2.5 sm:grid sm:grid-cols-[160px_1fr] gap-3">
                  <p className="text-sm font-semibold text-text">{p.nombre}</p>
                  <ul className="space-y-1 mt-1 sm:mt-0">
                    {p.gana.map(c => (
                      <li key={c} className="text-sm text-text flex items-center gap-2">
                        <span className="text-3xs font-semibold px-1.5 py-0.5 rounded-full bg-green-bg text-success">gana</span>{nombrePermiso(c)}
                      </li>
                    ))}
                    {p.pierde.map(c => (
                      <li key={c} className="text-sm text-text flex items-center gap-2">
                        <span className="text-3xs font-semibold px-1.5 py-0.5 rounded-full bg-danger-bg text-brand-red">pierde</span>{nombrePermiso(c)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {vista.personas.filter(p => p.ajustes.length > 0).map(p => (
              <div key={p.id} className="flex gap-2 items-start bg-info-bg text-info rounded-card px-3 py-2.5 text-sm">
                <IconInfoCircle size={18} className="shrink-0 mt-0.5" />
                <span>Lo que {p.nombre} tiene ajustado en su ficha ({p.ajustes.map(nombrePermiso).join(', ')}) no cambia.</span>
              </div>
            ))}
            {vista.personas.some(p => p.sin_sucursal) && (
              <div className="flex gap-2 items-start bg-warning-bg text-warning rounded-card px-3 py-2.5 text-sm">
                <IconInfoCircle size={18} className="shrink-0 mt-0.5" />
                <span>
                  Con el área Locales hay que elegir al menos una sucursal. Sin sucursal:{' '}
                  {vista.personas.filter(p => p.sin_sucursal).map(p => p.nombre).join(', ')}. Elegila en su ficha de Usuarios.
                </span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setVista(null)} className={btnSecundario}>Volver</button>
              <button type="button" onClick={guardar} disabled={guardando} className={btnPrimario}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Nuevo rol */}
      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="Nuevo rol">
        <div className="space-y-4">
          {errorModal && <div className="bg-danger-bg border border-brand-red/30 rounded-lg p-3 text-brand-red text-sm">{errorModal}</div>}
          <div>
            <label className="block text-xs font-semibold text-accent-fg uppercase tracking-wider mb-1.5">Nombre</label>
            <input type="text" value={form.nombre} autoFocus placeholder="Contador"
              onChange={e => { const nombre = e.target.value; setForm(f => ({ ...f, nombre, key: keyEditadaAMano ? f.key : slugify(nombre) })) }} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-accent-fg uppercase tracking-wider mb-1.5">Key</label>
            <input type="text" value={form.key} placeholder="contador" className="font-mono"
              onChange={e => { setKeyEditadaAMano(true); setForm(f => ({ ...f, key: e.target.value })) }} />
            <p className="text-3xs text-muted mt-1">Solo minúsculas, números y guión bajo. No se puede cambiar después.</p>
          </div>
          <ColorPicker valor={form.color} onCambiar={color => setForm(f => ({ ...f, color }))} />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setModalNuevo(false)} className={`${btnSecundario} flex-1`}>Cancelar</button>
            <button type="button" onClick={crearRol} disabled={guardando || !form.nombre.trim() || !form.key.trim()} className={`${btnPrimario} flex-1`}>
              {guardando ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Cambiar nombre */}
      <Modal open={renombrando} onClose={() => setRenombrando(false)} title="Cambiar nombre">
        <div className="space-y-4">
          {errorModal && <div className="bg-danger-bg border border-brand-red/30 rounded-lg p-3 text-brand-red text-sm">{errorModal}</div>}
          <div>
            <label className="block text-xs font-semibold text-accent-fg uppercase tracking-wider mb-1.5">Nombre</label>
            <input type="text" value={formEdit.nombre} autoFocus onChange={e => setFormEdit(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <ColorPicker valor={formEdit.color} onCambiar={color => setFormEdit(f => ({ ...f, color }))} />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setRenombrando(false)} className={`${btnSecundario} flex-1`}>Cancelar</button>
            <button type="button" onClick={renombrar} disabled={guardando || !formEdit.nombre.trim()} className={`${btnPrimario} flex-1`}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Eliminar */}
      <Modal open={eliminando} onClose={() => setEliminando(false)} title="Eliminar rol" accent="red">
        <div className="space-y-4">
          {errorModal && <div className="bg-danger-bg border border-brand-red/30 rounded-lg p-3 text-brand-red text-sm">{errorModal}</div>}
          <p className="text-sm text-muted">¿Eliminar <span className="text-text font-medium">{rol?.nombre}</span>? No se puede deshacer.</p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setEliminando(false)} className={`${btnSecundario} flex-1`}>Cancelar</button>
            <button type="button" onClick={eliminar} disabled={guardando}
              className="flex-1 min-h-11 sm:min-h-10 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 disabled:opacity-40">
              {guardando ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>

      {dialog}
    </div>
  )
}

function ColorPicker({ valor, onCambiar }: { valor: string; onCambiar: (c: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-accent-fg uppercase tracking-wider mb-1.5">Color</label>
      <div className="flex gap-2">
        {PALETA.map(c => (
          <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => onCambiar(c)}
            className={`w-8 h-8 rounded-full border-2 ${valor === c ? 'border-text' : 'border-transparent'}`}
            style={{ background: c }} />
        ))}
      </div>
    </div>
  )
}
