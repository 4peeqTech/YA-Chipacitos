'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'
import * as Lucide from 'lucide-react'
import {
  IconArchive, IconBaguette, IconBasket, IconBox, IconBoxMultiple, IconBuildingWarehouse, IconCircleDot,
  IconClipboardList, IconCookie, IconDroplet, IconEgg, IconFish, IconFlame, IconMeat, IconMilk, IconPackage,
  IconPackageExport, IconScale, IconShoppingCart, IconSnowflake, IconStack2, IconStar, IconToolsKitchen2, IconWheat,
  type Icon,
} from '@tabler/icons-react'

// Set curado de íconos para las listas de control de stock (definiciones de
// conteo). Lo guardado en fabrica_conteo_definiciones.icono es el nombre del
// componente de Tabler (p. ej. 'IconEgg'), la librería de la app desde el 23-10.
// Antes eran nombres de lucide: los traduce la migración
// 20261026100000_conteos_iconos_tabler.sql, y el renderer los sigue entendiendo
// (LUCIDE_A_TABLER) por si el código llega antes que la migración o al revés.
const ICONOS: Record<string, Icon> = {
  IconPackage, IconPackageExport, IconBoxMultiple, IconBox, IconArchive, IconBuildingWarehouse,
  IconWheat, IconEgg, IconMilk, IconCookie, IconMeat, IconFish,
  IconBasket, IconShoppingCart, IconClipboardList, IconStack2,
  IconScale, IconDroplet, IconFlame, IconSnowflake, IconToolsKitchen2, IconBaguette,
  IconCircleDot, IconStar,
}

export const ICONOS_CONTROL_STOCK = Object.keys(ICONOS)

// Los estados (lib/estados.ts, EstadoBadge) todavía guardan nombres de lucide: se
// resuelven acá hasta que se pasen a Tabler. Los conteos ya no llegan hasta este paso.
const LUCIDE = Lucide as unknown as Record<string, ComponentType<{ size?: number; className?: string }> | undefined>

/** Nombres de lucide que se guardaban antes → su equivalente de Tabler. */
export const LUCIDE_A_TABLER: Record<string, string> = {
  Package: 'IconPackage', PackageOpen: 'IconPackageExport', Boxes: 'IconBoxMultiple', Box: 'IconBox',
  Archive: 'IconArchive', Warehouse: 'IconBuildingWarehouse', Wheat: 'IconWheat', Egg: 'IconEgg',
  Milk: 'IconMilk', Cookie: 'IconCookie', Beef: 'IconMeat', Fish: 'IconFish', ShoppingBasket: 'IconBasket',
  ShoppingCart: 'IconShoppingCart', ClipboardList: 'IconClipboardList', Layers: 'IconStack2', Scale: 'IconScale',
  Droplet: 'IconDroplet', Flame: 'IconFlame', Snowflake: 'IconSnowflake', Utensils: 'IconToolsKitchen2',
  Sandwich: 'IconBaguette', CircleDot: 'IconCircleDot', Star: 'IconStar',
}

/** Nombre legible para el botón ("IconEgg" → "Egg"). */
function etiqueta(nombre: string) {
  return nombre.replace(/^Icon/, '')
}

// Orden: ícono de Tabler → nombre viejo de lucide traducido a Tabler → cualquier otro
// nombre de lucide (estados) → texto (emoji sueltos guardados antes de este picker).
export function IconoRenderer({ nombre, size = 16, className }: { nombre?: string | null; size?: number; className?: string }) {
  if (!nombre) return null
  const Componente = ICONOS[nombre] ?? ICONOS[LUCIDE_A_TABLER[nombre] ?? ''] ?? LUCIDE[nombre]
  if (Componente) return <Componente size={size} className={className} />
  return <span className={className} style={{ fontSize: size * 0.75 }}>{nombre}</span>
}

export default function IconoPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Un valor viejo de lucide se muestra como su equivalente de Tabler.
  const actual = value ? (LUCIDE_A_TABLER[value] ?? value) : null

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
          actual ? 'border-success bg-green-bg text-success' : 'border-border bg-surface2 text-muted'
        } ${abierto ? 'ring-2 ring-accent/20 border-accent' : ''}`}
      >
        <IconoRenderer nombre={actual} size={16} />
        <span className="flex-1 truncate">{actual ? etiqueta(actual) : 'Elegir ícono...'}</span>
      </button>

      {abierto && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-surface border border-border rounded-xl shadow-modal p-2">
          <div className="grid grid-cols-6 gap-1 max-h-52 overflow-y-auto">
            {ICONOS_CONTROL_STOCK.map(nombre => (
              <button
                key={nombre}
                type="button"
                title={etiqueta(nombre)}
                onClick={() => { onChange(nombre); setAbierto(false) }}
                className={`aspect-square flex items-center justify-center rounded-lg transition-colors ${
                  actual === nombre ? 'bg-accent text-black' : 'text-muted hover:text-accent hover:bg-surface2'
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
