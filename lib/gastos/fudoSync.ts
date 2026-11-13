// Sincronización de gastos de Fudo → tabla gastos (Gastos F3).
//
// SOLO LECTURA DE FUDO: acá se pide un token y se hacen GET. Nunca se crea,
// edita, anula ni paga nada en Fudo. Lo leído se normaliza y se manda a la base
// (gastos_fudo_aplicar), que concilia contra lo que hay con los gastos
// bloqueados. Solo corre con GASTOS_FUDO_SYNC=on (local y preview de qa).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { fudoGet, getFudoCredentials, getFudoToken, normalizeJsonApi, olvidarFudoToken } from '@/lib/fudo'

type Cliente = SupabaseClient<Database>

export type OrigenSync = 'pantalla' | 'boton' | 'cron' | 'script'

/** Lo que se le manda a gastos_fudo_aplicar por cada gasto de Fudo. */
export interface ItemFudo {
  fudo_id: string
  fecha: string
  monto: number
  descripcion: string | null
  categoria: string | null
  proveedor: string | null
  estado: string
  cancelado: boolean
  vencimiento: string | null
  /** La forma con la que se muestra el gasto: la del primer pago, o Cta. Cte. */
  forma: string
  /** Sin los de Cta. Cte. (son deuda, no pago) ni los cancelados. */
  pagos: { id: string; fecha: string; monto: number; forma: string }[]
}

export function sincronizacionActiva(): boolean {
  return process.env.GASTOS_FUDO_SYNC === 'on'
}

// ---------------------------------------------------------------------------
// Normalización (pura).
// ---------------------------------------------------------------------------

const CTA_CTE = /cta\.?\s*cte|cuenta\s*corriente/i

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const nombre = (v: unknown) => texto((v as { name?: unknown } | null | undefined)?.name)
const numero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** Un date (YYYY-MM-DD) tal cual; un timestamp, a su día en Argentina. */
export function fechaFudo(v: unknown): string | null {
  const s = texto(v)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d)
}

type Crudo = Record<string, unknown>

/** Un gasto de /expenses (ya pasado por normalizeJsonApi) → ItemFudo. */
export function normalizarGastoFudo(r: Crudo): ItemFudo | null {
  const id = r.id == null ? '' : String(r.id)
  if (!id) return null
  const monto = numero(r.amount)
  const vigentes = (Array.isArray(r.payments) ? (r.payments as Crudo[]) : []).filter(p => !p.canceled)
  const hayCtaCte = vigentes.some(p => CTA_CTE.test(nombre(p.paymentMethod) ?? ''))
  const pagos = vigentes
    .filter(p => !CTA_CTE.test(nombre(p.paymentMethod) ?? ''))
    .map(p => ({
      id: String(p.id ?? ''),
      fecha: fechaFudo(p.paidAt ?? p.paid_at ?? r.paymentDate ?? r.date) ?? '',
      monto: numero(p.amount),
      forma: nombre(p.paymentMethod) ?? 'Fudo',
    }))
    .filter(p => p.id && p.monto > 0)
  // Pagado en Fudo sin el detalle del pago: un pago por el total.
  if (r.status === 'PAID' && pagos.length === 0 && !hayCtaCte && monto > 0) {
    pagos.push({ id: `gasto-${id}`, fecha: fechaFudo(r.paymentDate ?? r.date) ?? '', monto, forma: 'Fudo' })
  }
  return {
    fudo_id: id,
    fecha: fechaFudo(r.date) ?? '',
    monto,
    descripcion: texto(r.description),
    categoria: nombre(r.expenseCategory),
    proveedor: nombre(r.provider),
    estado: texto(r.status) ?? '',
    cancelado: r.canceled === true,
    vencimiento: fechaFudo(r.dueDate),
    forma: pagos[0]?.forma ?? 'Cta. Cte.',
    pagos,
  }
}

// ---------------------------------------------------------------------------
// Lectura de Fudo (GET).
// ---------------------------------------------------------------------------

export class SinCredenciales extends Error {
  constructor() { super('La sucursal no tiene Fudo conectado.') }
}

const POR_PAGINA_FUDO = 500
const MAX_PAGINAS = 20
// Las relaciones van en fields[expense]: si no, el include no llega (JSON:API).
const CAMPOS = 'fields[expense]=amount,date,description,status,canceled,dueDate,paymentDate,expenseCategory,provider,payments'
  + '&fields[expenseCategory]=name&fields[provider]=name&fields[payment]=amount,paid_at,canceled,paymentMethod'
  + '&fields[paymentMethod]=name&include=expenseCategory,provider,payments.paymentMethod'

/** Todos los gastos de una sucursal. `completo` = se leyeron todas las páginas. */
export async function leerGastosFudo(sucursal: string): Promise<{ items: ItemFudo[]; completo: boolean }> {
  const cred = await getFudoCredentials(sucursal)
  if (!cred) throw new SinCredenciales()
  let token = await getFudoToken(cred.apiKey, cred.apiSecret)
  const items: ItemFudo[] = []
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const path = `/expenses?${CAMPOS}&page[size]=${POR_PAGINA_FUDO}&page[number]=${pagina}&sort=-id`
    let raw: unknown
    try {
      raw = await fudoGet(token, path)
    } catch (e) {
      // Un token guardado que Fudo ya no acepta: uno nuevo, una sola vez.
      if (pagina !== 1 || !(e instanceof Error) || !/ 401:/.test(e.message)) throw e
      olvidarFudoToken(cred.apiKey)
      token = await getFudoToken(cred.apiKey, cred.apiSecret)
      raw = await fudoGet(token, path)
    }
    const filas = normalizeJsonApi(raw as Parameters<typeof normalizeJsonApi>[0])
    for (const f of filas) {
      const it = normalizarGastoFudo(f)
      if (it) items.push(it)
    }
    if (filas.length < POR_PAGINA_FUDO) return { items, completo: true }
  }
  return { items, completo: false }
}

// ---------------------------------------------------------------------------
// Sincronizar.
// ---------------------------------------------------------------------------

export interface ResultadoLocal {
  local: string
  ok: boolean
  omitido?: boolean
  resumen?: { leidos: number; nuevos: number; cambiados: number; pagos: number; anulados: number; revisar: number }
  error?: string
}

/**
 * Lee Fudo y aplica, sucursal por sucursal (en paralelo). Con `vencidoMinutos`
 * solo las que no se sincronizaron bien en esos minutos (al abrir la pantalla);
 * con `soloLocal`, solo esa (recién conectada en Conexión Fudo).
 */
export async function sincronizarFudo(
  supabase: Cliente,
  { origen, vencidoMinutos, soloLocal }: { origen: OrigenSync; vencidoMinutos?: number; soloLocal?: string },
): Promise<{ activo: boolean; locales: ResultadoLocal[] }> {
  if (!sincronizacionActiva()) return { activo: false, locales: [] }

  const [{ data: locales, error }, { data: ultimos }] = await Promise.all([
    supabase.from('locales_config').select('sucursal, activo').eq('tiene_fudo', true),
    supabase.from('gastos_fudo_sync').select('local, creado_en').order('creado_en', { ascending: false }).limit(100),
  ])
  if (error) throw error
  // El último intento, bien o mal: una sucursal sin credenciales no se reintenta en cada apertura.
  const ultimoIntento = new Map<string, number>()
  for (const u of ultimos ?? []) if (!ultimoIntento.has(u.local)) ultimoIntento.set(u.local, Date.parse(u.creado_en))

  const activos = (locales ?? []).filter(l => l.activo !== false && (!soloLocal || l.sucursal === soloLocal)).map(l => l.sucursal)
  const resultados = await Promise.all(activos.map(async (local): Promise<ResultadoLocal> => {
    const ult = ultimoIntento.get(local)
    if (vencidoMinutos && ult && Date.now() - ult < vencidoMinutos * 60_000) return { local, ok: true, omitido: true }
    try {
      const { items, completo } = await leerGastosFudo(local)
      const { data, error: e } = await supabase.rpc('gastos_fudo_aplicar', {
        p_local: local, p_items: items as unknown as Database['public']['Functions']['gastos_fudo_aplicar']['Args']['p_items'],
        p_completo: completo, p_origen: origen,
      })
      if (e) throw e
      return { local, ok: true, resumen: data as ResultadoLocal['resumen'] }
    } catch (e) {
      const mensaje = e instanceof SinCredenciales ? e.message
        : e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'No respondió'
      await supabase.rpc('gastos_fudo_registrar_error', { p_local: local, p_origen: origen, p_error: mensaje })
      return { local, ok: false, error: mensaje }
    }
  }))
  return { activo: true, locales: resultados }
}
