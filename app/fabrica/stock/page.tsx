export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { calcularSemanaConteo } from '@/lib/fabrica/semanaConteo'
import StockClient, { MateriaPrimaConteo, ConteoHistorial } from './StockClient'

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

  let conteo = borrador
  if (!conteo) {
    const { fecha, semanaDesde, semanaHasta } = calcularSemanaConteo(new Date())
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
  }

  const { data: materiaPrima } = await supabase
    .from('fabrica_materia_prima')
    .select('id, nombre, unidad_compra, kg_por_unidad, coeficiente')
    .eq('estado', 'activo')

  if (conteo && materiaPrima?.length) {
    await supabase.from('fabrica_conteo_items').upsert(
      materiaPrima.map(m => ({ conteo_id: conteo!.id, materia_prima_id: m.id })),
      { onConflict: 'conteo_id,materia_prima_id', ignoreDuplicates: true }
    )
  }

  const { data: conteoItems } = conteo
    ? await supabase.from('fabrica_conteo_items').select('id, materia_prima_id, cantidad').eq('conteo_id', conteo.id)
    : { data: [] }

  const cantidadPorItem = new Map((conteoItems || []).map(ci => [ci.materia_prima_id, ci]))

  const items: MateriaPrimaConteo[] = (materiaPrima || [])
    .map(m => {
      const ci = cantidadPorItem.get(m.id)
      return {
        conteoItemId: ci?.id ?? '',
        materiaPrimaId: m.id,
        nombre: m.nombre,
        unidadCompra: m.unidad_compra,
        kgPorUnidad: m.kg_por_unidad,
        coeficiente: m.coeficiente,
        cantidad: ci?.cantidad ?? 0,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const { data: historialData } = await supabase
    .from('fabrica_conteos')
    .select('id, fecha, semana_desde, semana_hasta, proyeccion_masa_kg, cerrado_en')
    .eq('estado', 'cerrado')
    .order('fecha', { ascending: false })
    .limit(20)

  const historial: ConteoHistorial[] = historialData || []

  return <StockClient conteoInicial={conteo!} itemsIniciales={items} historialInicial={historial} />
}
