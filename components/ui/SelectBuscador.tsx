'use client'

import { useState, useRef, useEffect } from 'react'

export interface OpcionSelect {
  value: string
  label: string
  grupo?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  opciones: OpcionSelect[]
  placeholder?: string
  placeholderVacio?: string
  className?: string
  disabled?: boolean
}

export default function SelectBuscador({
  value,
  onChange,
  opciones,
  placeholder = 'Seleccionar...',
  placeholderVacio = '— Sin asignar —',
  className = '',
  disabled = false,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const seleccionado = opciones.find(o => o.value === value)

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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

  const opcionesFiltradas = opciones.filter(o =>
    o.label.toLowerCase().includes(busqueda.toLowerCase())
  )

  // Agrupar por grupo
  const grupos = Array.from(new Set(opcionesFiltradas.map(o => o.grupo || ''))).filter(Boolean)
  const sinGrupo = opcionesFiltradas.filter(o => !o.grupo)

  function seleccionar(val: string) {
    onChange(val)
    setAbierto(false)
    setBusqueda('')
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(!abierto)}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm text-left transition-colors focus:outline-none disabled:opacity-50 ${
          value
            ? 'border-[#56d68a] bg-[rgba(86,214,138,.1)] text-[#56d68a] font-medium'
            : 'border-[#2a2a2a] bg-[#1a1a1a] text-[#888]'
        } ${abierto ? 'ring-2 ring-[#e8c547]/20 border-[#e8c547]' : ''}`}
      >
        <span className="truncate">{seleccionado ? seleccionado.label : placeholderVacio}</span>
        <svg className={`w-4 h-4 shrink-0 ml-2 transition-transform ${abierto ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {abierto && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-[#111111] border border-[#2a2a2a] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,.6)] overflow-hidden">
          {/* Buscador */}
          <div className="p-2 border-b border-[#2a2a2a]">
            <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg px-3 py-1.5">
              <svg className="w-3.5 h-3.5 text-[#888] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="flex-1 bg-transparent text-xs focus:outline-none text-[#f0f0f0] placeholder:text-[#888]"
              />
              {busqueda && (
                <button onClick={() => setBusqueda('')} className="text-[#888] hover:text-[#f0f0f0] text-sm leading-none">×</button>
              )}
            </div>
          </div>

          {/* Opciones */}
          <div className="max-h-52 overflow-y-auto">
            {/* Opción vacía */}
            <button
              type="button"
              onClick={() => seleccionar('')}
              className={`w-full text-left px-3 py-2 text-xs text-[#888] hover:bg-[#1a1a1a] transition-colors ${!value ? 'bg-[#1a1a1a] font-medium' : ''}`}
            >
              {placeholderVacio}
            </button>

            {opcionesFiltradas.length === 0 ? (
              <p className="text-xs text-[#888] text-center py-4">Sin resultados</p>
            ) : grupos.length > 0 ? (
              <>
                {grupos.map(grupo => (
                  <div key={grupo}>
                    <p className="px-3 py-1.5 text-[10px] font-semibold text-[#e8c547] uppercase tracking-wider bg-[#1a1a1a] border-t border-[#2a2a2a]">
                      {grupo}
                    </p>
                    {opcionesFiltradas.filter(o => o.grupo === grupo).map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => seleccionar(o.value)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[#1a1a1a] transition-colors ${
                          value === o.value ? 'bg-[rgba(86,214,138,.1)] text-[#56d68a] font-medium' : 'text-[#f0f0f0]'
                        }`}
                      >
                        {value === o.value && <span className="mr-1.5">✓</span>}
                        {o.label}
                      </button>
                    ))}
                  </div>
                ))}
                {sinGrupo.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => seleccionar(o.value)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[#1a1a1a] transition-colors ${
                      value === o.value ? 'bg-[rgba(86,214,138,.1)] text-[#56d68a] font-medium' : 'text-[#f0f0f0]'
                    }`}
                  >
                    {value === o.value && <span className="mr-1.5">✓</span>}
                    {o.label}
                  </button>
                ))}
              </>
            ) : (
              opcionesFiltradas.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => seleccionar(o.value)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#1a1a1a] transition-colors ${
                    value === o.value ? 'bg-[rgba(86,214,138,.1)] text-[#56d68a] font-medium' : 'text-[#f0f0f0]'
                  }`}
                >
                  {value === o.value && <span className="mr-1.5">✓</span>}
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
