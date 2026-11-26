'use client'

// Tildes de pantallas y acciones (épica roles y permisos, T5/T6). Lo usan la
// pantalla de Roles (los defaults del rol) y la ficha de usuario (lo que la
// persona tiene hoy, marcado cuando difiere de su rol).

import { useState, type ComponentType } from 'react'
import {
  IconBuildingFactory2, IconBuildingStore, IconCheck, IconChevronDown, IconLayoutDashboard, IconLayoutGrid,
  IconPlugConnected, IconSettings, IconShoppingCart, IconTruck, IconTruckDelivery, IconWallet,
} from '@tabler/icons-react'
import { AREAS, type Area, type PermisoCatalogo } from '@/lib/permisos/catalogo'
import { accionesVisibles, alternar, seccionesPantallas, tildable, type SeccionPantallas } from '@/lib/permisos/editor'

type Icono = ComponentType<{ size?: number | string; className?: string }>

export const ICONO_AREA: Record<Area, Icono> = {
  administracion: IconLayoutDashboard,
  locales: IconBuildingStore,
  fabrica: IconBuildingFactory2,
  deposito: IconTruck,
  mayorista: IconTruckDelivery,
}

const ICONO_SECCION: Record<string, Icono> = {
  Generales: IconLayoutGrid,
  Gastos: IconWallet,
  Mayorista: IconTruckDelivery,
  Compras: IconShoppingCart,
  Integraciones: IconPlugConnected,
  Parámetros: IconSettings,
  Fábrica: IconBuildingFactory2,
  Proveedores: IconTruck,
}

/** Chips de áreas. Sin onAlternar, solo muestran las del rol. */
export function AreasChips({ areas, onAlternar, deshabilitado }: {
  areas: Area[]
  onAlternar?: (a: Area) => void
  deshabilitado?: boolean
}) {
  const lista = onAlternar ? AREAS : AREAS.filter(a => areas.includes(a.clave))
  return (
    <div className="flex flex-wrap gap-2">
      {lista.map(a => {
        const Icon = ICONO_AREA[a.clave]
        const activa = areas.includes(a.clave)
        const clase = `inline-flex items-center gap-2 min-h-11 sm:min-h-10 px-4 rounded-xl border text-sm font-semibold ${
          activa ? 'bg-accent-bg border-accent text-accent-fg' : 'bg-surface2 border-border text-muted'
        }`
        if (!onAlternar) return <span key={a.clave} className={clase}><Icon size={18} /> {a.nombre}</span>
        return (
          <button key={a.clave} type="button" role="checkbox" aria-checked={activa} disabled={deshabilitado}
            onClick={() => onAlternar(a.clave)}
            className={`${clase} presionable ${activa ? '' : 'hover:text-text'} disabled:opacity-60`}>
            <Icon size={18} /> {a.nombre}
          </button>
        )
      })}
    </div>
  )
}

function Tilde({ marcado, deshabilitado }: { marcado: boolean; deshabilitado?: boolean }) {
  return (
    <span aria-hidden className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center ${
      marcado ? 'bg-accent border-accent text-black' : 'bg-surface2 border-border'
    } ${deshabilitado ? 'opacity-50' : ''}`}>
      {marcado && <IconCheck size={14} stroke={3} />}
    </span>
  )
}

export function MarcaSoloAdmin() {
  return <span className="shrink-0 text-3xs font-semibold px-2 py-0.5 rounded-full bg-surface2 text-muted border border-border">solo Admin</span>
}

interface PropsFila {
  permiso: PermisoCatalogo
  valor: ReadonlySet<string>
  referencia?: ReadonlySet<string>
  soloLectura?: boolean
  conAyuda?: boolean
  onAlternar: (clave: string) => void
  onVolverAlRol?: (clave: string) => void
}

function Fila({ permiso: p, valor, referencia, soloLectura, conAyuda, onAlternar, onVolverAlRol }: PropsFila) {
  const marcado = valor.has(p.clave)
  const bloqueado = soloLectura || !tildable(p)
  const distinto = referencia && tildable(p) && referencia.has(p.clave) !== marcado
  return (
    <div>
      <div className="flex items-center gap-2 min-h-11 sm:min-h-9">
        <button type="button" role="checkbox" aria-checked={marcado} disabled={bloqueado}
          onClick={() => onAlternar(p.clave)}
          className={`flex-1 min-w-0 flex items-start gap-3 text-left py-1 ${bloqueado ? 'cursor-default' : 'presionable'}`}>
          <Tilde marcado={marcado} deshabilitado={!tildable(p) && !soloLectura} />
          <span className="min-w-0">
            <span className={`block text-sm ${conAyuda ? 'font-semibold text-text' : marcado ? 'text-text' : 'text-muted'}`}>{p.nombre}</span>
            {conAyuda && p.ayuda && <span className="block text-xs text-muted mt-0.5">{p.ayuda}</span>}
          </span>
        </button>
        {!tildable(p) && <MarcaSoloAdmin />}
      </div>
      {/* La marca va debajo del nombre: en tarjetas angostas, al lado se montaba sobre el texto. */}
      {distinto && (
        <div className="flex flex-wrap items-center gap-x-2 pl-8 -mt-1 pb-1">
          <span className={`text-3xs font-semibold px-2 py-0.5 rounded-full ${
            marcado ? 'bg-green-bg text-success' : 'bg-danger-bg text-brand-red'
          }`}>{marcado ? 'agregada' : 'quitada'}</span>
          {onVolverAlRol && !soloLectura && (
            <button type="button" onClick={() => onVolverAlRol(p.clave)}
              className="text-xs font-semibold text-accent-fg hover:underline min-h-9 px-1">
              Volver al rol
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function contar(s: SeccionPantallas, valor: ReadonlySet<string>) {
  return { tiene: s.pantallas.filter(p => valor.has(p.clave)).length, total: s.pantallas.length }
}

export interface PropsEditor {
  areas: Area[]
  /** Lo tildado: defaults del rol (Roles) o lo que la persona tiene (ficha). */
  valor: ReadonlySet<string>
  onCambiar: (nuevo: Set<string>) => void
  /** Ficha: los defaults de su rol, para marcar "agregada" / "quitada". */
  referencia?: ReadonlySet<string>
  soloLectura?: boolean
}

export default function EditorPermisos({ areas, valor, onCambiar, referencia, soloLectura }: PropsEditor) {
  const secciones = seccionesPantallas(areas)
  const abiertas = secciones.filter(s => !s.plegada)
  const plegadas = secciones.filter(s => s.plegada)
  const acciones = accionesVisibles(areas)
  const tildables = secciones.flatMap(s => s.pantallas).filter(tildable)
  const marcadas = tildables.filter(p => valor.has(p.clave)).length
  const [abierta, setAbierta] = useState<string | null>(abiertas[0]?.clave ?? null)

  const alternarClave = (clave: string) => onCambiar(alternar(valor, clave))
  const volverAlRol = (clave: string) => {
    if (!referencia) return
    const nuevo = new Set(valor)
    if (referencia.has(clave)) nuevo.add(clave)
    else nuevo.delete(clave)
    onCambiar(nuevo)
  }
  function todas(s: SeccionPantallas) {
    const nuevo = new Set(valor)
    const propias = s.pantallas.filter(tildable)
    const todasMarcadas = propias.every(p => nuevo.has(p.clave))
    for (const p of propias) {
      if (todasMarcadas) nuevo.delete(p.clave)
      else nuevo.add(p.clave)
    }
    onCambiar(nuevo)
  }

  const fila = (p: PermisoCatalogo, conAyuda = false) => (
    <Fila key={p.clave} permiso={p} valor={valor} referencia={referencia} soloLectura={soloLectura} conAyuda={conAyuda}
      onAlternar={alternarClave} onVolverAlRol={referencia ? volverAlRol : undefined} />
  )

  const tarjeta = (s: SeccionPantallas) => {
    const sinTildables = s.pantallas.every(p => !tildable(p))
    return (
      <div key={s.clave} className="bg-surface border border-border rounded-card p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-3xs font-semibold uppercase tracking-wider text-muted">{s.nombre}</p>
          {!soloLectura && !sinTildables && s.pantallas.filter(tildable).length > 1 && (
            <button type="button" onClick={() => todas(s)} className="text-xs font-semibold text-accent-fg hover:underline">
              {s.pantallas.filter(tildable).every(p => valor.has(p.clave)) ? 'Ninguna' : 'Todas'}
            </button>
          )}
        </div>
        {s.pantallas.map(p => fila(p))}
      </div>
    )
  }

  const plegable = (s: SeccionPantallas) => {
    const Icon = ICONO_SECCION[s.nombre] ?? IconLayoutGrid
    const { tiene, total } = contar(s, valor)
    const abierto = abierta === s.clave
    return (
      <div key={s.clave} className="bg-surface border border-border rounded-card overflow-hidden">
        <button type="button" onClick={() => setAbierta(abierto ? null : s.clave)} aria-expanded={abierto}
          className="w-full flex items-center gap-3 px-3 min-h-12 text-left">
          <Icon size={20} className="text-text shrink-0" />
          <span className="flex-1 text-sm font-semibold text-text">{s.nombre}</span>
          <span className="text-xs text-muted">{tiene} de {total}</span>
          <IconChevronDown size={18} className={`text-muted transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
        {abierto && (
          <div className="border-t border-border px-3 py-1">
            {!soloLectura && s.pantallas.filter(tildable).length > 1 && (
              <div className="flex justify-end">
                <button type="button" onClick={() => todas(s)} className="text-xs font-semibold text-accent-fg min-h-9">
                  {s.pantallas.filter(tildable).every(p => valor.has(p.clave)) ? 'Ninguna' : 'Todas'}
                </button>
              </div>
            )}
            {s.pantallas.map(p => fila(p))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text">
          {areas.includes('administracion') ? 'Pantallas de Administración' : 'Pantallas'}{' '}
          <span className="font-normal text-muted">{marcadas} de {tildables.length}</span>
        </h3>

        {/* Celular: secciones plegables */}
        <div className="md:hidden space-y-2">
          {secciones.map(plegable)}
        </div>

        {/* Desktop: tarjetas por sección; Fábrica y Proveedores, plegadas al final */}
        <div className="hidden md:block space-y-2">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
            {abiertas.map(tarjeta)}
          </div>
          {plegadas.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted hover:text-text list-none flex items-center gap-1 py-1">
                <IconChevronDown size={14} className="transition-transform group-open:rotate-180" />
                {plegadas.map(s => s.nombre).join(' y ')} en Administración
                ({plegadas.reduce((n, s) => n + contar(s, valor).tiene, 0)} de {plegadas.reduce((n, s) => n + s.pantallas.length, 0)}, casi todo solo Admin)
              </summary>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 items-start mt-2">
                {plegadas.map(tarjeta)}
              </div>
            </details>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text">
          Acciones <span className="font-normal text-muted">lo que no alcanza con tener la pantalla</span>
        </h3>
        <div className="grid md:grid-cols-2 gap-2">
          {acciones.map(a => (
            <div key={a.clave} className="bg-surface border border-border rounded-card px-3 py-2">{fila(a, true)}</div>
          ))}
        </div>
        {!areas.includes('fabrica') && (
          <p className="text-xs text-muted">&quot;Corregir cargas viejas de Fábrica&quot; aparece cuando el rol tiene el área Fábrica.</p>
        )}
      </section>
    </div>
  )
}
