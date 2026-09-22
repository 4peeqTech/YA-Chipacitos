'use client'

import { useEffect, useRef, useState } from 'react'
import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Set curado de íconos relevantes para listas de control de stock. El valor
// guardado es el nombre del componente lucide-react (no un emoji) — ver
// supabase/migrations/20260812100000_fabrica_control_stock_ajustes.sql para
// la migración de datos de los 3 registros semilla.
export const ICONOS_CONTROL_STOCK = [
  'Package', 'PackageOpen', 'Boxes', 'Box', 'Archive', 'Warehouse',
  'Wheat', 'Egg', 'Milk', 'Cookie', 'Beef', 'Fish',
  'ShoppingBasket', 'ShoppingCart', 'ClipboardList', 'Layers',
  'Scale', 'Droplet', 'Flame', 'Snowflake', 'Utensils', 'Sandwich',
  'CircleDot', 'Star',
] as const

const ICON_MAP = Icons as unknown as Record<string, LucideIcon>

// Tolera valores viejos (emoji sueltos guardados antes de este picker) — si
// el nombre no matchea ningún ícono conocido, se muestra como texto plano.
export function IconoRenderer({ nombre, size = 16, className }: { nombre?: string | null; size?: number; className?: string }) {
  if (!nombre) return null
  const Icon = ICON_MAP[nombre]
  if (Icon) return <Icon size={size} className={className} />
  return <span className={className} style={{ fontSize: size * 0.75 }}>{nombre}</span>
}

export default function IconoPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(o => !o)}
        className={`w-full flex items-center gap-2 border rounded-lg px-3 py-2 text-sm text-left transition-colors focus:outline-none ${
          value ? 'border-success bg-green-bg text-success' : 'border-border bg-surface2 text-muted'
        } ${abierto ? 'ring-2 ring-accent/20 border-accent' : ''}`}
      >
        <IconoRenderer nombre={value} size={16} />
        <span className="flex-1 truncate">{value || 'Elegir ícono...'}</span>
      </button>

      {abierto && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-surface border border-border rounded-xl shadow-modal p-2">
          <div className="grid grid-cols-6 gap-1 max-h-52 overflow-y-auto">
            {ICONOS_CONTROL_STOCK.map(nombre => (
              <button
                key={nombre}
                type="button"
                title={nombre}
                onClick={() => { onChange(nombre); setAbierto(false) }}
                className={`aspect-square flex items-center justify-center rounded-lg transition-colors ${
                  value === nombre ? 'bg-accent text-black' : 'text-muted hover:text-accent hover:bg-surface2'
                }`}
              >
                <IconoRenderer nombre={nombre} size={18} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
