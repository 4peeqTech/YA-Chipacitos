export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { calcularSemanaConteo } from '@/lib/fabrica/semanaConteo'
import StockClient, { BolsaplastItem, MateriaPrimaConteo, ConteoHistorial } from './StockClient'

export default async function FabricaStockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: borrador } = await supabase
    .from('fabrica_conteos')
    .select('*')
    .eq('estado', 'borrador')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { fecha, semanaDesde, semanaHasta, desdeTurno, hastaTurno } = calcularSemanaConteo(new Date())

  let conteo = borrador
  if (!conteo) {
    const { data: nuevo, error: errInsert } = await supabase
      .from('fabrica_conteos')
      .insert({ fecha, semana_desde: semanaDesde, semana_hasta: semanaHasta, creado_por: user!.id })
      .select('*')
      .single()

    if (errInsert) {
      // Otra pestaña/request ganó la carrera contra el índice único de "un solo
      // borrador vivo" — recuperamos el que quedó creado en vez de romper la carga.
      const { data: existente } = await supabase
        .from('fabrica_conteos')
        .select('*')
        .eq('estado', 'borrador')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      conteo = existente
    } else {
      conteo = nuevo
    }
  } else if (conteo.semana_desde !== semanaDesde) {
    // Un borrador es el trabajo en curso, no un registro histórico — con el
    // ancla en martes, un borrador viejo (de la semana pasada, o de antes del
    // cambio a martes-viernes) se retargetea a la ventana actual en vez de
    // quedarse pegado para siempre.
    const { data: actualizado } = await supabase
      .from('fabrica_conteos')
      .update({ fecha, semana_desde: semanaDesde, semana_hasta: semanaHasta })
      .eq('id', conteo.id)
      .select('*')
      .single()
    if (actualizado) conteo = actualizado
  }

  const [{ data: bolsaplastItems }, { data: stockActual }, { data: materiaPrima }] = await Promise.all([
    supabase.from('compras_items').select('id, nombre, unidad, meta_semanal').eq('incluir_en_conteo', true).eq('estado', 'activo'),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
    supabase.from('fabrica_materia_prima').select('id, nombre, unidad_compra, kg_por_unidad, kg_por_masa, redondeo').eq('estado', 'activo'),
  ])

  const stockPorItem = new Map((stockActual || []).map(s => [s.item_id, s.cantidad]))

  const bolsaplast: BolsaplastItem[] = (bolsaplastItems || [])
    .map(i => ({ itemId: i.id, nombre: i.nombre, unidad: i.unidad, metaSemanal: i.meta_semanal, cantidad: stockPorItem.get(i.id) ?? 0 }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  if (conteo && materiaPrima?.length) {
    await supabase.from('fabrica_conteo_items').upsert(
      materiaPrima.map(m => ({ conteo_id: conteo!.id, materia_prima_id: m.id })),
      { onConflict: 'conteo_id,materia_prima_id', ignoreDuplicates: true }
    )
  }

  const { data: conteoItems } = conteo
    ? await supabase.from('fabrica_conteo_items').select('id, materia_prima_id, cantidad').eq('conteo_id', conteo.id)
    : { data: [] }

  const cantidadPorMateriaPrima = new Map((conteoItems || []).map(ci => [ci.materia_prima_id, ci]))

  const materiaPrimaItems: MateriaPrimaConteo[] = (materiaPrima || [])
    .map(m => {
      const ci = cantidadPorMateriaPrima.get(m.id)
      return {
        conteoItemId: ci?.id ?? '',
        materiaPrimaId: m.id,
        nombre: m.nombre,
        unidadCompra: m.unidad_compra,
        kgPorUnidad: m.kg_por_unidad,
        kgPorMasa: m.kg_por_masa,
        redondeo: m.redondeo,
        cantidad: ci?.cantidad ?? 0,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const { data: historialData } = await supabase
    .from('fabrica_conteos')
    .select('id, fecha, semana_desde, semana_hasta, masas_proyectadas, cerrado_en')
    .eq('estado', 'cerrado')
    .order('fecha', { ascending: false })
    .limit(20)

  const historial: ConteoHistorial[] = historialData || []

  return (
    <StockClient
      conteoInicial={conteo!}
      bolsaplastIniciales={bolsaplast}
      materiaPrimaIniciales={materiaPrimaItems}
      historialInicial={historial}
      usuarioId={user!.id}
      desdeTurno={desdeTurno}
      hastaTurno={hastaTurno}
    />
  )
}
