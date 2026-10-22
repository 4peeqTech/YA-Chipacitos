// Ícono y color por categoría de producto, compartidos por Pedir (local) y el
// Catálogo del mayorista: así un mismo producto se reconoce igual en las dos
// pantallas. Íconos lineales de lucide sobre un fondo suave; nada de emojis.
import { CakeSlice, Package, ShoppingBasket, Snowflake, Sparkles, Wheat, type LucideIcon } from 'lucide-react'

export interface EstiloCategoria {
  icono: LucideIcon
  /** Clases del contenedor del ícono (fondo suave + color del trazo). */
  clase: string
}

const ESTILOS: Record<string, EstiloCategoria> = {
  'Masas':            { icono: Wheat,      clase: 'bg-amber-400/15 text-amber-300' },
  'Productos Ya!':    { icono: Snowflake,  clase: 'bg-sky-400/15 text-sky-300' },
  'Bolsas Congelados':{ icono: Snowflake,  clase: 'bg-sky-400/15 text-sky-300' },
  'Cajas Congelados': { icono: Snowflake,  clase: 'bg-sky-400/15 text-sky-300' },
  'Toppings':         { icono: Sparkles,   clase: 'bg-emerald-400/15 text-emerald-300' },
  'Insumos Facturas': { icono: CakeSlice,  clase: 'bg-rose-400/15 text-rose-300' },
  'Insumos General':  { icono: Package,    clase: 'bg-zinc-400/15 text-zinc-300' },
}

const POR_DEFECTO: EstiloCategoria = { icono: ShoppingBasket, clase: 'bg-zinc-400/15 text-zinc-300' }

export function estiloCategoria(categoria: string | null | undefined): EstiloCategoria {
  return (categoria && ESTILOS[categoria]) || POR_DEFECTO
}

/** Orden en que se muestran las categorías: lo que más se pide, primero. */
export const ORDEN_CATEGORIAS = ['Masas', 'Productos Ya!', 'Bolsas Congelados', 'Cajas Congelados', 'Toppings', 'Insumos Facturas', 'Insumos General']

export function ordenCategoria(categoria: string | null | undefined): number {
  const i = categoria ? ORDEN_CATEGORIAS.indexOf(categoria) : -1
  return i === -1 ? ORDEN_CATEGORIAS.length : i
}
