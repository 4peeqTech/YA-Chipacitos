import type { createClientTipado } from '@/lib/supabase/server'
import { sincronizacionActiva } from '@/lib/gastos/fudoSync'
import { COLUMNAS_PLAN, armarPlan, conAyudas, type CuentaPlan } from '@/lib/gastos/plan'
import {
  POR_PAGINA, leerResumen, type FiltrosLista, type FiltrosPendientes, type GastoFila, type ResumenGastos,
} from '@/lib/gastos/modelo'

type Cliente = Awaited<ReturnType<typeof createClientTipado>>

/** Los filtros de la lista como argumentos de gastos_listar / gastos_resumen. */
function argsFiltros(f: Pick<FiltrosLista, 'desde' | 'hasta' | 'estado' | 'local' | 'q' | 'origen'> & { cuenta?: string }) {
  return {
    p_desde: f.desde || undefined,
    p_hasta: f.hasta || undefined,
    p_estado: f.estado,
    p_local: f.local || undefined,
    p_q: f.q || undefined,
    p_origen: f.origen || undefined,
    p_cuenta: f.cuenta || undefined,
  }
}

/**
 * Las cuentas que se eligen en Gastos (imputables, de gasto o "no es gasto"), en
 * el orden del plan, con lo que significan su rubro y su categoría. Trae el plan
 * entero (son 216 filas) para tener los textos de los ancestros.
 */
export async function consultarCuentasGastos(supabase: Cliente): Promise<CuentaPlan[]> {
  const { data, error } = await supabase.from('plan_cuentas').select(COLUMNAS_PLAN).order('orden')
  if (error) console.error(error)
  return conAyudas(armarPlan(data ?? [])).filter(c => c.imputable && c.usoGastos != null)
}

/**
 * Una página de la lista (filtrada y ordenada por la base) con el total de
 * filas y el resumen de arriba. La vista pide es_admin(): otro rol recibe todo vacío.
 */
export async function listarGastos(supabase: Cliente, f: FiltrosLista): Promise<{
  filas: GastoFila[]
  cantidad: number
  resumen: ResumenGastos
  error: unknown
}> {
  const desde = (f.pagina - 1) * POR_PAGINA
  const [lista, resumen] = await Promise.all([
    supabase.rpc('gastos_listar', argsFiltros(f), { count: 'exact' }).range(desde, desde + POR_PAGINA - 1),
    supabase.rpc('gastos_resumen', argsFiltros(f)),
  ])
  // Una página que no existe: PostgREST responde 416 (PGRST103) sin el total.
  // Se pide solo el total, para que la página pueda ir a la última.
  if (lista.error?.code === 'PGRST103') {
    const { count, error } = await supabase.rpc('gastos_listar', argsFiltros(f), { count: 'exact', head: true })
    return { filas: [], cantidad: count ?? 0, resumen: leerResumen(resumen.data), error: error ?? resumen.error }
  }
  return {
    filas: lista.data ?? [],
    cantidad: lista.count ?? 0,
    resumen: leerResumen(resumen.data),
    error: lista.error ?? resumen.error,
  }
}

/** Cuándo se trajo Fudo por última vez en cada sucursal, y si está encendida la sincronización. */
export async function consultarEstadoFudo(supabase: Cliente) {
  const { data } = await supabase.rpc('gastos_fudo_estado')
  return {
    activo: sincronizacionActiva(),
    locales: (data ?? []).map(l => ({ local: l.local, ultimoOk: l.ultimo_ok, ultimoError: l.ultimo_error })),
  }
}

/** Un gasto suelto (el que pide ?gasto= y no está en la página). */
export async function consultarGasto(supabase: Cliente, id: string): Promise<GastoFila | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabase.from('v_gastos').select('*').eq('id', id).maybeSingle()
  return data
}

/** Pedido de cada factura (v_gastos trae solo su número): para linkear el pedido. */
export async function pedidosDeFacturas(supabase: Cliente, filas: GastoFila[]): Promise<Record<string, string>> {
  const ids = [...new Set(filas.map(g => g.factura_id).filter((id): id is string => !!id))]
  if (!ids.length) return {}
  const { data } = await supabase.from('compras_facturas').select('id, pedido_id').in('id', ids)
  return Object.fromEntries((data ?? []).filter(f => f.pedido_id).map(f => [f.id, f.pedido_id as string]))
}

// ---------------------------------------------------------------------------
// Pendientes de pago.
// ---------------------------------------------------------------------------

/** Cuántos gastos se muestran de cada local antes de "Ver más". */
export const PENDIENTES_POR_TANDA = 15

/** Los pendientes de un local (pendiente o parcial), de a tandas. */
export async function pendientesDeLocal(supabase: Cliente, f: FiltrosPendientes, local: string, desde: number, cuantos: number) {
  return supabase
    .rpc('gastos_listar', { ...argsFiltros({ ...f, estado: 'pendientes', origen: '', local }), p_orden: f.orden })
    .range(desde, desde + cuantos - 1)
}

/** Un renglón por local (cantidad, total por saldo, vencidos) y la primera tanda de cada uno. */
export async function consultarPendientes(supabase: Cliente, f: FiltrosPendientes) {
  const { data: grupos, error } = await supabase.rpc('gastos_pendientes_resumen', {
    p_desde: f.desde || undefined,
    p_hasta: f.hasta || undefined,
    p_local: f.local || undefined,
    p_q: f.q || undefined,
  })
  const primeras = await Promise.all((grupos ?? []).map(g => pendientesDeLocal(supabase, f, g.local, 0, PENDIENTES_POR_TANDA)))
  return {
    grupos: (grupos ?? []).map((g, i) => ({
      local: g.local,
      cantidad: Number(g.cantidad),
      total: Number(g.total),
      vencidos: Number(g.vencidos),
      filas: primeras[i].data ?? [],
    })),
    error: error ?? primeras.find(p => p.error)?.error ?? null,
  }
}

/**
 * Cajas y formas de pago activas (Parámetros › Cajas / Formas de pago).
 */
export async function consultarCatalogosPago(supabase: Cliente): Promise<{ cajas: string[]; formasPago: string[] }> {
  const [{ data: cajas }, { data: formas }] = await Promise.all([
    supabase.from('cajas').select('nombre, activo').order('nombre'),
    supabase.from('formas_pago').select('nombre, activo').order('nombre'),
  ])
  const activas = (filas: { nombre: string; activo: boolean | null }[] | null) =>
    (filas ?? []).filter(f => f.activo !== false).map(f => f.nombre)
  return { cajas: activas(cajas), formasPago: activas(formas) }
}

/** Locales a los que se imputa un gasto (locales_config, activos, en su orden). */
export async function consultarLocales(supabase: Cliente): Promise<string[]> {
  const { data } = await supabase
    .from('locales_config')
    .select('sucursal, activo')
    .order('orden')
    .order('sucursal')
  return (data ?? []).filter(l => l.activo !== false).map(l => l.sucursal)
}

/**
 * Crea los gastos que se repiten que ya tocan (idempotente). Lo llaman las
 * pantallas de Gastos al abrirse; si falla, la pantalla igual se muestra.
 */
export async function generarRecurrentes(supabase: Cliente): Promise<void> {
  await supabase.rpc('gastos_generar_recurrentes', {})
}
