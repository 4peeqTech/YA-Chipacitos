// Plan de cuentas (fijo, lo define Nico): tipos, árbol y búsqueda.
// Lo usan Parámetros › Plan de cuentas y el selector de cuenta de Gastos.

import type { Database } from '@/lib/database.types'

type Fila = Database['public']['Tables']['plan_cuentas']['Row']

/** Qué cuentas se eligen al cargar un gasto: las de gasto y las que no lo son pero mueven plata. */
export type UsoGastos = 'gasto' | 'otro_pago'

export interface CuentaPlan {
  codigo: string
  nombre: string
  /** 1 Tipo · 2 Rubro · 3 Categoría · 4 Cuenta. */
  nivel: number
  padre: string | null
  imputable: boolean
  tipo: string
  rubroGasto: string | null
  categoriaGasto: string | null
  incluye: string | null
  tableroFabrica: string | null
  tableroLocales: string | null
  usoGastos: UsoGastos | null
}

export const COLUMNAS_PLAN =
  'codigo, nombre, nivel, padre, imputable, tipo, rubro_gasto, categoria_gasto, incluye, tablero_fabrica, tablero_locales, uso_gastos, orden'

export function armarPlan(filas: Omit<Fila, 'orden'>[]): CuentaPlan[] {
  return filas.map(f => ({
    codigo: f.codigo,
    nombre: f.nombre,
    nivel: f.nivel,
    padre: f.padre,
    imputable: f.imputable,
    tipo: f.tipo,
    rubroGasto: f.rubro_gasto,
    categoriaGasto: f.categoria_gasto,
    incluye: f.incluye,
    tableroFabrica: f.tablero_fabrica,
    tableroLocales: f.tablero_locales,
    usoGastos: f.uso_gastos === 'gasto' || f.uso_gastos === 'otro_pago' ? f.uso_gastos : null,
  }))
}

export const ETIQUETA_USO: Record<UsoGastos, string> = {
  gasto: 'Gasto',
  otro_pago: 'No es gasto',
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Cuentas imputables que se eligen en Gastos, en el orden del plan. */
export function cuentasDeGastos(plan: CuentaPlan[]): CuentaPlan[] {
  return plan.filter(c => c.imputable && c.usoGastos != null)
}

/** Nombre de los ancestros (rubro y categoría) de una cuenta, para mostrarla con contexto. */
export function rutaDe(plan: CuentaPlan[], codigo: string): string[] {
  const porCodigo = new Map(plan.map(c => [c.codigo, c]))
  const ruta: string[] = []
  let c = porCodigo.get(codigo)
  while (c?.padre) {
    c = porCodigo.get(c.padre)
    if (c && c.nivel > 1) ruta.unshift(c.nombre)
  }
  return ruta
}

/** Cómo se dice en el día a día lo que el plan nombra de otra forma. */
const SINONIMOS: Record<string, string[]> = {
  luz: ['energia'],
  nafta: ['combustible'],
  gasoil: ['combustible'],
  celular: ['telefonia'],
  telefono: ['telefonia'],
  contador: ['contable'],
  sueldo: ['sueldos'],
}

/**
 * Busca por nombre, código, rubro, categoría y "qué se incluye". Todas las
 * palabras tienen que aparecer. Primero lo que coincide en el nombre.
 */
export function buscarCuentas(cuentas: CuentaPlan[], q: string): CuentaPlan[] {
  const palabras = sinAcentos(q).split(/\s+/).filter(Boolean).map(p => [p, ...(SINONIMOS[p] ?? [])])
  if (palabras.length === 0) return cuentas
  const esta = (texto: string, p: string[]) => p.some(v => texto.includes(v))
  const puntaje = (c: CuentaPlan): number => {
    const nombre = sinAcentos(c.nombre)
    const todo = sinAcentos([c.codigo, c.nombre, c.rubroGasto, c.categoriaGasto, c.incluye].filter(Boolean).join(' '))
    if (!palabras.every(p => esta(todo, p))) return -1
    if (palabras.every(p => esta(nombre, p))) return palabras[0].some(v => nombre.startsWith(v)) ? 3 : 2
    return c.codigo.startsWith(palabras[0][0]) ? 2 : 1
  }
  return cuentas
    .map((c, i) => ({ c, i, p: puntaje(c) }))
    .filter(x => x.p >= 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map(x => x.c)
}
