'use client'

// Usuarios (épica roles y permisos, T6): lista + ficha de cada persona. La
// ficha muestra lo que la persona tiene hoy, con un tilde por pantalla y acción;
// lo que difiere de su rol queda marcado y se puede volver al rol. También rol,
// sucursales (si su rol entra a Locales) e historial. Guarda con
// persona_guardar_acceso, que valida lo mismo en la base.

import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { IconChevronLeft, IconInfoCircle, IconKey, IconPencil, IconTrash, IconUserPlus, IconUsers } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { useAvisoSinGuardar } from '@/lib/hooks/useAvisoSinGuardar'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import EditorPermisos, { AreasChips } from '@/components/permisos/EditorPermisos'
import { AREAS, type Area } from '@/lib/permisos/catalogo'
import { ajustesMinimos, resolverAcceso, type Efecto } from '@/lib/permisos/resolver'
import { mismosElementos, nombrePermiso, normalizar, problemaAlGuardar } from '@/lib/permisos/editor'

interface Usuario {
  id: string
  nombre: string
  rol: string
  local_nombre: string | null
  nombre_posberry: string | null
  created_at: string
}

interface RolDatos {
  key: string
  nombre: string
  color: string
  es_sistema: boolean
  areas: Area[]
  permisos: string[]
}

interface Local {
  id: string
  sucursal: string
  activo: boolean
  orden: number
  cuenta_local_id: string | null
  tiene_fudo: boolean
}

interface EntradaHistorial {
  id: string
  persona_id: string | null
  rol_key: string | null
  cambio: Record<string, unknown>
  hecho_por: string | null
  created_at: string
}

export interface DatosUsuarios {
  usuarios: Usuario[]
  roles: RolDatos[]
  ajustes: { persona_id: string; permiso: string; efecto: Efecto }[]
  sucursales: { persona_id: string; local_config_id: string }[]
  locales: Local[]
  historial: EntradaHistorial[]
  emailsById: Record<string, string>
}

interface Props {
  datos: DatosUsuarios
  yo: string
  soyAdmin: boolean
  puedeGestionar: boolean
}

const btnSecundario = 'min-h-11 sm:min-h-10 px-4 rounded-xl border border-border text-sm font-medium text-muted hover:text-text presionable disabled:opacity-40'
const btnPrimario = 'min-h-11 sm:min-h-10 px-5 rounded-xl bg-accent text-black text-sm font-[\'Syne\'] font-bold presionable disabled:opacity-40'
const etiqueta = 'block text-xs font-semibold text-accent-fg uppercase tracking-wider mb-1.5'

const nombreArea = (a: string) => AREAS.find(x => x.clave === a)?.nombre ?? a

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(p => /^\p{L}/u.test(p)).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'
}

// En hora de Argentina, no la del que renderiza: con ?persona= la ficha también se
// arma en el servidor (UTC) y una hora distinta rompía la hidratación.
const FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function fechaHora(iso: string) {
  const p = Object.fromEntries(FECHA_HORA.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${p.day}-${p.month}-${p.year} · ${p.hour}:${p.minute}`
}

const lista = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])

export default function UsuariosClient({ datos, yo, soyAdmin, puedeGestionar }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { confirmar, dialog } = useConfirm()
  const [usuarios, setUsuarios] = useState(datos.usuarios)
  const [ajustes, setAjustes] = useState(datos.ajustes)
  const [sucursales, setSucursales] = useState(datos.sucursales)
  const [historial, setHistorial] = useState(datos.historial)
  const [emails, setEmails] = useState(datos.emailsById)
  const roles = datos.roles
  const rolPor = useMemo(() => new Map(roles.map(r => [r.key, r])), [roles])
  const nombrePor = useMemo(() => new Map(usuarios.map(u => [u.id, u.nombre])), [usuarios])
  const cuentaDe = useMemo(() => new Map(datos.locales.filter(l => l.cuenta_local_id).map(l => [l.cuenta_local_id!, l])), [datos.locales])

  // Lo que la persona tiene hoy, con la misma regla que la base (resolver.ts).
  function accesoDe(u: Usuario, rolKey = u.rol, conAjustes = true) {
    const rol = rolPor.get(rolKey)
    const areas = rol?.areas ?? []
    const rolPermisos = normalizar(rol?.permisos ?? [], areas)
    const efectivo = resolverAcceso({
      esAdmin: rolKey === 'admin',
      rolAreas: areas,
      rolPermisos,
      ajustes: conAjustes ? ajustes.filter(a => a.persona_id === u.id) : [],
      sucursales: [],
    })
    return { areas, rolPermisos, permisos: normalizar(efectivo.permisos, areas) }
  }
  const sucursalesDe = (id: string) => sucursales.filter(s => s.persona_id === id).map(s => s.local_config_id).sort()

  const [busqueda, setBusqueda] = useState('')
  const [elegidoId, setElegidoId] = useState<string | null>(null)
  // La persona abierta va en la URL (?persona=): "atrás" vuelve a la lista y el link se puede pasar.
  // En el celular la lista y la ficha no entran juntas: con ?persona= se ve la ficha.
  const enUrl = useSearchParams().get('persona')
  const enFichaMobile = enUrl != null
  const vinoDeLaLista = useRef(false)
  const elegido = usuarios.find(u => u.id === elegidoId) ?? null

  // Ficha en edición
  const [rolEdit, setRolEdit] = useState('')
  const [valor, setValor] = useState<Set<string>>(new Set())
  const [sucEdit, setSucEdit] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  function cargarFicha(u: Usuario | null) {
    setElegidoId(u?.id ?? null)
    setRolEdit(u?.rol ?? '')
    setValor(new Set(u ? accesoDe(u).permisos : []))
    setSucEdit(u ? sucursalesDe(u.id) : [])
    setPosberry(u?.nombre_posberry ?? '')
    setError('')
  }

  const original = elegido ? { rol: elegido.rol, permisos: accesoDe(elegido).permisos, suc: sucursalesDe(elegido.id) } : null
  const rolActual = rolPor.get(rolEdit)
  const areasEdit = useMemo(() => rolActual?.areas ?? [], [rolActual])
  const referencia = useMemo(() => new Set(normalizar(rolActual?.permisos ?? [], areasEdit)), [rolActual, areasEdit])
  // Cuenta de local: tiene su sucursal fija. Pasar a alguien al rol Local pide elegir una sin cuenta.
  const esCuentaLocal = !!elegido && rolEdit === 'local' && cuentaDe.has(elegido.id)
  const vincularLocal = !!elegido && rolEdit === 'local' && !cuentaDe.has(elegido.id)
  // Admin entra a todas las sucursales: no se eligen.
  const conLocales = areasEdit.includes('locales') && rolEdit !== 'admin'
  const hayCambios = !!original && (
    rolEdit !== original.rol
    || !mismosElementos(normalizar(valor, areasEdit), original.permisos)
    || (conLocales && !esCuentaLocal && !mismosElementos(sucEdit, original.suc))
  )

  useAvisoSinGuardar(hayCambios)

  function irA(id: string | null, modo: 'push' | 'replace' = 'push') {
    const url = id ? `?persona=${encodeURIComponent(id)}` : window.location.pathname
    if (modo === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }

  function descartarYCargar(u: Usuario, alCancelar?: () => void) {
    const ir = () => { cargarFicha(u); setAviso('') }
    if (hayCambios && u.id !== elegidoId) {
      confirmar({ titulo: 'Descartar cambios', mensaje: `Los cambios de ${elegido?.nombre} no se guardaron.`, textoConfirmar: 'Descartar', peligroso: true, onConfirmar: ir, onCancelar: alCancelar })
    } else ir()
  }

  // Elegir de la lista solo cambia la URL; abrir la ficha (y preguntar si hay cambios) es más abajo.
  function elegir(u: Usuario) {
    if (u.id === enUrl) return
    vinoDeLaLista.current = true
    irA(u.id)
  }

  function volverALista() {
    if (vinoDeLaLista.current) { vinoDeLaLista.current = false; window.history.back() }
    else irA(null, 'replace')
  }

  function cambiarRol(key: string) {
    // Con otro rol, los tildes vuelven a los del rol nuevo.
    const rol = rolPor.get(key)
    setRolEdit(key)
    setValor(new Set(normalizar(rol?.permisos ?? [], rol?.areas ?? [])))
    if (key === 'local' && elegido && !cuentaDe.has(elegido.id)) setSucEdit([])
  }

  async function guardar() {
    if (!elegido || !rolActual) return
    const problema = problemaAlGuardar(valor)
    if (problema) { setError(problema); return }
    if (vincularLocal && sucEdit.length !== 1) { setError('Elegí la sucursal de esta cuenta de local.'); return }
    if (conLocales && !esCuentaLocal && sucEdit.length === 0) { setError('Elegí al menos una sucursal: su rol entra a Locales.'); return }
    setGuardando(true); setError('')
    const nuevosAjustes = rolEdit === 'admin' ? [] : ajustesMinimos([...referencia], normalizar(valor, areasEdit))
    const { error: e } = await supabase.rpc('persona_guardar_acceso', {
      p_persona: elegido.id,
      p_rol: rolEdit,
      p_ajustes: nuevosAjustes,
      p_sucursales: conLocales ? sucEdit : [],
    })
    if (e) { setGuardando(false); setError(e.message); return }

    // Releer lo que quedó (la base descarta ajustes iguales al rol y fija la sucursal de las cuentas de local).
    const [{ data: aj }, { data: su }, { data: hi }] = await Promise.all([
      supabase.from('persona_permisos').select('persona_id, permiso, efecto').eq('persona_id', elegido.id),
      supabase.from('persona_sucursales').select('persona_id, local_config_id').eq('persona_id', elegido.id),
      supabase.from('permisos_historial').select('id, persona_id, rol_key, cambio, hecho_por, created_at')
        .eq('persona_id', elegido.id).order('created_at', { ascending: false }).limit(50),
    ])
    const ajustesNuevos = (aj ?? []).map(a => ({ ...a, efecto: a.efecto as Efecto }))
    setAjustes(prev => [...prev.filter(a => a.persona_id !== elegido.id), ...ajustesNuevos])
    setSucursales(prev => [...prev.filter(s => s.persona_id !== elegido.id), ...(su ?? [])])
    setHistorial(prev => [
      ...(hi ?? []).map(h => ({ ...h, cambio: (h.cambio ?? {}) as Record<string, unknown> })),
      ...prev.filter(h => h.persona_id !== elegido.id),
    ])
    setUsuarios(prev => prev.map(u => u.id === elegido.id ? { ...u, rol: rolEdit } : u))
    setSucEdit((su ?? []).map(s => s.local_config_id).sort())
    setGuardando(false)
    setAviso('Guardado. Lo ve la próxima vez que abra la app.')
  }

  // Datos, contraseña, Posberry y baja (como antes, por /api/usuarios)
  const [editando, setEditando] = useState(false)
  const [formEdit, setFormEdit] = useState({ nombre: '', local_nombre: '', email: '', nueva_password: '' })
  const [reseteando, setReseteando] = useState(false)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [posberry, setPosberry] = useState('')
  const [errorModal, setErrorModal] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function patch(body: Record<string, unknown>) {
    const res = await fetch('/api/usuarios', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return null
    const d = await res.json().catch(() => ({}))
    return (d.error as string) || 'Error'
  }

  async function guardarDatos() {
    if (!elegido || !formEdit.nombre) return
    setOcupado(true); setErrorModal('')
    const err = await patch({ id: elegido.id, nombre: formEdit.nombre, local_nombre: formEdit.local_nombre || null,
      email: formEdit.email || undefined, nueva_password: formEdit.nueva_password || undefined })
    setOcupado(false)
    if (err) { setErrorModal(err); return }
    setUsuarios(prev => prev.map(u => u.id === elegido.id ? { ...u, nombre: formEdit.nombre, local_nombre: formEdit.local_nombre || null } : u))
    if (formEdit.email) setEmails(prev => ({ ...prev, [elegido.id]: formEdit.email }))
    setEditando(false)
  }

  async function resetearPassword() {
    if (!elegido || nuevaPassword.length < 6) return
    setOcupado(true); setErrorModal('')
    const err = await patch({ id: elegido.id, password: nuevaPassword })
    setOcupado(false)
    if (err) { setErrorModal(err); return }
    setReseteando(false)
    setAviso(`Contraseña de ${elegido.nombre} actualizada.`)
  }

  async function guardarPosberry() {
    if (!elegido) return
    setOcupado(true)
    const err = await patch({ id: elegido.id, nombre_posberry: posberry.trim() || null })
    setOcupado(false)
    if (err) { setError(err); return }
    setUsuarios(prev => prev.map(u => u.id === elegido.id ? { ...u, nombre_posberry: posberry.trim() || null } : u))
    setAviso('Nombre en Posberry guardado.')
  }

  async function eliminar() {
    if (!elegido) return
    setOcupado(true); setErrorModal('')
    const res = await fetch('/api/usuarios', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: elegido.id }) })
    setOcupado(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErrorModal(d.error || 'Error'); return }
    setUsuarios(prev => prev.filter(u => u.id !== elegido.id))
    cargarFicha(null)
    setEliminando(false)
    irA(null, 'replace')
  }

  // Nuevo usuario
  const [modalNuevo, setModalNuevo] = useState(false)
  const rolInicial = roles.find(r => r.key === 'local')?.key ?? roles[0]?.key ?? ''
  const [form, setForm] = useState({ email: '', password: '', nombre: '', rol: rolInicial, local_nombre: '' })
  const [sucNuevo, setSucNuevo] = useState<string[]>([])
  const rolNuevo = rolPor.get(form.rol)
  const nuevoPideSucursal = !!rolNuevo?.areas.includes('locales') && form.rol !== 'local' && form.rol !== 'admin'

  async function crearUsuario() {
    if (!form.email || !form.password || !form.nombre) return
    if (nuevoPideSucursal && sucNuevo.length === 0) { setErrorModal('Elegí al menos una sucursal: el rol entra a Locales.'); return }
    setOcupado(true); setErrorModal('')
    const res = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setOcupado(false); setErrorModal(data.error || 'Error'); return }
    const nuevo: Usuario = data.profile
    let sucNuevas: { persona_id: string; local_config_id: string }[] = (data.sucursales ?? []).map((s: string) => ({ persona_id: nuevo.id, local_config_id: s }))
    if (nuevoPideSucursal) {
      const { error: e } = await supabase.rpc('persona_guardar_acceso', { p_persona: nuevo.id, p_rol: form.rol, p_ajustes: [], p_sucursales: sucNuevo })
      if (e) setAviso(`Usuario creado, pero no se guardaron las sucursales: ${e.message}`)
      else sucNuevas = sucNuevo.map(s => ({ persona_id: nuevo.id, local_config_id: s }))
    }
    setOcupado(false)
    setUsuarios(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setSucursales(prev => [...prev, ...sucNuevas])
    setEmails(prev => ({ ...prev, [nuevo.id]: form.email }))
    setModalNuevo(false)
    setForm({ email: '', password: '', nombre: '', rol: rolInicial, local_nombre: '' })
    setSucNuevo([])
    // Mostrar la ficha recién creada (cargarFicha lee del estado: se arma a mano).
    setElegidoId(nuevo.id)
    setRolEdit(nuevo.rol)
    setValor(new Set(normalizar(rolPor.get(nuevo.rol)?.permisos ?? [], rolPor.get(nuevo.rol)?.areas ?? [])))
    setSucEdit(sucNuevas.map(s => s.local_config_id).sort())
    irA(nuevo.id)
    setAviso(a => a || `${nuevo.nombre} ya puede entrar con su email y contraseña.`)
  }

  // La URL cambió (lista, atrás, adelante, link): abrir esa ficha. Si había cambios
  // y no se descartan, la URL vuelve a la persona que se estaba editando. Va después
  // de todos los estados porque cargarFicha los usa.
  const [urlVista, setUrlVista] = useState<string | null>(null)
  if (enUrl !== urlVista) {
    setUrlVista(enUrl)
    const u = enUrl ? usuarios.find(x => x.id === enUrl) : null
    if (u && u.id !== elegidoId) descartarYCargar(u, () => irA(elegidoId, 'replace'))
  }

  // Sucursales que se eligen en Locales: activas con cuenta de local o con Fudo (Fábrica y Churros Tubo no).
  const elegibles = datos.locales.filter(l => l.activo && (l.cuenta_local_id || l.tiene_fudo))

  const filtrados = usuarios.filter(u => {
    const q = busqueda.trim().toLowerCase()
    return !q || u.nombre.toLowerCase().includes(q) || (u.local_nombre ?? '').toLowerCase().includes(q)
      || (rolPor.get(u.rol)?.nombre ?? '').toLowerCase().includes(q)
  })

  function resumen(u: Usuario) {
    const rol = rolPor.get(u.rol)?.nombre ?? u.rol
    const cuenta = cuentaDe.get(u.id)
    if (cuenta) return `${rol} · ${cuenta.sucursal}`
    const n = ajustes.filter(a => a.persona_id === u.id).length
    const s = rolPor.get(u.rol)?.areas.includes('locales') ? sucursalesDe(u.id).length : 0
    return [rol, n ? `${n} ajuste${n === 1 ? '' : 's'}` : '', s ? `${s} sucursal${s === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' · ')
  }

  function textoHistorial(h: EntradaHistorial) {
    const c = h.cambio
    const partes: string[] = []
    const rolCambio = lista(c.rol)
    if (rolCambio.length === 2) partes.push(`Rol: ${rolPor.get(rolCambio[0])?.nombre ?? rolCambio[0]} → ${rolPor.get(rolCambio[1])?.nombre ?? rolCambio[1]}.`)
    if (lista(c.gana).length) partes.push(`Gana ${lista(c.gana).map(nombrePermiso).join(', ')}.`)
    if (lista(c.pierde).length) partes.push(`Pierde ${lista(c.pierde).map(nombrePermiso).join(', ')}.`)
    if (lista(c.sucursales_agrega).length) partes.push(`Sucursales: suma ${lista(c.sucursales_agrega).join(', ')}.`)
    if (lista(c.sucursales_quita).length) partes.push(`Sucursales: saca ${lista(c.sucursales_quita).join(', ')}.`)
    if (c.ajustes === true && partes.length === 0) partes.push('Ajustes sin cambio de acceso.')
    const prefijo = c.tipo === 'rol' ? `Cambio en el rol ${rolPor.get(h.rol_key ?? '')?.nombre ?? h.rol_key}: ` : ''
    return prefijo + partes.join(' ')
  }

  const listaUsuarios = (
    <div className="space-y-2">
      <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, local o rol…" />
      <div className="bg-surface border border-border rounded-card overflow-hidden divide-y divide-border">
        {filtrados.map(u => {
          const activo = u.id === elegidoId
          return (
            <button key={u.id} type="button" onClick={() => elegir(u)}
              className={`w-full text-left px-4 py-3 min-h-14 ${activo ? 'bg-accent-bg' : 'hover:bg-surface2'}`}>
              <span className={`block text-sm font-semibold break-words ${activo ? 'text-accent-fg' : 'text-text'}`}>{u.nombre}</span>
              <span className="block text-xs text-muted truncate">{resumen(u)}</span>
            </button>
          )
        })}
        {filtrados.length === 0 && <p className="text-center text-sm text-muted py-8">Sin resultados.</p>}
      </div>
    </div>
  )

  const historialDe = elegido ? historial.filter(h => h.persona_id === elegido.id) : []
  const soyYo = elegido?.id === yo
  const editable = puedeGestionar && !!elegido
  const quienes = (id: string | null) => (id ? nombrePor.get(id) ?? 'alguien que ya no está' : 'el sistema')

  const ficha = elegido && (
    <div className="space-y-5 pb-20 md:pb-0">
      <button type="button" onClick={volverALista} className="md:hidden flex items-center gap-1 text-sm text-muted min-h-11 -my-2">
        <IconChevronLeft size={18} /> Usuarios
      </button>

      <div className="flex items-start gap-3">
        <span className="shrink-0 w-12 h-12 rounded-full bg-accent-bg text-accent-fg font-['Syne'] font-bold flex items-center justify-center">{iniciales(elegido.nombre)}</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-['Syne'] text-xl font-bold text-text truncate">{elegido.nombre}</h2>
          <p className="text-xs text-muted truncate">
            {emails[elegido.id] ?? 'sin email'} · {areasEdit.length ? areasEdit.map(nombreArea).join(' y ') : 'sin áreas'}
          </p>
        </div>
        {puedeGestionar && (soyAdmin || elegido.rol !== 'admin') && (
          <div className="flex gap-1 shrink-0">
            <button type="button" title="Editar datos" aria-label="Editar datos"
              onClick={() => { setFormEdit({ nombre: elegido.nombre, local_nombre: elegido.local_nombre ?? '', email: emails[elegido.id] ?? '', nueva_password: '' }); setErrorModal(''); setEditando(true) }}
              className="w-10 h-10 rounded-xl border border-border text-muted hover:text-text flex items-center justify-center"><IconPencil size={18} /></button>
            <button type="button" title="Cambiar contraseña" aria-label="Cambiar contraseña"
              onClick={() => { setNuevaPassword(''); setErrorModal(''); setReseteando(true) }}
              className="w-10 h-10 rounded-xl border border-border text-muted hover:text-text flex items-center justify-center"><IconKey size={18} /></button>
            {!soyYo && (
              <button type="button" title="Eliminar usuario" aria-label="Eliminar usuario"
                onClick={() => { setErrorModal(''); setEliminando(true) }}
                className="w-10 h-10 rounded-xl border border-border text-muted hover:text-brand-red flex items-center justify-center"><IconTrash size={18} /></button>
            )}
          </div>
        )}
      </div>

      <section className="space-y-2">
        <label className={etiqueta} htmlFor="rol-ficha">Rol</label>
        <select id="rol-ficha" value={rolEdit} onChange={e => cambiarRol(e.target.value)} disabled={!editable || soyYo}>
          {roles.map(r => (
            <option key={r.key} value={r.key} disabled={(r.key === 'admin' || elegido.rol === 'admin') && !soyAdmin && r.key !== elegido.rol}>{r.nombre}</option>
          ))}
        </select>
        <p className="text-xs text-muted">
          {soyYo ? 'Tu propio rol no se cambia desde acá.' : rolEdit === 'admin'
            ? 'Admin entra a todo y tiene todas las pantallas y acciones.'
            : `Los tildes muestran lo que ${elegido.nombre.split(' ')[0]} tiene. Si uno no coincide con su rol, queda marcado y se puede volver al rol.`}
        </p>
        <AreasChips areas={areasEdit} />
      </section>

      {conLocales && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-text">Sucursales <span className="font-normal text-muted">en Locales elige entre estas</span></h3>
          <div className="flex flex-wrap gap-2">
            {(esCuentaLocal ? datos.locales.filter(l => l.cuenta_local_id === elegido.id)
              : vincularLocal ? elegibles.filter(l => !l.cuenta_local_id) : elegibles).map(l => {
              const activa = esCuentaLocal || sucEdit.includes(l.id)
              return (
                <button key={l.id} type="button" role="checkbox" aria-checked={activa} disabled={!editable || esCuentaLocal}
                  onClick={() => setSucEdit(prev => vincularLocal ? [l.id]
                    : prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id].sort())}
                  className={`min-h-11 sm:min-h-9 px-3 rounded-full text-xs font-semibold border presionable ${
                    activa ? 'bg-accent text-black border-accent' : 'bg-surface2 text-muted border-border hover:text-text'
                  } disabled:cursor-default`}>
                  {l.sucursal}
                </button>
              )
            })}
            {!esCuentaLocal && !vincularLocal && editable && (
              <button type="button"
                onClick={() => setSucEdit(prev => prev.length === elegibles.length ? [] : elegibles.map(l => l.id).sort())}
                className="min-h-11 sm:min-h-9 px-3 rounded-full text-xs font-semibold border border-dashed border-accent text-accent-fg presionable">
                {sucEdit.length === elegibles.length ? 'Ninguna' : 'Todas'}
              </button>
            )}
          </div>
          <p className="text-xs text-muted">
            {esCuentaLocal
              ? 'Es la cuenta de este local: tiene solo la suya y no se cambia desde acá.'
              : vincularLocal
                ? 'Una cuenta de local va con una sola sucursal: elegí la suya (las que ya tienen cuenta no aparecen).'
                : 'Hay que elegir al menos una. Una cuenta de local tiene solo la suya. Fábrica y Churros Tubo no son sucursales de Locales.'}
          </p>
          {esCuentaLocal && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <div className="flex-1 min-w-48">
                <label className={etiqueta} htmlFor="posberry">Cliente en Posberry</label>
                <input id="posberry" type="text" value={posberry} placeholder="Nombre en Posberry…"
                  onChange={e => setPosberry(e.target.value)} disabled={!editable} />
              </div>
              {editable && (
                <button type="button" onClick={guardarPosberry} disabled={ocupado || posberry.trim() === (elegido.nombre_posberry ?? '')} className={btnSecundario}>
                  Guardar nombre
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {rolEdit === 'admin' ? (
        <div className="flex gap-2 items-start bg-info-bg text-info rounded-card px-3 py-2.5 text-sm">
          <IconInfoCircle size={18} className="shrink-0 mt-0.5" />
          Admin tiene todo y no lleva ajustes.
        </div>
      ) : (
        <EditorPermisos areas={areasEdit} valor={valor} onCambiar={setValor} referencia={referencia} soloLectura={!editable} />
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text">Historial</h3>
        {historialDe.length === 0 ? (
          <p className="text-xs text-muted">Sin cambios registrados desde el pase al modelo de roles.</p>
        ) : (
          <div className="bg-surface border border-border rounded-card divide-y divide-border">
            {historialDe.slice(0, 20).map(h => (
              <div key={h.id} className="px-3 py-2.5 sm:grid sm:grid-cols-[150px_1fr] gap-3 text-sm">
                <p className="text-xs text-muted">{fechaHora(h.created_at)}</p>
                <p className="text-text">{textoHistorial(h)} <span className="text-muted">Por {quienes(h.hecho_por)}.</span></p>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <div role="alert" className="bg-danger-bg border border-brand-red/30 rounded-card px-3 py-2.5 text-sm text-brand-red">{error}</div>}
      {aviso && !hayCambios && <div role="status" className="bg-green-bg rounded-card px-3 py-2.5 text-sm text-success">{aviso}</div>}

      {editable && (
        <div className="fixed md:static inset-x-0 bottom-[57px] z-40 bg-surface md:bg-transparent border-t border-border px-4 py-2.5 md:px-0 md:pt-4 md:pb-0 flex items-center gap-2">
          <span className="hidden md:block flex-1 text-xs text-muted">{hayCambios ? 'Hay cambios sin guardar' : 'Sin cambios'}</span>
          {hayCambios && <button type="button" onClick={() => cargarFicha(elegido)} className={`${btnSecundario} hidden md:block`}>Cancelar</button>}
          <button type="button" onClick={guardar} disabled={!hayCambios || guardando} className={`${btnPrimario} flex-1 md:flex-none`}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )

  const errorBox = errorModal && <div className="bg-danger-bg border border-brand-red/30 rounded-lg p-3 text-brand-red text-sm">{errorModal}</div>

  return (
    <div className="space-y-5 w-full">
      <div className={enFichaMobile ? 'hidden md:block' : ''}>
        <PageHeader icono={IconUsers} titulo="Usuarios" descripcion="Quién entra a la app, con qué rol y qué tiene distinto de su rol."
          acciones={<>
            <AyudaLink seccion="usuarios-roles" ancla="ficha" />
            {puedeGestionar && (
              <button type="button" onClick={() => { setErrorModal(''); setModalNuevo(true) }} className={`${btnSecundario} inline-flex items-center gap-1.5`}>
                <IconUserPlus size={16} /> Nuevo usuario
              </button>
            )}
          </>} />
      </div>

      <div className="md:grid md:grid-cols-[minmax(240px,300px)_1fr] lg:grid-cols-[320px_1fr] md:gap-6 items-start">
        <div className={`${enFichaMobile ? 'hidden' : ''} md:block`}>{listaUsuarios}</div>
        <div className={enFichaMobile ? '' : 'hidden md:block'}>
          {ficha || <p className="hidden md:block text-sm text-muted py-10 text-center">Elegí una persona para ver su acceso.</p>}
        </div>
      </div>

      <Modal open={editando} onClose={() => setEditando(false)} title="Editar datos">
        <div className="space-y-4">
          {errorBox}
          <div>
            <label className={etiqueta}>Nombre</label>
            <input type="text" value={formEdit.nombre} onChange={e => setFormEdit(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className={etiqueta}>Nombre del local</label>
            <input type="text" value={formEdit.local_nombre} onChange={e => setFormEdit(f => ({ ...f, local_nombre: e.target.value }))} placeholder="Suc. Nombre" />
          </div>
          <div>
            <label className={etiqueta}>Email (nombre de usuario)</label>
            <input type="email" value={formEdit.email} onChange={e => setFormEdit(f => ({ ...f, email: e.target.value }))} placeholder="usuario@email.com" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setEditando(false)} className={`${btnSecundario} flex-1`}>Cancelar</button>
            <button type="button" onClick={guardarDatos} disabled={ocupado || !formEdit.nombre} className={`${btnPrimario} flex-1`}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={reseteando} onClose={() => setReseteando(false)} title="Cambiar contraseña">
        <div className="space-y-4">
          <p className="text-sm text-muted">Usuario: <span className="text-text font-medium">{elegido?.nombre}</span></p>
          {errorBox}
          <div>
            <label className={etiqueta}>Nueva contraseña</label>
            <input type="text" value={nuevaPassword} onChange={e => setNuevaPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoFocus />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setReseteando(false)} className={`${btnSecundario} flex-1`}>Cancelar</button>
            <button type="button" onClick={resetearPassword} disabled={ocupado || nuevaPassword.length < 6} className={`${btnPrimario} flex-1`}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={eliminando} onClose={() => setEliminando(false)} title="Eliminar usuario" accent="red">
        <div className="space-y-4">
          {errorBox}
          <p className="text-sm text-muted">¿Eliminar a <span className="text-text font-medium">{elegido?.nombre}</span>? Pierde el acceso y deja de aparecer en esta lista. Lo que cargó se conserva.</p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setEliminando(false)} className={`${btnSecundario} flex-1`}>Cancelar</button>
            <button type="button" onClick={eliminar} disabled={ocupado}
              className="flex-1 min-h-11 sm:min-h-10 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 disabled:opacity-40">
              {ocupado ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="Nuevo usuario">
        <div className="space-y-4">
          {errorBox}
          {[
            { label: 'Email *', key: 'email', type: 'email', placeholder: 'usuario@email.com' },
            { label: 'Contraseña *', key: 'password', type: 'password', placeholder: 'Mínimo 6 caracteres' },
            { label: 'Nombre completo *', key: 'nombre', type: 'text', placeholder: 'Juan García' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className={etiqueta}>{label}</label>
              <input type={type} value={form[key as 'email' | 'password' | 'nombre']} placeholder={placeholder}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className={etiqueta}>Rol *</label>
            <select value={form.rol} onChange={e => { setForm(f => ({ ...f, rol: e.target.value })); setSucNuevo([]) }}>
              {roles.map(r => <option key={r.key} value={r.key} disabled={r.key === 'admin' && !soyAdmin}>{r.nombre}</option>)}
            </select>
          </div>
          {form.rol === 'local' && (
            <div>
              <label className={etiqueta}>Nombre del local</label>
              <input type="text" value={form.local_nombre} onChange={e => setForm(f => ({ ...f, local_nombre: e.target.value }))} placeholder="Suc. San Lorenzo" />
              <p className="text-3xs text-muted mt-1">Con este nombre se vincula a su sucursal (si no existe, se crea).</p>
            </div>
          )}
          {nuevoPideSucursal && (
            <div>
              <label className={etiqueta}>Sucursales *</label>
              <div className="flex flex-wrap gap-2">
                {elegibles.map(l => {
                  const activa = sucNuevo.includes(l.id)
                  return (
                    <button key={l.id} type="button" role="checkbox" aria-checked={activa}
                      onClick={() => setSucNuevo(prev => prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id])}
                      className={`min-h-11 sm:min-h-9 px-3 rounded-full text-xs font-semibold border presionable ${
                        activa ? 'bg-accent text-black border-accent' : 'bg-surface2 text-muted border-border hover:text-text'
                      }`}>
                      {l.sucursal}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <p className="text-xs text-muted">Entra con las pantallas y acciones de su rol. Lo puntual se ajusta después en su ficha.</p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setModalNuevo(false)} className={`${btnSecundario} flex-1`}>Cancelar</button>
            <button type="button" onClick={crearUsuario} disabled={ocupado || !form.email || form.password.length < 6 || !form.nombre} className={`${btnPrimario} flex-1`}>
              {ocupado ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>

      {dialog}
    </div>
  )
}
