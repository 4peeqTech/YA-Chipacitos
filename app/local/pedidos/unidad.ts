import type { Producto } from '@/lib/types'

// Misma regla que el Catálogo del mayorista (CatalogoMayorista.unidadVisible):
// se oculta la genérica "Unidad" y la que ya dice el nombre ("MASA CLÁSICO Kg.").
export function unidadVisible(p: Pick<Producto, 'nombre' | 'unidad'>): string | null {
  const u = p.unidad?.trim()
  if (!u || u.toLowerCase() === 'unidad') return null
  return p.nombre.toLowerCase().includes(u.toLowerCase().replace(/\.$/, '')) ? null : u
}
