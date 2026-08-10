export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { calcularSemanaConteo } from '@/lib/fabrica/semanaConteo'
import type { Redondeo, ModoCalculo } from '@/lib/fabrica/calculoSugerido'
import StockClient, { type DefinicionConDatos, type ConteoBorrador, type ItemConteoUI, type ConteoHistorial } from './StockClient'

type Periodicidad = 'semanal' | 'quincenal' | 'mensual'

interface DefinicionRow {
  id: string
  nombre: string
  icono: string | null
  dia_semana: number
  turno_desde: 'manana' | 'tarde'
  dias_ventana: number
  turno_hasta: 'manana' | 'tarde'
  pide_masas: boolean
  periodicidad: Periodicidad
}

export default async function FabricaStockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: definicionesData } = await supabase
    .from('fabrica_conteo_definiciones')
    .select('id, nombre, icono, dia_semana, turno_desde, dias_ventana, turno_hasta, pide_masas, periodicidad')
    .eq('activo', true)
    .order('orden')

  const definiciones: DefinicionRow[] = definicionesData ?? []

  // Para cada definición: buscar/crear/retargetear su propio borrador — misma
  // lógica de antes (incluido el rescate ante la carrera contra el índice
  // único y el retarget cuando semana_desde quedó viejo), pero un borrador
  // por definición en vez de uno solo global.
  const conteoPorDefinicion = new Map<string, ConteoBorrador>()
  for (const def of definiciones) {
    const { data: borrador } = await supabase
      .from('fabrica_conteos')
      .select('id, fecha, semana_desde, semana_hasta, masas_proyectadas, estado')
      .eq('definicion_id', def.id)
      .eq('estado', 'borrador')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { fecha, semanaDesde, semanaHasta } = calcularSemanaConteo(new Date(), {
      diaSemana: def.dia_semana,
      diasVentana: def.dias_ventana,
      turnoDesde: def.turno_desde,
      turnoHasta: def.turno_hasta,
    })

    let conteo = borrador
    if (!conteo) {
      const { data: nuevo, error: errInsert } = await supabase
        .from('fabrica_conteos')
        .insert({ definicion_id: def.id, fecha, semana_desde: semanaDesde, semana_hasta: semanaHasta, creado_por: user!.id })
        .select('id, fecha, semana_desde, semana_hasta, masas_proyectadas, estado')
        .single()

      if (errInsert) {
        // Otra pestaña/request ganó la carrera contra el índice único de "un solo
        // borrador vivo por definición" — recuperamos el que quedó creado.
        const { data: existente } = await supabase
          .from('fabrica_conteos')
          .select('id, fecha, semana_desde, semana_hasta, masas_proyectadas, estado')
          .eq('definicion_id', def.id)
          .eq('estado', 'borrador')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        conteo = existente
      } else {
        conteo = nuevo
      }
    } else if (conteo.semana_desde !== semanaDesde) {
      // Un borrador es el trabajo en curso, no un registro histórico — un
      // borrador viejo se retargetea a la ventana actual en vez de quedarse
      // pegado para siempre.
      const { data: actualizado } = await supabase
        .from('fabrica_conteos')
        .update({ fecha, semana_desde: semanaDesde, semana_hasta: semanaHasta })
        .eq('id', conteo.id)
        .select('id, fecha, semana_desde, semana_hasta, masas_proyectadas, estado')
        .single()
      if (actualizado) conteo = actualizado
    }

    if (conteo) conteoPorDefinicion.set(def.id, conteo as ConteoBorrador)
  }

  const { data: definicionItemsData } = definiciones.length
    ? await supabase
        .from('fabrica_conteo_definicion_items')
        .select(`
          definicion_id, item_id, modo_calculo, meta, cantidad_fija, orden,
          compras_items(nombre, unidad, cantidad_por_unidad, cantidad_por_masa, redondeo)
        `)
        .eq('activo', true)
        .in('definicion_id', definiciones.map(d => d.id))
        .order('orden')
    : { data: [] }

  type DefinicionItemRow = {
    definicion_id: string
    item_id: string
    modo_calculo: ModoCalculo
    meta: number
    cantidad_fija: number
    compras_items: { nombre: string; unidad: string; cantidad_por_unidad: number; cantidad_por_masa: number; redondeo: Redondeo } | null
  }
  const definicionItems = (definicionItemsData ?? []) as unknown as DefinicionItemRow[]

  const itemIds = [...new Set(definicionItems.map(di => di.item_id))]
  const { data: stockActual } = itemIds.length
    ? await supabase.from('compras_stock_actual').select('item_id, cantidad').in('item_id', itemIds)
    : { data: [] }
  const stockPorItem = new Map((stockActual || []).map(s => [s.item_id, s.cantidad]))

  // Sembrar fabrica_conteo_items del borrador de cada definición con las
  // líneas de su membresía — arranca del stock persistente actual (el mismo
  // criterio que ya usaba Bolsaplast) para que abrir un conteo nuevo no
  // vuelva a cero un stock que ya se venía contando.
  for (const def of definiciones) {
    const conteo = conteoPorDefinicion.get(def.id)
    const itemsDeEstaDef = definicionItems.filter(di => di.definicion_id === def.id)
    if (!conteo || itemsDeEstaDef.length === 0) continue
    await supabase.from('fabrica_conteo_items').upsert(
      itemsDeEstaDef.map(di => ({ conteo_id: conteo.id, item_id: di.item_id, cantidad: stockPorItem.get(di.item_id) ?? 0 })),
      { onConflict: 'conteo_id,item_id', ignoreDuplicates: true }
    )
  }

  const conteoIds = [...conteoPorDefinicion.values()].map(c => c.id)
  const { data: conteoItemsData } = conteoIds.length
    ? await supabase.from('fabrica_conteo_items').select('id, conteo_id, item_id, cantidad').in('conteo_id', conteoIds)
    : { data: [] }
  const conteoItemPorClave = new Map((conteoItemsData || []).map(ci => [`${ci.conteo_id}:${ci.item_id}`, ci]))

  const definicionesUI: DefinicionConDatos[] = []
  for (const def of definiciones) {
    const conteo = conteoPorDefinicion.get(def.id)
    if (!conteo) continue

    const items: ItemConteoUI[] = definicionItems
      .filter(di => di.definicion_id === def.id && di.compras_items)
      .map(di => {
        const ci = conteoItemPorClave.get(`${conteo.id}:${di.item_id}`)
        const catalogo = di.compras_items!
        return {
          conteoItemId: ci?.id ?? '',
          itemId: di.item_id,
          nombre: catalogo.nombre,
          unidad: catalogo.unidad,
          cantidadPorUnidad: catalogo.cantidad_por_unidad,
          cantidadPorMasa: catalogo.cantidad_por_masa,
          redondeo: catalogo.redondeo,
          modoCalculo: di.modo_calculo,
          meta: di.meta,
          cantidadFija: di.cantidad_fija,
          cantidad: ci?.cantidad ?? 0,
        }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre))

    const { data: historialData } = await supabase
      .from('fabrica_conteos')
      .select('id, fecha, semana_desde, semana_hasta, masas_proyectadas, cerrado_en')
      .eq('definicion_id', def.id)
      .eq('estado', 'cerrado')
      .order('fecha', { ascending: false })
      .limit(20)

    definicionesUI.push({
      id: def.id,
      nombre: def.nombre,
      icono: def.icono,
      diaSemana: def.dia_semana,
      pideMasas: def.pide_masas,
      periodicidad: def.periodicidad,
      desdeTurno: def.turno_desde,
      hastaTurno: def.turno_hasta,
      conteo,
      items,
      historial: (historialData || []) as ConteoHistorial[],
    })
  }

  return <StockClient definiciones={definicionesUI} usuarioId={user!.id} />
}
