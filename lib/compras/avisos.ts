// Avisos de compras (B5): textos, destinatarios, resumen de una corrida y la
// config. Puro: lo usan el runner del servidor (avisosServidor.ts), la pantalla
// Compras › Avisos y las páginas que leen pedidos.dias_demora.
// Chequeo: `npx tsx lib/compras/_check_avisos.ts`.

import { codigoPedido } from './codigos'
import { DIAS_DEMORA } from './estadoPedido'
import { rutaDe, rutaPedidos, rutaPedidosAlerta, rutaStockBajo } from './rutas'

export type TipoAviso = 'remito_listo' | 'pedido_demorado' | 'diferencias' | 'nc_pendiente' | 'stock_bajo'
export const TIPOS_AVISO: TipoAviso[] = ['remito_listo', 'pedido_demorado', 'diferencias', 'nc_pendiente', 'stock_bajo']

/** Una fila de compras_avisos_tomar: lo que hay que avisar. */
export interface FilaAviso {
  tipo: TipoAviso
  entidad_id: string
  pedido_id: string | null
  numero: number | null
  codigo: string | null
  proveedor_nombre: string | null
  insumo_nombre: string | null
  unidad: string | null
  cantidad: number | null
  minimo: number | null
  dias: number | null
  pendientes: number | null
  repetido: boolean
}

export interface MensajeAviso {
  tipo: TipoAviso
  title: string
  body: string
  url: string
  /** Fijo por tipo: en el celular, el de mañana pisa al de hoy. */
  tag: string
  /** Cuántas entidades cubre (1 = lleva a la entidad; más = a la lista filtrada). */
  cantidad: number
}

const MAX_CODIGOS = 5

const ICONO: Record<TipoAviso, string> = {
  remito_listo: '📦',
  pedido_demorado: '🚚',
  diferencias: '⚖️',
  nc_pendiente: '🧾',
  stock_bajo: '📉',
}

/** Sustantivo de cada tipo, para los títulos agrupados y el resumen. */
const NOMBRE: Record<TipoAviso, [string, string]> = {
  remito_listo: ['pedido listo para facturar', 'pedidos listos para facturar'],
  pedido_demorado: ['pedido demorado', 'pedidos demorados'],
  diferencias: ['pedido con diferencias', 'pedidos con diferencias'],
  nc_pendiente: ['devolución espera su NC', 'devoluciones esperan su NC'],
  stock_bajo: ['insumo bajo el mínimo', 'insumos bajo el mínimo'],
}

function plural(n: number, [uno, varios]: [string, string]): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** "a", "a y b", "a, b y c". */
export function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Hasta 5 nombres y "y N más". */
export function listaCorta(partes: string[]): string {
  if (partes.length <= MAX_CODIGOS) return enumerar(partes)
  return `${partes.slice(0, MAX_CODIGOS).join(', ')} y ${partes.length - MAX_CODIGOS} más`
}

function numeroAr(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function hace(dias: number | null): string {
  const d = dias ?? 0
  return d === 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`
}

function codigoDe(f: FilaAviso): string {
  if (f.tipo === 'stock_bajo') return f.insumo_nombre ?? 'Insumo'
  if (f.tipo === 'nc_pendiente') return f.codigo ?? 'Devolución'
  return f.numero != null ? codigoPedido(f.numero) : 'Pedido'
}

function uno(f: FilaAviso): Omit<MensajeAviso, 'tipo' | 'tag' | 'cantidad'> {
  const prov = f.proveedor_nombre ?? 'el proveedor'
  const cod = codigoDe(f)
  const pedido = f.pedido_id ? rutaDe({ tipo: 'pedido', id: f.pedido_id }) : rutaPedidos('activos')
  switch (f.tipo) {
    case 'remito_listo':
      return { title: 'Listo para facturar', body: `${cod} de ${prov}: llegó todo. Cargá la factura cuando llegue.`, url: pedido }
    case 'pedido_demorado':
      return { title: 'Pedido demorado', body: `${cod} a ${prov} se envió ${hace(f.dias)} y no llegó completo.`, url: pedido }
    case 'diferencias': {
      const n = f.pendientes ?? 1
      return {
        title: 'Diferencias sin resolver',
        body: `${cod} (${prov}): ${plural(n, ['diferencia', 'diferencias'])} con la factura ${hace(f.dias)}.`,
        url: pedido,
      }
    }
    case 'nc_pendiente':
      return {
        title: 'Falta la nota de crédito',
        body: `${cod} (${prov}) la espera ${hace(f.dias)}.`,
        url: f.pedido_id ? rutaDe({ tipo: 'devolucion', id: f.entidad_id, pedidoId: f.pedido_id }) : rutaPedidosAlerta('nc'),
      }
    case 'stock_bajo': {
      const u = f.unidad ? ` ${f.unidad}` : ''
      return {
        title: 'Stock bajo el mínimo',
        body: `${cod}: ${numeroAr(f.cantidad ?? 0)}${u} (mínimo ${numeroAr(f.minimo ?? 0)}). No hay pedido abierto.`,
        url: rutaDe({ tipo: 'insumo', id: f.entidad_id }),
      }
    }
  }
}

const URL_VARIOS: Record<TipoAviso, () => string> = {
  remito_listo: () => rutaPedidos('por_facturar'),
  pedido_demorado: () => rutaPedidosAlerta('demorados'),
  diferencias: () => rutaPedidosAlerta('diferencias'),
  nc_pendiente: () => rutaPedidosAlerta('nc'),
  stock_bajo: () => rutaStockBajo(),
}

/** Un mensaje por tipo: uno solo lleva a su entidad; varios, a la lista filtrada. */
export function armarAvisos(filas: FilaAviso[]): MensajeAviso[] {
  const mensajes: MensajeAviso[] = []
  for (const tipo of TIPOS_AVISO) {
    const propias = filas.filter(f => f.tipo === tipo)
    if (propias.length === 0) continue
    // "(sigue)" solo si todo lo que avisa ya se había avisado.
    const sigue = propias.every(f => f.repetido) ? ' (sigue)' : ''
    const tag = `compras_${tipo}`
    if (propias.length === 1) {
      const m = uno(propias[0])
      mensajes.push({ tipo, tag, cantidad: 1, ...m, title: `${ICONO[tipo]} ${m.title}${sigue}` })
    } else {
      mensajes.push({
        tipo, tag, cantidad: propias.length,
        title: `${ICONO[tipo]} ${plural(propias.length, NOMBRE[tipo])}${sigue}`,
        body: listaCorta(propias.map(codigoDe)),
        url: URL_VARIOS[tipo](),
      })
    }
  }
  return mensajes
}

// ---------------------------------------------------------------------------
// Destinatarios (§4.2, E9). Fijos en el código; nunca los elige el cliente.
// ---------------------------------------------------------------------------

export interface PerfilAviso {
  id: string
  rol: string | null
  modulos_permitidos: string[] | null
}

const MODULOS_DE: Record<TipoAviso, string[]> = {
  remito_listo: [],
  diferencias: [],
  nc_pendiente: [],
  pedido_demorado: ['compras-pedidos'],
  stock_bajo: ['compras-pedidos', 'compras-stock'],
}

/** Texto de "Lo reciben" en Compras › Avisos (sale de la misma tabla). */
export const RECIBEN: Record<TipoAviso, string> = {
  remito_listo: 'Administradores',
  diferencias: 'Administradores',
  nc_pendiente: 'Administradores',
  pedido_demorado: 'Administradores y quienes tienen Pedidos',
  stock_bajo: 'Administradores y quienes tienen Pedidos o Stock',
}

/** Los perfiles ya vienen activos (la consulta filtra estado = 'activo'). */
export function destinatariosDe(tipo: TipoAviso, perfiles: PerfilAviso[], excluir?: string): string[] {
  const modulos = MODULOS_DE[tipo]
  return perfiles
    .filter(p => p.id !== excluir)
    .filter(p => p.rol === 'admin' || (p.modulos_permitidos ?? []).some(m => modulos.includes(m)))
    .map(p => p.id)
}

// ---------------------------------------------------------------------------
// Resumen de una corrida
// ---------------------------------------------------------------------------

export interface ResultadoTipo {
  /** Entidades que tomó la corrida (nuevas, otra huella o repetidas). */
  candidatos: number
  /** Las que efectivamente se avisaron (0 si no había a quién). */
  avisados: number
  destinatarios: number
}

export type ResultadoCorrida = Partial<Record<TipoAviso, ResultadoTipo>>

export interface ResumenCorrida {
  origen: 'cron' | 'manual' | 'remito'
  resultado: ResultadoCorrida
  error: string | null
  texto: string
}

/** El toast de "Revisar ahora" y la línea de log del cron. */
export function resumenCorrida(resultado: ResultadoCorrida): string {
  const partes = TIPOS_AVISO
    .map(t => ({ t, n: resultado[t]?.candidatos ?? 0 }))
    .filter(x => x.n > 0)
    .map(x => plural(x.n, NOMBRE[x.t]))
  if (partes.length === 0) return 'No había nada nuevo para avisar'
  return `Se avisaron ${enumerar(partes)}`
}

export function totalAvisados(resultado: ResultadoCorrida): number {
  return TIPOS_AVISO.reduce((s, t) => s + (resultado[t]?.candidatos ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Config (compras_config) con defaults (§3.1)
// ---------------------------------------------------------------------------

export interface ConfigAvisos {
  diasDemora: number
  repetirDias: number
  activo: Record<TipoAviso, boolean>
  diasDiferencias: number
  diasNc: number
}

export const CONFIG_AVISOS_DEFAULT: ConfigAvisos = {
  diasDemora: DIAS_DEMORA,
  repetirDias: 0,
  diasDiferencias: 3,
  diasNc: 7,
  activo: { remito_listo: true, pedido_demorado: true, diferencias: true, nc_pendiente: true, stock_bajo: true },
}

export const CLAVE = {
  diasDemora: 'pedidos.dias_demora',
  repetirDias: 'avisos.repetir_dias',
  diasDiferencias: 'avisos.diferencias.dias',
  diasNc: 'avisos.nc_pendiente.dias',
  activo: (t: TipoAviso) => `avisos.${t}.activo`,
} as const

export const CLAVES_AVISOS: string[] = [
  CLAVE.diasDemora, CLAVE.repetirDias, CLAVE.diasDiferencias, CLAVE.diasNc, ...TIPOS_AVISO.map(CLAVE.activo),
]

/** Rangos válidos (los mismos que valida la server action). */
export const RANGO = {
  dias: { min: 1, max: 60 },
  repetir: { min: 0, max: 30 },
} as const

function entero(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isInteger(n) && n >= min && n <= max ? n : def
}

function booleano(v: unknown, def: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return def
}

/** De filas { clave, valor } de compras_config a un objeto tipado; lo inválido o faltante cae en el default. */
export function leerConfigAvisos(filas: { clave: string; valor: unknown }[]): ConfigAvisos {
  const m = new Map(filas.map(f => [f.clave, f.valor]))
  const d = CONFIG_AVISOS_DEFAULT
  return {
    diasDemora: entero(m.get(CLAVE.diasDemora), RANGO.dias.min, RANGO.dias.max, d.diasDemora),
    repetirDias: entero(m.get(CLAVE.repetirDias), RANGO.repetir.min, RANGO.repetir.max, d.repetirDias),
    diasDiferencias: entero(m.get(CLAVE.diasDiferencias), RANGO.dias.min, RANGO.dias.max, d.diasDiferencias),
    diasNc: entero(m.get(CLAVE.diasNc), RANGO.dias.min, RANGO.dias.max, d.diasNc),
    activo: Object.fromEntries(TIPOS_AVISO.map(t => [t, booleano(m.get(CLAVE.activo(t)), d.activo[t])])) as Record<TipoAviso, boolean>,
  }
}

/** La config como filas de compras_config, para comparar y guardar. */
export function configAFilas(c: ConfigAvisos): { clave: string; valor: number | boolean }[] {
  return [
    { clave: CLAVE.diasDemora, valor: c.diasDemora },
    { clave: CLAVE.repetirDias, valor: c.repetirDias },
    { clave: CLAVE.diasDiferencias, valor: c.diasDiferencias },
    { clave: CLAVE.diasNc, valor: c.diasNc },
    ...TIPOS_AVISO.map(t => ({ clave: CLAVE.activo(t), valor: c.activo[t] })),
  ]
}
