import { z } from 'zod'
import { aResolucion, RESOLUCION_PASADO, type Resolucion } from './diferencias'
import { cortoBase, esUnidadBase } from './unidades'
import { codigoDevolucion } from './codigos'

// Historial del pedido (B1): lectura del `detalle` jsonb de v_compras_pedido_eventos,
// textos legibles, orden y agrupado. Sin React ni Supabase, como diferencias.ts.
// Chequeo: npx tsx lib/compras/_check_historial.ts

/** Una fila de v_compras_pedido_eventos (todas las columnas de una vista son nullable). */
export interface EventoCrudo {
  id: string | null
  pedido_id: string | null
  tipo: string | null
  fecha: string | null
  persona_id: string | null
  persona: string | null
  detalle: unknown
}

// ---------------------------------------------------------------------------
// 5.1 Lectura del detalle
// ---------------------------------------------------------------------------

// A2b: las líneas de remito traen los kg reales (cantidad_base) y su unidad base.
const KgOpcional = z.coerce.number().nullable().optional().transform(v => v ?? null)
const TextoOpcional = z.string().nullable().optional().transform(v => v ?? null)

const Linea = z.object({
  id: z.string(),
  item_id: TextoOpcional,
  descripcion: z.string(),
  unidad: TextoOpcional,
  cantidad: z.coerce.number(),
  cantidad_base: KgOpcional,
  unidad_base: TextoOpcional,
})
export type Linea = z.infer<typeof Linea>

const Antes = z.object({
  cantidad: z.coerce.number(),
  unidad: TextoOpcional,
  descripcion: z.string(),
  item_id: TextoOpcional,
  cantidad_base: KgOpcional,
})
const LineaCambiada = Linea.extend({ antes: Antes })
export type LineaCambiada = z.infer<typeof LineaCambiada>

const Diff = z.object({
  agregados: z.array(Linea).optional(),
  quitados: z.array(Linea).optional(),
  cambiados: z.array(LineaCambiada).optional(),
})
export type DiffLineas = z.infer<typeof Diff>

const Ref = z.object({ id: z.string().nullable().optional(), nombre: z.string().nullable().optional() })
const CambioTexto = z.object({ de: z.string().nullable().optional(), a: z.string().nullable().optional() })

const DETALLE = {
  creado: z.object({
    origen: z.enum(['manual', 'solicitud']).optional(),
    solicitud_id: z.string().nullable().optional(),
    solicitud_tipo: z.string().nullable().optional(),
    solicitud_fecha: z.string().nullable().optional(),
    lineas: z.array(Linea).optional(),
    backfill: z.boolean().optional(),
  }),
  items_editados: Diff,
  proveedor_cambiado: z.object({ de: Ref, a: Ref }),
  local_cambiado: z.object({ de: Ref.nullable().optional(), a: Ref.nullable().optional() }),
  mensaje: z.object({ accion: z.enum(['generado', 'regenerado']) }),
  enviado: z.object({ mensaje: z.string().nullable().optional(), backfill: z.boolean().optional() }),
  reenviado: z.object({ mensaje: z.string().nullable().optional() }),
  cerrado: z.object({ motivo: z.string().nullable().optional() }),
  reabierto: z.object({ estado_recepcion: z.string().nullable().optional() }),
  remito_creado: z.object({
    remito_id: z.string(),
    secuencia: z.coerce.number(),
    fecha: z.string().nullable().optional(),
    // A2b
    origen: z.string().nullable().optional(),
    numero: z.string().nullable().optional(),
    factura_id: z.string().nullable().optional(),
    factura_numero: z.string().nullable().optional(),
    backfill: z.boolean().optional(),
    lineas: z.array(Linea).optional(),
  }),
  remito_editado: Diff.extend({
    remito_id: z.string(),
    secuencia: z.coerce.number(),
    // A2b
    fecha: CambioTexto.optional(),
    numero: CambioTexto.optional(),
  }),
  remito_eliminado: z.object({
    remito_id: z.string(),
    secuencia: z.coerce.number(),
    motivo: z.string().nullable().optional(),
    // A2b
    fecha: z.string().nullable().optional(),
    numero: z.string().nullable().optional(),
    origen: z.string().nullable().optional(),
    factura_id: z.string().nullable().optional(),
    lineas: z.array(Linea).optional(),
  }),
  factura: z.object({ factura_id: z.string(), numero: z.string().nullable().optional() }),
  factura_anulada: z.object({ factura_id: z.string(), numero: z.string().nullable().optional() }),
  diferencia: z.object({
    resolucion: z.string().nullable().optional(),
    insumo: z.string().nullable().optional(),
    item_id: z.string().nullable().optional(),
    factura_id: z.string().nullable().optional(),
  }),
  // B4: sin montos (los lee cualquiera con Compras).
  devolucion_registrada: z.object({
    devolucion_id: z.string(),
    secuencia: z.coerce.number(),
    motivo: z.string().nullable().optional(),
    devuelve_mercaderia: z.boolean(),
    corrige_precio: z.boolean().optional(),
    repone: z.boolean(),
    nota: z.string().nullable().optional(),
    lineas: z.array(Linea).optional(),
  }),
  devolucion_anulada: z.object({
    devolucion_id: z.string(),
    secuencia: z.coerce.number(),
    motivo: z.string().nullable().optional(),
    motivo_anulacion: z.string().nullable().optional(),
    lineas: z.array(Linea).optional(),
    tenia_nota_credito: z.boolean().optional(),
  }),
  // B4: salen de compras_facturas, solo admin (E16).
  nota_credito: z.object({
    factura_id: z.string(),
    numero: z.string().nullable().optional(),
    total: z.coerce.number().nullable().optional(),
    factura_origen_id: z.string().nullable().optional(),
    devolucion_id: z.string().nullable().optional(),
    secuencia: z.coerce.number().nullable().optional(),
    gasto: z.string().nullable().optional(),
  }),
  nota_credito_anulada: z.object({
    factura_id: z.string(),
    numero: z.string().nullable().optional(),
    total: z.coerce.number().nullable().optional(),
    motivo: z.string().nullable().optional(),
    devolucion_id: z.string().nullable().optional(),
    secuencia: z.coerce.number().nullable().optional(),
  }),
} as const

export type TipoEvento = keyof typeof DETALLE
type Detalles = { [K in TipoEvento]: z.infer<(typeof DETALLE)[K]> }

/** Evento con su detalle validado. `d` es null si el detalle vino con otra forma (se muestra solo la etiqueta). */
export type EventoLeido = {
  [K in TipoEvento]: {
    id: string
    tipo: K
    fecha: string | null
    personaId: string | null
    persona: string | null
    d: Detalles[K] | null
  }
}[TipoEvento] | {
  id: string
  tipo: string
  fecha: string | null
  personaId: string | null
  persona: string | null
  d: null
}

function esTipo(t: string): t is TipoEvento {
  return Object.prototype.hasOwnProperty.call(DETALLE, t)
}

export function leerEvento(e: EventoCrudo): EventoLeido {
  const tipo = e.tipo ?? ''
  const base = { id: e.id ?? '', fecha: e.fecha, personaId: e.persona_id, persona: e.persona }
  if (!esTipo(tipo)) return { ...base, tipo, d: null }
  const r = DETALLE[tipo].safeParse(e.detalle)
  return { ...base, tipo, d: r.success ? r.data : null } as EventoLeido
}

// ---------------------------------------------------------------------------
// 5.2 Textos de líneas
// ---------------------------------------------------------------------------

function numero(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function conUnidad(cantidad: number, unidad: string | null): string {
  return unidad ? `${numero(cantidad)} ${unidad}` : numero(cantidad)
}

export interface ParteDiff {
  tipo: 'cambiado' | 'agregado' | 'quitado'
  itemId: string | null
  /** El insumo, aparte para poder linkearlo: texto = previo + nombre + resto. */
  nombre: string
  previo: string
  resto: string
  texto: string
}

function baseDe(l: { unidad_base: string | null }): string {
  return esUnidadBase(l.unidad_base) ? cortoBase(l.unidad_base) : 'kg'
}

/** ' (33,4 kg)' si la línea trae kg reales; '' si no. */
function kgEntreParentesis(l: Linea): string {
  return l.cantidad_base != null ? ` (${numero(l.cantidad_base)} ${baseDe(l)})` : ''
}

/**
 * '40 → 45 kg', '40 kg → 40 Caja', '' si nada cambió. A2b, con kg reales:
 * '2 Caja · 32,9 → 33,4 kg' (solo kg) o '2 → 3 Caja (33,4 → 49,9 kg)'.
 */
function parteCantidad(l: LineaCambiada): string {
  const base = baseDe(l)
  const kgAntes = l.antes.cantidad_base
  const kgAhora = l.cantidad_base
  const cambioKg = kgAntes !== kgAhora
  const kg = (n: number | null) => (n != null ? numero(n) : 'sin kg')
  let cajas = ''
  if (l.antes.unidad !== l.unidad) cajas = `${conUnidad(l.antes.cantidad, l.antes.unidad)} → ${conUnidad(l.cantidad, l.unidad)}`
  else if (l.antes.cantidad !== l.cantidad) cajas = `${numero(l.antes.cantidad)} → ${conUnidad(l.cantidad, l.unidad)}`
  if (!cajas) return cambioKg ? `${conUnidad(l.cantidad, l.unidad)} · ${kg(kgAntes)} → ${kg(kgAhora)} ${base}` : ''
  if (cambioKg) return `${cajas} (${kg(kgAntes)} → ${kg(kgAhora)} ${base})`
  return kgAhora != null ? `${cajas} (${numero(kgAhora)} ${base})` : cajas
}

function parte(tipo: ParteDiff['tipo'], l: Linea, previo: string, resto: string): ParteDiff {
  return { tipo, itemId: l.item_id, nombre: l.descripcion, previo, resto, texto: `${previo}${l.descripcion}${resto}` }
}

export function partesDiff(diff: DiffLineas): ParteDiff[] {
  const partes: ParteDiff[] = []
  for (const l of diff.cambiados ?? []) {
    const cant = parteCantidad(l)
    // Cambiar el insumo se trata como cambio de descripción.
    if (l.antes.descripcion !== l.descripcion || l.antes.item_id !== l.item_id) {
      const previo = l.antes.descripcion !== l.descripcion ? `${l.antes.descripcion} → ` : ''
      partes.push(parte('cambiado', l, previo, cant ? `: ${cant}` : ''))
    } else {
      partes.push(parte('cambiado', l, '', cant ? ` ${cant}` : ''))
    }
  }
  for (const l of diff.agregados ?? []) partes.push(parte('agregado', l, 'agregó ', ` ${conUnidad(l.cantidad, l.unidad)}${kgEntreParentesis(l)}`))
  for (const l of diff.quitados ?? []) partes.push(parte('quitado', l, 'quitó ', ` ${conUnidad(l.cantidad, l.unidad)}${kgEntreParentesis(l)}`))
  return partes
}

/** Las líneas de un remito, para listarlas ("Queso Barra 2 Caja (33,4 kg)"). */
export function partesLineas(lineas: Linea[]): ParteDiff[] {
  return lineas.map(l => parte('agregado', l, '', ` ${conUnidad(l.cantidad, l.unidad)}${kgEntreParentesis(l)}`))
}

/** dd/mm de una fecha AAAA-MM-DD (sin pasar por zona horaria). */
function diaMes(f: string | null | undefined): string {
  const m = f?.match(/^\d{4}-(\d{2})-(\d{2})/)
  return m ? `${m[2]}/${m[1]}` : f ?? '—'
}

/** A2b: lo que cambió de la cabecera del remito ("Fecha: 03/10 → 04/10"). */
export function textosCabeceraRemito(d: { fecha?: { de?: string | null; a?: string | null }; numero?: { de?: string | null; a?: string | null } }): string[] {
  const res: string[] = []
  if (d.fecha) res.push(`Fecha: ${diaMes(d.fecha.de)} → ${diaMes(d.fecha.a)}`)
  if (d.numero) res.push(`N° del proveedor: ${d.numero.de || '—'} → ${d.numero.a || '—'}`)
  return res
}

export function textoDiff(diff: DiffLineas): string {
  return `Editó ítems: ${partesDiff(diff).map(p => p.texto).join('; ')}`
}

export function diffVacio(diff: DiffLineas): boolean {
  return !diff.agregados?.length && !diff.quitados?.length && !diff.cambiados?.length
}

// ---------------------------------------------------------------------------
// 5.3 Etiquetas
// ---------------------------------------------------------------------------

const ETIQUETA: Record<string, string> = {
  creado: 'Pedido creado',
  items_editados: 'Editó ítems',
  proveedor_cambiado: 'Cambió el proveedor',
  local_cambiado: 'Cambió el local de facturación',
  mensaje: 'Generó el mensaje',
  enviado: 'Enviado al proveedor',
  reenviado: 'Reenviado al proveedor',
  cerrado: 'Cerrado a mano',
  reabierto: 'Reabierto',
  remito_creado: 'Llegó un remito',
  remito_editado: 'Editó el remito',
  remito_eliminado: 'Eliminó el remito',
  factura: 'Factura confirmada',
  factura_anulada: 'Factura anulada',
  diferencia: 'Diferencia con la factura resuelta',
  devolucion_registrada: 'Devolvió mercadería al proveedor',
  devolucion_anulada: 'Anuló una devolución',
  nota_credito: 'Nota de crédito',
  nota_credito_anulada: 'Anuló la nota de crédito',
}

export function etiquetaEvento(e: EventoLeido): string {
  if (e.tipo === 'devolucion_registrada' && e.d && !e.d.devuelve_mercaderia) {
    return e.d.corrige_precio ? 'Registró una corrección de precio' : 'Registró un reclamo a la factura'
  }
  if (e.tipo === 'creado' && e.d?.origen === 'solicitud') return 'Creado desde una solicitud'
  if (e.tipo === 'local_cambiado' && e.d && !e.d.de) return 'Asignó el local de facturación'
  if (e.tipo === 'mensaje' && e.d?.accion === 'regenerado') return 'Regeneró el mensaje'
  return ETIQUETA[e.tipo] ?? e.tipo
}

/** 'Pedido base del 03/10' / 'Solicitud complementaria' (backfill sin fecha). */
export function textoSolicitud(tipo: string | null | undefined, fecha: string | null | undefined): string {
  const nombre = tipo === 'base' ? 'Pedido base' : 'Solicitud complementaria'
  if (!fecha) return nombre
  const f = new Date(fecha)
  if (Number.isNaN(f.getTime())) return nombre
  const dd = f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
  return `${nombre} del ${dd}`
}

export function textoCantidadItems(n: number): string {
  return `con ${n} ítem${n === 1 ? '' : 's'}`
}

/** Para la entrada "diferencia": insumo y resolución en pasado. */
export function leerDiferencia(d: Detalles['diferencia']): { resolucion: Resolucion; insumo: string; texto: string } {
  const resolucion = aResolucion(d.resolucion ?? null)
  const insumo = d.insumo ?? ''
  return { resolucion, insumo, texto: RESOLUCION_PASADO[resolucion] }
}

/** B4: cómo quedó la NC con el gasto, en el historial. */
export const TEXTO_NC_GASTO: Record<string, string> = {
  descontado: 'descontada del gasto',
  cancelo_gasto: 'canceló el gasto',
  a_favor: 'a favor (el gasto ya estaba pagado)',
  sin_gasto: 'la factura no tenía gasto',
}

function pesos(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

/**
 * B4: lo que va al lado de la etiqueta de una devolución o una NC. `codigo` es
 * el D-… (null si el evento no lo trae) y `partes` el resto, ya en texto:
 *   'D-0037-01' · 'Mercadería en mal estado' · 'El proveedor repone'
 *   'D-0037-01' · 'Motivo: se cargó por error'
 *   'N° 0001-00000123' · '$ 50.517,50' · 'descontada del gasto'
 */
export function textosDevolucion(e: EventoLeido, numeroPedido: number): { codigo: string | null; partes: string[] } {
  switch (e.tipo) {
    case 'devolucion_registrada': {
      if (!e.d) return { codigo: null, partes: [] }
      const partes = [e.d.motivo ?? '']
      if (e.d.devuelve_mercaderia) partes.push(e.d.repone ? 'El proveedor repone' : 'No repone')
      return { codigo: codigoDevolucion(numeroPedido, e.d.secuencia), partes: partes.filter(Boolean) }
    }
    case 'devolucion_anulada':
      if (!e.d) return { codigo: null, partes: [] }
      return {
        codigo: codigoDevolucion(numeroPedido, e.d.secuencia),
        partes: [
          e.d.motivo_anulacion ? `Motivo: ${e.d.motivo_anulacion}` : '',
          e.d.tenia_nota_credito ? 'también se anuló su nota de crédito' : '',
        ].filter(Boolean),
      }
    case 'nota_credito':
    case 'nota_credito_anulada': {
      if (!e.d) return { codigo: null, partes: [] }
      const partes = [`N° ${e.d.numero ?? '—'}`]
      if (e.d.total != null) partes.push(pesos(e.d.total))
      if (e.tipo === 'nota_credito' && e.d.gasto && TEXTO_NC_GASTO[e.d.gasto]) partes.push(TEXTO_NC_GASTO[e.d.gasto])
      if (e.tipo === 'nota_credito_anulada' && e.d.motivo) partes.push(`Motivo: ${e.d.motivo}`)
      return { codigo: e.d.secuencia != null ? codigoDevolucion(numeroPedido, e.d.secuencia) : null, partes }
    }
    default:
      return { codigo: null, partes: [] }
  }
}

// ---------------------------------------------------------------------------
// 5.4 Orden
// ---------------------------------------------------------------------------

export const ORDEN_EVENTO = [
  'creado', 'items_editados', 'proveedor_cambiado', 'local_cambiado', 'mensaje', 'enviado', 'reenviado',
  'remito_creado', 'remito_editado', 'remito_eliminado', 'factura',
  'devolucion_registrada', 'nota_credito', 'diferencia', 'nota_credito_anulada', 'devolucion_anulada',
  'factura_anulada', 'cerrado', 'reabierto',
]

/**
 * B4: la NC que se confirma en la misma transacción que su devolución lleva
 * now() (el inicio), y el evento de la devolución, clock_timestamp(): la NC
 * quedaría antes. Si están a menos de 5 s, se ordena con la devolución.
 */
const VENTANA_NC_MS = 5_000

function fechaDeOrden(e: EventoLeido, registradas: Map<string, string | null>): string | null {
  if (e.tipo === 'nota_credito' && e.d?.devolucion_id && e.fecha) {
    const dev = registradas.get(e.d.devolucion_id)
    const delta = dev ? Date.parse(dev) - Date.parse(e.fecha) : NaN
    if (dev && delta > 0 && delta <= VENTANA_NC_MS) return dev
  }
  return e.fecha
}

export function ordenarEventos<T extends { fecha: string | null; tipo: string }>(eventos: T[]): T[] {
  return [...eventos].sort((a, b) => {
    if (a.fecha == null || b.fecha == null) return a.fecha == null ? (b.fecha == null ? 0 : 1) : -1
    const ta = Date.parse(a.fecha)
    const tb = Date.parse(b.fecha)
    if (ta !== tb) return ta - tb
    return ORDEN_EVENTO.indexOf(a.tipo) - ORDEN_EVENTO.indexOf(b.tipo)
  })
}

// ---------------------------------------------------------------------------
// 5.5 Agrupado
// ---------------------------------------------------------------------------

const AGRUPABLES = new Set(['items_editados', 'proveedor_cambiado', 'local_cambiado', 'mensaje'])
const VENTANA_MS = 5 * 60 * 1000

type EstadoLinea =
  | { estado: 'agregado'; linea: Linea }
  | { estado: 'cambiado'; linea: LineaCambiada }
  | { estado: 'quitado'; linea: Linea }

function igualAntes(l: LineaCambiada): boolean {
  return l.antes.cantidad === l.cantidad && l.antes.unidad === l.unidad
    && l.antes.descripcion === l.descripcion && l.antes.item_id === l.item_id
    && l.antes.cantidad_base === l.cantidad_base
}

/** Combina varios diffs seguidos por id de línea (el resultado es lo que cambió entre el primero y el último). */
export function combinarDiffs(diffs: DiffLineas[]): DiffLineas {
  const lineas = new Map<string, EstadoLinea>()
  for (const diff of diffs) {
    for (const l of diff.agregados ?? []) lineas.set(l.id, { estado: 'agregado', linea: l })
    for (const l of diff.cambiados ?? []) {
      const prev = lineas.get(l.id)
      if (prev?.estado === 'agregado') {
        lineas.set(l.id, {
          estado: 'agregado',
          linea: {
            id: l.id, item_id: l.item_id, descripcion: l.descripcion, unidad: l.unidad, cantidad: l.cantidad,
            cantidad_base: l.cantidad_base, unidad_base: l.unidad_base,
          },
        })
      } else if (prev?.estado === 'cambiado') {
        lineas.set(l.id, { estado: 'cambiado', linea: { ...l, antes: prev.linea.antes } })
      } else {
        lineas.set(l.id, { estado: 'cambiado', linea: l })
      }
    }
    for (const l of diff.quitados ?? []) {
      const prev = lineas.get(l.id)
      if (prev?.estado === 'agregado') lineas.delete(l.id)
      else if (prev?.estado === 'cambiado') lineas.set(l.id, { estado: 'quitado', linea: { id: l.id, unidad_base: prev.linea.unidad_base, ...prev.linea.antes } })
      else lineas.set(l.id, { estado: 'quitado', linea: l })
    }
  }
  const agregados: Linea[] = []
  const quitados: Linea[] = []
  const cambiados: LineaCambiada[] = []
  for (const s of lineas.values()) {
    if (s.estado === 'agregado') agregados.push(s.linea)
    else if (s.estado === 'quitado') quitados.push(s.linea)
    else if (!igualAntes(s.linea)) cambiados.push(s.linea)
  }
  const res: DiffLineas = {}
  if (agregados.length) res.agregados = agregados
  if (quitados.length) res.quitados = quitados
  if (cambiados.length) res.cambiados = cambiados
  return res
}

export interface EntradaHistorial {
  key: string
  /** El tipo de los sub-eventos si son todos iguales; 'grupo' si no. */
  tipo: string
  etiqueta: string
  persona: string | null
  desde: string | null
  hasta: string | null
  /** Con los items_editados del grupo ya combinados en uno. */
  eventos: EventoLeido[]
}

function cerrarGrupo(grupo: EventoLeido[]): EntradaHistorial | null {
  // Los items_editados se combinan en uno, en el lugar del primero.
  const diffs = grupo.filter(e => e.tipo === 'items_editados')
  let eventos = grupo
  if (diffs.length > 0) {
    const legibles = diffs.every(e => e.d != null)
    const combinado = legibles ? combinarDiffs(diffs.map(e => e.d as DiffLineas)) : null
    const primero = diffs[0]
    eventos = []
    for (const e of grupo) {
      if (e.tipo !== 'items_editados') eventos.push(e)
      else if (e === primero) {
        if (combinado == null) eventos.push(...diffs)
        else if (!diffVacio(combinado)) eventos.push({ ...primero, d: combinado } as EventoLeido)
      }
    }
  }
  if (eventos.length === 0) return null
  const tipos = new Set(eventos.map(e => e.tipo))
  const tipo = tipos.size === 1 ? eventos[0].tipo : 'grupo'
  return {
    key: `${grupo[0].tipo}-${grupo[0].id}`,
    tipo,
    etiqueta: tipo === 'grupo' ? 'Editó el pedido' : etiquetaEvento(eventos[0]),
    persona: grupo[0].persona,
    desde: grupo[0].fecha,
    hasta: grupo[grupo.length - 1].fecha,
    eventos,
  }
}

/**
 * Editar los ítems borra el mensaje, así que la base registra la siguiente
 * generación como 'generado'. Si el pedido ya tuvo un mensaje antes, para quien
 * lee es "Regeneró".
 */
function marcarRegenerados(eventos: EventoLeido[]): EventoLeido[] {
  let huboMensaje = false
  return eventos.map(e => {
    if (e.tipo !== 'mensaje') return e
    const regenerado = huboMensaje && e.d?.accion === 'generado'
    huboMensaje = true
    return regenerado ? ({ ...e, d: { accion: 'regenerado' } } as EventoLeido) : e
  })
}

/**
 * Ordena y agrupa: las ediciones (ítems, proveedor, local, mensaje) seguidas de
 * la misma persona dentro de los 5 minutos del primero van en una entrada.
 * Cualquier otro evento en el medio corta el grupo.
 */
export function agruparEventos(crudos: EventoCrudo[]): EntradaHistorial[] {
  const leidos = crudos.map(leerEvento)
  const registradas = new Map<string, string | null>()
  for (const e of leidos) if (e.tipo === 'devolucion_registrada' && e.d) registradas.set(e.d.devolucion_id, e.fecha)
  const ordenados = ordenarEventos(leidos.map(e => ({ e, fecha: fechaDeOrden(e, registradas), tipo: e.tipo }))).map(x => x.e)
  const eventos = marcarRegenerados(ordenados)
  const entradas: EntradaHistorial[] = []
  let grupo: EventoLeido[] = []

  const cerrar = () => {
    if (grupo.length) {
      const entrada = cerrarGrupo(grupo)
      if (entrada) entradas.push(entrada)
    }
    grupo = []
  }

  for (const e of eventos) {
    if (!AGRUPABLES.has(e.tipo)) {
      cerrar()
      entradas.push({
        key: `${e.tipo}-${e.id}`, tipo: e.tipo, etiqueta: etiquetaEvento(e),
        persona: e.persona, desde: e.fecha, hasta: e.fecha, eventos: [e],
      })
      continue
    }
    const primero = grupo[0]
    const sigue = primero != null
      && e.personaId != null && e.personaId === primero.personaId
      && e.fecha != null && primero.fecha != null
      && Date.parse(e.fecha) - Date.parse(primero.fecha) <= VENTANA_MS
    if (!sigue) cerrar()
    grupo.push(e)
  }
  cerrar()
  return entradas
}
