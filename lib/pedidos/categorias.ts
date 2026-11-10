// Ícono y color de cada producto, compartidos por Pedir (local) y el Catálogo
// del mayorista: así un mismo producto se reconoce igual en las dos pantallas.
// Íconos lineales de Tabler sobre un fondo suave; nada de emojis.
//
// Las categorías (orden, ícono, color, si se pueden pedir) las arma el admin en
// Admin → Catálogo → Categorías (tabla catalogo_categorias); llegan como
// `Categorias` desde el server component de cada pantalla.
//
// El color sale de la categoría. El ícono, en este orden:
//   1. el que se eligió a mano en Admin → Catálogo (productos.icono);
//   2. categoría con el copo de nieve: siempre el copo (lo que importa es que vienen congelados);
//   3. una palabra del nombre (masa, queso, jamón...);
//   4. el de la categoría.
import {
  IconApple, IconBaguette, IconBasket, IconBottle, IconBowlSpoon, IconBox, IconBread, IconCake,
  IconCandy, IconCheese, IconCherry, IconCoffee, IconCookie, IconDroplet, IconEgg, IconFile,
  IconGlass, IconGrain, IconIceCream, IconLeaf, IconLemon, IconMeat, IconMilk, IconPackage,
  IconPepper, IconPizza, IconSalt, IconSausage, IconShoppingBag, IconSnowflake, IconSparkles, IconTag,
  type Icon,
} from '@tabler/icons-react'
import type { DestinoProducto } from '@/lib/types'

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


/** Fila de catalogo_categorias: la arma Marcos en Admin → Catálogo → Categorías. */
export interface CategoriaCatalogo {
  id: string
  destino: DestinoProducto
  nombre: string
  orden: number
  /** Clave de ICONOS; null = el genérico. */
  icono: string | null
  color: string
  /** false = nadie la puede pedir: no aparece en Pedir ni en el Catálogo del mayorista. */
  activa: boolean
  /** Sus productos son "Tus habituales" de un local que todavía no pidió nada. */
  sugerida: boolean
}

/** Columnas de catalogo_categorias que leen las pantallas: `.select(COLUMNAS_CATEGORIA).order('orden')`. */
export const COLUMNAS_CATEGORIA = 'id, destino, nombre, orden, icono, color, activa, sugerida'

/** Colores que se pueden elegir. La clave es lo que se guarda en catalogo_categorias.color. */
export const COLORES = {
  ambar:   { clase: 'bg-amber-400/15 text-amber-300',     etiqueta: 'Ámbar' },
  celeste: { clase: 'bg-sky-400/15 text-sky-300',         etiqueta: 'Celeste' },
  verde:   { clase: 'bg-emerald-400/15 text-emerald-300', etiqueta: 'Verde' },
  rosa:    { clase: 'bg-rose-400/15 text-rose-300',       etiqueta: 'Rosa' },
  gris:    { clase: 'bg-zinc-400/15 text-zinc-300',       etiqueta: 'Gris' },
} satisfies Record<string, { clase: string; etiqueta: string }>

export type ClaveColor = keyof typeof COLORES

export const CLAVES_COLOR = Object.keys(COLORES) as ClaveColor[]

function claseColor(color: string | null | undefined): string {
  return color && Object.prototype.hasOwnProperty.call(COLORES, color) ? COLORES[color as ClaveColor].clase : COLORES.gris.clase
}

/** Categorías indexadas por destino y nombre (el mismo nombre puede estar en Fábrica y en Depósito). */
export type Categorias = ReadonlyMap<string, CategoriaCatalogo>

const clave = (destino: string, nombre: string) => `${destino}|${nombre}`

export function indexarCategorias(lista: readonly CategoriaCatalogo[]): Categorias {
  return new Map(lista.map(c => [clave(c.destino, c.nombre), c]))
}

export function buscarCategoria(cats: Categorias, destino: string, nombre: string | null | undefined): CategoriaCatalogo | undefined {
  return nombre ? cats.get(clave(destino, nombre)) : undefined
}

/** Se puede pedir: no está en una categoría desactivada. (Que tenga stock lo dice productos.activo.) */
export function esPedible(p: { destino: string; categoria: string | null }, cats: Categorias): boolean {
  return buscarCategoria(cats, p.destino, p.categoria)?.activa !== false
}

const POR_DEFECTO = { icono: IconBasket, clase: COLORES.gris.clase }

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

type ProductoEstilo = { nombre: string; destino: string; categoria: string | null }

function iconoDeCategoria(cat: CategoriaCatalogo | undefined): ClaveIcono | null {
  return cat && esClaveIcono(cat.icono) ? cat.icono : null
}

/** Ícono que le tocaría al producto sin elegir nada a mano (null = el genérico). */
export function iconoAutomatico(p: ProductoEstilo, cats: Categorias): ClaveIcono | null {
  const deCategoria = iconoDeCategoria(buscarCategoria(cats, p.destino, p.categoria))
  if (deCategoria === 'congelado') return 'congelado'
  const nombre = normalizar(p.nombre)
  const palabra = PALABRAS.find(([re]) => re.test(nombre))
  if (palabra) return palabra[1]
  return deCategoria
}

/**
 * De dónde sale el ícono automático, para explicarlo en pantalla: "por la
 * categoría Productos Ya!" (congelados, o el nombre no dice nada reconocible) o
 * "por el nombre". null = no hay (va el genérico).
 */
export function motivoIconoAutomatico(p: ProductoEstilo, cats: Categorias): 'categoria' | 'nombre' | null {
  const deCategoria = iconoDeCategoria(buscarCategoria(cats, p.destino, p.categoria))
  if (deCategoria === 'congelado') return 'categoria'
  if (PALABRAS.some(([re]) => re.test(normalizar(p.nombre)))) return 'nombre'
  return deCategoria ? 'categoria' : null
}

export interface EstiloProducto {
  icono: Icon
  clase: string
}

export function estiloProducto(p: ProductoEstilo & { icono?: string | null }, cats: Categorias): EstiloProducto {
  const clase = claseColor(buscarCategoria(cats, p.destino, p.categoria)?.color)
  const clave = esClaveIcono(p.icono) ? p.icono : iconoAutomatico(p, cats)
  return { icono: clave ? ICONOS[clave].icono : POR_DEFECTO.icono, clase }
}

/** Ícono y color de una categoría (títulos y filtros). */
export function estiloCategoria(cats: Categorias, destino: string, categoria: string | null | undefined): EstiloProducto {
  const c = buscarCategoria(cats, destino, categoria)
  if (!c) return POR_DEFECTO
  const icono = iconoDeCategoria(c)
  return { icono: icono ? ICONOS[icono].icono : POR_DEFECTO.icono, clase: claseColor(c.color) }
}

/**
 * Para ordenar nombres de categoría como los ordenó Marcos. Las que no están en
 * la tabla ("Sin categoría") van al final, por orden alfabético.
 */
export function compararCategorias(cats: Categorias, destino: string) {
  const orden = (nombre: string) => buscarCategoria(cats, destino, nombre)?.orden ?? Number.MAX_SAFE_INTEGER
  return (a: string, b: string) => orden(a) - orden(b) || a.localeCompare(b, 'es')
}
