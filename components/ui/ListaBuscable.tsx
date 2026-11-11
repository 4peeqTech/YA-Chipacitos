'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconCheck, IconChevronDown, IconSearch, IconX } from '@tabler/icons-react'
import Flotante from './Flotante'
import { controlClass } from './Field'

export interface OpcionLista {
  value: string
  label: string
  /** Agrupa las opciones bajo un título (en el orden en que aparecen). */
  grupo?: string
  /** Texto chico debajo de la etiqueta. */
  descripcion?: string
  /** Texto extra donde también se busca (ej. nombres alternativos). No se muestra. */
  buscar?: string
  /** Algo para mostrar antes de la etiqueta (ej. un chip de código). */
  prefijo?: ReactNode
}

interface Props {
  value: string
  onChange: (value: string) => void
  opciones: OpcionLista[]
  /** Opción vacía (value ''): "Todas las categorías", "Sin sabor"… null = no hay opción vacía. */
  vacio?: string | null
  /** Texto del disparador cuando no hay nada elegido y no hay opción vacía. */
  placeholder?: string
  /** El buscador aparece con más de este número de opciones (por defecto 7). */
  buscadorDesde?: number
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/** Minúsculas y sin acentos: "jamon" encuentra "Jamón". */
function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Lista desplegable propia: mismo estilo que los campos de la app, buscador
 * (sin acentos, por varias palabras) en las listas largas y manejo con teclado
 * (↑ ↓ Enter Esc). Reemplaza al <select> nativo en listas largas.
 */
export default function ListaBuscable({
  value, onChange, opciones, vacio = null, placeholder = 'Elegí una opción…',
  buscadorDesde = 7, disabled = false, className = '', 'aria-label': ariaLabel,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [activo, setActivo] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)
  const idLista = useId()

  const conBuscador = opciones.length > buscadorDesde
  const seleccionada = opciones.find(o => o.value === value)

  // Opción vacía primero (si hay), después las filtradas.
  const visibles = useMemo(() => {
    const palabras = normalizar(busqueda.trim()).split(/\s+/).filter(Boolean)
    const filtradas = palabras.length
      ? opciones.filter(o => {
          const texto = normalizar(`${o.label} ${o.buscar ?? ''} ${o.grupo ?? ''} ${o.descripcion ?? ''}`)
          return palabras.every(p => texto.includes(p))
        })
      : opciones
    return vacio != null && !palabras.length ? [{ value: '', label: vacio } as OpcionLista, ...filtradas] : filtradas
  }, [opciones, busqueda, vacio])

  function abrir() {
    if (disabled) return
    const i = visibles.findIndex(o => o.value === value)
    setActivo(i >= 0 ? i : 0)
    setAbierto(true)
  }

  function cerrar(devolverFoco = true) {
    setAbierto(false)
    setBusqueda('')
    if (devolverFoco) triggerRef.current?.focus()
  }

  function elegir(v: string) {
    onChange(v)
    cerrar()
  }

  // Cerrar al hacer clic afuera (el panel vive en un portal).
  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) cerrar(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  useEffect(() => {
    if (abierto) setTimeout(() => (conBuscador ? inputRef.current : listaRef.current)?.focus(), 30)
  }, [abierto, conBuscador])

  // La opción activa siempre a la vista.
  useEffect(() => {
    if (!abierto) return
    listaRef.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activo, abierto])

  function teclas(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(i + 1, visibles.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setActivo(0) }
    else if (e.key === 'End') { e.preventDefault(); setActivo(visibles.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = visibles[activo]; if (o) elegir(o.value) }
    // Esc cierra solo la lista, no el Modal de atrás; Tab no se escapa al portal.
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); cerrar() }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-label={ariaLabel}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={e => { if (!abierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); abrir() } }}
        className={`${controlClass} flex min-h-11 items-center gap-2 text-left sm:min-h-9 ${abierto ? 'border-accent' : ''}`}
      >
        {seleccionada?.prefijo}
        <span className={`min-w-0 flex-1 truncate ${seleccionada || (vacio != null && !value) ? 'text-text' : 'text-muted'}`}>
          {seleccionada ? seleccionada.label : vacio ?? placeholder}
        </span>
        <IconChevronDown size={16} className={`shrink-0 text-muted transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <Flotante ancla={triggerRef} refPanel={panelRef} anchoMin={240}>
          <div onKeyDown={teclas} className="overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
            {conBuscador && (
              <div className="border-b border-border p-2">
                <label className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2">
                  <IconSearch size={16} className="shrink-0 text-muted" />
                  <input
                    ref={inputRef}
                    value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setActivo(0) }}
                    placeholder="Buscar…"
                    aria-label="Buscar en la lista"
                    aria-controls={idLista}
                    aria-activedescendant={visibles[activo] ? `${idLista}-${activo}` : undefined}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
                  />
                  {busqueda && (
                    <button type="button" onClick={() => { setBusqueda(''); inputRef.current?.focus() }} aria-label="Borrar búsqueda" className="text-muted hover:text-text">
                      <IconX size={14} />
                    </button>
                  )}
                </label>
              </div>
            )}
            <ul ref={listaRef} id={idLista} role="listbox" tabIndex={-1} aria-label={ariaLabel}
              aria-activedescendant={!conBuscador && visibles[activo] ? `${idLista}-${activo}` : undefined}
              className="max-h-64 overflow-y-auto py-1 focus:outline-none">
              {visibles.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">Sin resultados</li>}
              {visibles.map((o, i) => {
                const titulo = o.grupo && (i === 0 || visibles[i - 1].grupo !== o.grupo) ? o.grupo : null
                const elegida = o.value === value
                return (
                  <li key={`${o.value}-${i}`} role="presentation">
                    {titulo && (
                      <p className={`px-3 pb-1 pt-2 text-3xs font-semibold uppercase tracking-wider text-accent-fg ${i === 0 ? '' : 'mt-1 border-t border-border'}`}>
                        {titulo}
                      </p>
                    )}
                    <div
                      id={`${idLista}-${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={elegida}
                      onMouseEnter={() => setActivo(i)}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => elegir(o.value)}
                      className={`mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
                        i === activo ? 'bg-surface2' : ''} ${o.value === '' ? 'text-muted' : 'text-text'}`}
                    >
                      {o.prefijo}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.descripcion && <span className="block truncate text-xs text-muted">{o.descripcion}</span>}
                      </span>
                      {elegida && <IconCheck size={16} className="shrink-0 text-accent" />}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </Flotante>
      )}
    </div>
  )
}
