'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import Flotante from './Flotante'

export interface OpcionSelect {
  value: string
  label: string
  grupo?: string
  /** Segunda línea, más chica (código, categoría…). */
  detalle?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  opciones: OpcionSelect[]
  /** @deprecated No se usa: el texto sin selección es `placeholderVacio`. Queda por compatibilidad. */
  placeholder?: string
  placeholderVacio?: string
  className?: string
  disabled?: boolean
  /** Búsqueda propia (por defecto: el label contiene el texto). Puede reordenar. */
  filtrar?: (opciones: OpcionSelect[], busqueda: string) => OpcionSelect[]
  /** false = no ofrece volver a "sin elegir" (campo obligatorio). */
  opcionVacia?: boolean
  ariaLabel?: string
  invalido?: boolean
  /** Alto máximo de la lista (clase de Tailwind). Más alto cuando las opciones traen detalle. */
  altoLista?: string
}

export default function SelectBuscador({
  value,
  onChange,
  opciones,
  placeholderVacio = '— Sin asignar —',
  className = '',
  disabled = false,
  filtrar,
  opcionVacia = true,
  ariaLabel,
  invalido = false,
  altoLista = 'max-h-52',
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const seleccionado = opciones.find(o => o.value === value)

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      // El panel vive en un portal (fuera de `ref`): también cuenta como "adentro".
      if (ref.current && !ref.current.contains(t) && !panelRef.current?.contains(t)) {
        setAbierto(false)
        setBusqueda('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Focus en buscador al abrir
  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 50)
  }, [abierto])

  const opcionesFiltradas = filtrar
    ? (busqueda.trim() ? filtrar(opciones, busqueda) : opciones)
    : opciones.filter(o => o.label.toLowerCase().includes(busqueda.toLowerCase()))

  // Agrupar por grupo
  const grupos = Array.from(new Set(opcionesFiltradas.map(o => o.grupo || ''))).filter(Boolean)
  const sinGrupo = opcionesFiltradas.filter(o => !o.grupo)

  const boton = (o: OpcionSelect) => (
    <button
      key={o.value}
      type="button"
      onClick={() => seleccionar(o.value)}
      className={`w-full text-left px-3 py-2 text-sm hover:bg-surface2 transition-colors ${
        value === o.value ? 'bg-green-bg text-success font-medium' : 'text-text'
      }`}
    >
      {value === o.value && <span className="mr-1.5">✓</span>}
      {o.label}
      {o.detalle && <span className="line-clamp-2 block text-2xs font-normal text-muted">{o.detalle}</span>}
    </button>
  )

  function seleccionar(val: string) {
    onChange(val)
    setAbierto(false)
    setBusqueda('')
    triggerRef.current?.focus()
  }

  // Escape cierra solo la lista (no el Modal de atrás) y Tab no se escapa al
  // portal: en los dos casos el foco vuelve al disparador.
  function teclaEnPanel(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      setAbierto(false)
      setBusqueda('')
      triggerRef.current?.focus()
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setAbierto(!abierto)}
        className={`w-full min-h-11 sm:min-h-9 flex items-center justify-between border rounded-lg px-3 py-2 text-sm text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
          value
            ? 'border-success bg-green-bg text-success font-medium'
            : 'border-border bg-surface2 text-muted'
        } ${abierto ? 'ring-2 ring-accent/20 border-accent' : ''} ${invalido ? 'border-brand-red' : ''}`}
      >
        <span className="truncate">{seleccionado ? seleccionado.label : placeholderVacio}</span>
        <svg className={`w-4 h-4 shrink-0 ml-2 transition-transform ${abierto ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {abierto && (
        <Flotante ancla={triggerRef} refPanel={panelRef}>
        <div onKeyDown={teclaEnPanel} className="bg-surface border border-border rounded-xl shadow-modal overflow-hidden">
          {/* Buscador */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 bg-surface2 rounded-lg px-3 py-1.5">
              <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="flex-1 bg-transparent text-xs focus:outline-none text-text placeholder:text-muted"
              />
              {busqueda && (
                <button onClick={() => setBusqueda('')} className="text-muted hover:text-text text-sm leading-none">×</button>
              )}
            </div>
          </div>

          {/* Opciones */}
          <div className={`${altoLista} overflow-y-auto`}>
            {/* Opción vacía */}
            {opcionVacia && (
              <button
                type="button"
                onClick={() => seleccionar('')}
                className={`w-full text-left px-3 py-2 text-xs text-muted hover:bg-surface2 transition-colors ${!value ? 'bg-surface2 font-medium' : ''}`}
              >
                {placeholderVacio}
              </button>
            )}

            {opcionesFiltradas.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">Sin resultados</p>
            ) : grupos.length > 0 ? (
              <>
                {grupos.map(grupo => (
                  <div key={grupo}>
                    <p className="px-3 py-1.5 text-3xs font-semibold text-accent uppercase tracking-wider bg-surface2 border-t border-border">
                      {grupo}
                    </p>
                    {opcionesFiltradas.filter(o => o.grupo === grupo).map(boton)}
                  </div>
                ))}
                {sinGrupo.map(boton)}
              </>
            ) : (
              opcionesFiltradas.map(boton)
            )}
          </div>
        </div>
        </Flotante>
      )}
    </div>
  )
}
