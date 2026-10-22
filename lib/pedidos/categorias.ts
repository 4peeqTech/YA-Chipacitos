// Ícono y color de cada producto, compartidos por Pedir (local) y el Catálogo
// del mayorista: así un mismo producto se reconoce igual en las dos pantallas.
// Íconos lineales de Tabler sobre un fondo suave; nada de emojis.
//
// El color sale de la categoría. El ícono, en este orden:
//   1. el que se eligió a mano en Admin → Catálogo (productos.icono);
//   2. Congelados: siempre el copo de nieve (lo que importa es que vienen congelados);
//   3. una palabra del nombre (masa, queso, jamón...);
//   4. el de la categoría.
import {
  IconApple, IconBaguette, IconBasket, IconBottle, IconBowlSpoon, IconBox, IconBread, IconCake,
  IconCandy, IconCheese, IconCherry, IconCoffee, IconCookie, IconDroplet, IconEgg, IconFile,
  IconGlass, IconGrain, IconIceCream, IconLeaf, IconLemon, IconMeat, IconMilk, IconPackage,
  IconPepper, IconPizza, IconSalt, IconSausage, IconShoppingBag, IconSnowflake, IconSparkles, IconTag,
  type Icon,
} from '@tabler/icons-react'

export type IconoProducto = Icon

/** Íconos que se pueden elegir a mano. La clave es lo que se guarda en productos.icono. */
export const ICONOS = {
  masa:           { icono: IconBread,       etiqueta: 'Masa / pan' },
  baguette:       { icono: IconBaguette,    etiqueta: 'Baguette' },
  queso:          { icono: IconCheese,      etiqueta: 'Queso' },
  jamon:          { icono: IconMeat,        etiqueta: 'Jamón / carne' },
  salame:         { icono: IconSausage,     etiqueta: 'Salame' },
  huevo:          { icono: IconEgg,         etiqueta: 'Huevo' },
  harina:         { icono: IconGrain,       etiqueta: 'Harina / cereal' },
  anis:           { icono: IconLeaf,        etiqueta: 'Anís / hierba' },
  condimento:     { icono: IconPepper,      etiqueta: 'Condimento' },
  rallado:        { icono: IconSalt,        etiqueta: 'Rallado / coco' },
  almibar:        { icono: IconDroplet,     etiqueta: 'Almíbar / líquido' },
  crema:          { icono: IconBowlSpoon,   etiqueta: 'Crema' },
  dulce_de_leche: { icono: IconMilk,        etiqueta: 'Dulce de leche / leche' },
  fruta:          { icono: IconApple,       etiqueta: 'Membrillo / fruta' },
  cereza:         { icono: IconCherry,      etiqueta: 'Cereza' },
  limon:          { icono: IconLemon,       etiqueta: 'Limón' },
  torta:          { icono: IconCake,        etiqueta: 'Torta / facturas' },
  galletita:      { icono: IconCookie,      etiqueta: 'Galletita' },
  golosina:       { icono: IconCandy,       etiqueta: 'Golosina' },
  helado:         { icono: IconIceCream,    etiqueta: 'Helado' },
  pizza:          { icono: IconPizza,       etiqueta: 'Pizza' },
  congelado:      { icono: IconSnowflake,   etiqueta: 'Congelado' },
  topping:        { icono: IconSparkles,    etiqueta: 'Topping' },
  bolsa:          { icono: IconShoppingBag, etiqueta: 'Bolsa' },
  caja:           { icono: IconBox,         etiqueta: 'Caja' },
  vaso:           { icono: IconCoffee,      etiqueta: 'Vaso / café' },
  copa:           { icono: IconGlass,       etiqueta: 'Vaso frío' },
  botella:        { icono: IconBottle,      etiqueta: 'Botella' },
  papel:          { icono: IconFile,        etiqueta: 'Papel' },
  cinta:          { icono: IconTag,         etiqueta: 'Cinta / etiqueta' },
  paquete:        { icono: IconPackage,     etiqueta: 'Paquete / otro' },
} satisfies Record<string, { icono: Icon; etiqueta: string }>

export type ClaveIcono = keyof typeof ICONOS

export const CLAVES_ICONO = Object.keys(ICONOS) as ClaveIcono[]

export function esClaveIcono(v: string | null | undefined): v is ClaveIcono {
  return v != null && Object.prototype.hasOwnProperty.call(ICONOS, v)
}

interface Categoria {
  icono: ClaveIcono
  /** Clases del contenedor del ícono (fondo suave + color del trazo). */
  clase: string
}

const AMBAR = 'bg-amber-400/15 text-amber-300'
const CELESTE = 'bg-sky-400/15 text-sky-300'
const VERDE = 'bg-emerald-400/15 text-emerald-300'
const ROSA = 'bg-rose-400/15 text-rose-300'
const GRIS = 'bg-zinc-400/15 text-zinc-300'

const CATEGORIAS: Record<string, Categoria> = {
  'Masas':             { icono: 'masa',      clase: AMBAR },
  'Productos Ya!':     { icono: 'congelado', clase: CELESTE },
  'Bolsas Congelados': { icono: 'congelado', clase: CELESTE },
  'Cajas Congelados':  { icono: 'congelado', clase: CELESTE },
  'Toppings':          { icono: 'topping',   clase: VERDE },
  'Insumos Facturas':  { icono: 'torta',     clase: ROSA },
  'Insumos General':   { icono: 'paquete',   clase: GRIS },
  'Bolsas Ya!':        { icono: 'bolsa',     clase: GRIS },
  'Cajas Ya!':         { icono: 'caja',      clase: GRIS },
  'Vasos Café Ya!':    { icono: 'vaso',      clase: GRIS },
}

const CONGELADOS = new Set(['Productos Ya!', 'Bolsas Congelados', 'Cajas Congelados'])

const POR_DEFECTO = { icono: IconBasket, clase: GRIS }

/** Palabra del nombre (sin tildes, en minúscula) → ícono. Gana la primera que aparece en la lista. */
const PALABRAS: [RegExp, ClaveIcono][] = [
  [/\bmasa/, 'masa'],
  [/queso|cheddar|pategras|sardo|cheese/, 'queso'],
  [/jamon/, 'jamon'],
  [/salame|salamin/, 'salame'],
  [/almibar/, 'almibar'],
  [/\bcoco\b/, 'rallado'],
  [/crema/, 'crema'],
  [/membrillo/, 'fruta'],
  [/dulce de leche/, 'dulce_de_leche'],
  [/\bbolsa/, 'bolsa'],
  [/\bcaja/, 'caja'],
  [/\bvaso/, 'vaso'],
  [/papel|bobina/, 'papel'],
  [/\bcinta/, 'cinta'],
  [/congelad/, 'congelado'],
]

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Ícono que le tocaría al producto sin elegir nada a mano (null = el genérico). */
export function iconoAutomatico(p: { nombre: string; categoria: string | null }): ClaveIcono | null {
  if (p.categoria && CONGELADOS.has(p.categoria)) return 'congelado'
  const nombre = normalizar(p.nombre)
  const palabra = PALABRAS.find(([re]) => re.test(nombre))
  if (palabra) return palabra[1]
  return (p.categoria && CATEGORIAS[p.categoria]?.icono) || null
}

export interface EstiloProducto {
  icono: Icon
  clase: string
}

export function estiloProducto(p: { nombre: string; categoria: string | null; icono?: string | null }): EstiloProducto {
  const clase = (p.categoria && CATEGORIAS[p.categoria]?.clase) || POR_DEFECTO.clase
  const clave = esClaveIcono(p.icono) ? p.icono : iconoAutomatico(p)
  return { icono: clave ? ICONOS[clave].icono : POR_DEFECTO.icono, clase }
}

/** Ícono y color de una categoría (títulos y filtros). */
export function estiloCategoria(categoria: string | null | undefined): EstiloProducto {
  const c = categoria ? CATEGORIAS[categoria] : undefined
  return c ? { icono: ICONOS[c.icono].icono, clase: c.clase } : POR_DEFECTO
}

/** Orden en que se muestran las categorías: lo que más se pide, primero. */
export const ORDEN_CATEGORIAS = ['Masas', 'Productos Ya!', 'Bolsas Congelados', 'Cajas Congelados', 'Toppings', 'Insumos Facturas', 'Insumos General']

export function ordenCategoria(categoria: string | null | undefined): number {
  const i = categoria ? ORDEN_CATEGORIAS.indexOf(categoria) : -1
  return i === -1 ? ORDEN_CATEGORIAS.length : i
}
