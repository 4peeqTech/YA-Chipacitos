import { esRolConModulos } from '@/lib/modulos'
import { ESTADOS } from '@/lib/estados'
import type { Area, Bloque, Novedad, SeccionManual } from './tipos'
import { local } from './secciones/local'
import { deposito } from './secciones/deposito'
import { mayorista } from './secciones/mayorista'
import { fabrica } from './secciones/fabrica'
import { fabricaConteos } from './secciones/fabrica-conteos'
import { comprasPedidos } from './secciones/compras-pedidos'
import { comprasRemitos } from './secciones/compras-remitos'
import { comprasFacturas } from './secciones/compras-facturas'
import { comprasDevoluciones } from './secciones/compras-devoluciones'
import { comprasStock } from './secciones/compras-stock'
import { comprasSolicitudes } from './secciones/compras-solicitudes'
import { comprasPedidoBase } from './secciones/compras-pedido-base'
import { admin } from './secciones/admin'
import { colaborador, MODULO_AYUDA } from './secciones/colaborador'

export { MODULO_AYUDA }

/** Orden de aparición en el índice. */
export const SECCIONES: SeccionManual[] = [
  local, deposito, mayorista,
  comprasPedidos, comprasRemitos, comprasFacturas, comprasDevoluciones, comprasStock, comprasSolicitudes, comprasPedidoBase,
  fabrica, fabricaConteos,
  admin, colaborador,
]

export const AREAS: { key: Area; titulo: string }[] = [
  { key: 'dia-a-dia', titulo: 'Pedidos del día a día' },
  { key: 'compras', titulo: 'Compras' },
  { key: 'fabrica', titulo: 'Fábrica' },
  { key: 'administracion', titulo: 'Administración' },
]

export interface Lector {
  rol: string
  modulos: string[]
}

export function puedeVer(seccion: SeccionManual, { rol, modulos }: Lector): boolean {
  if (rol === 'admin') return true
  if (seccion.roles.includes(rol as SeccionManual['roles'][number])) return true
  if (esRolConModulos(rol)) {
    if (seccion.roles.includes('colaborador')) return true
    return seccion.modulos.some(m => modulos.includes(m))
  }
  return false
}

export function seccionesVisibles(lector: Lector): SeccionManual[] {
  return SECCIONES.filter(s => puedeVer(s, lector))
}

export function buscarSeccion(slug: string): SeccionManual | undefined {
  return SECCIONES.find(s => s.slug === slug)
}

/** Texto plano sin el marcado **negrita** / `código`. */
export function textoPlano(texto: string): string {
  return texto.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1')
}

function textoDeBloque(b: Bloque): string[] {
  switch (b.tipo) {
    case 'parrafo':
    case 'tip':
    case 'alerta':
      return [b.texto]
    case 'pasos':
      return b.pasos.map(p => p.texto)
    case 'lista':
      return [b.titulo ?? '', ...b.items]
    case 'estados': {
      const dominio = ESTADOS[b.dominio] as Record<string, { label: string }>
      return b.estados.map(e => `${dominio[e.estado]?.label ?? e.estado}: ${e.texto}`)
    }
    case 'queHagoSi':
      return b.casos.flatMap(c => [c.situacion, c.camino])
    case 'modulosHabilitados':
      return []
  }
}

/** Una entrada por apartado: lo que recorre la búsqueda del índice (en cliente). */
export interface EntradaBusqueda {
  slug: string
  seccion: string
  ancla: string
  titulo: string
  texto: string
}

export function indiceDeBusqueda(secciones: SeccionManual[]): EntradaBusqueda[] {
  return secciones.flatMap(s =>
    s.apartados.map(a => ({
      slug: s.slug,
      seccion: s.titulo,
      ancla: a.ancla,
      titulo: a.titulo,
      texto: textoPlano(a.bloques.flatMap(textoDeBloque).join(' ')),
    })),
  )
}

export function novedadesRecientes(secciones: SeccionManual[], cantidad = 3): (Novedad & { slug: string; seccion: string })[] {
  return secciones
    .flatMap(s => (s.novedades ?? []).map(n => ({ ...n, slug: s.slug, seccion: s.titulo })))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, cantidad)
}
