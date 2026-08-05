export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { calcularSemanaConteo } from '@/lib/fabrica/semanaConteo'
import StockClient, { InsumoConteo, ConteoHistorial } from './StockClient'

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
    const { data: nuevo } = await supabase
      .from('fabrica_conteos')
      .insert({ fecha, semana_desde: semanaDesde, semana_hasta: semanaHasta, creado_por: user!.id })
      .select('*')
      .single()
    conteo = nuevo
  }

  const { data: itemsCompras } = await supabase
    .from('compras_items')
    .select('id, nombre, unidad, orden, base_calculo, coeficiente, meta_semanal, compras_categorias(nombre, orden)')
    .eq('estado', 'activo')
    .eq('incluir_en_conteo', true)

  if (conteo && itemsCompras?.length) {
    await supabase.from('fabrica_conteo_items').upsert(
      itemsCompras.map(i => ({ conteo_id: conteo!.id, item_id: i.id })),
      { onConflict: 'conteo_id,item_id', ignoreDuplicates: true }
    )
  }

  const { data: conteoItems } = conteo
    ? await supabase.from('fabrica_conteo_items').select('id, item_id, cantidad').eq('conteo_id', conteo.id)
    : { data: [] }

  const cantidadPorItem = new Map((conteoItems || []).map(ci => [ci.item_id, ci]))

  const insumos: InsumoConteo[] = (itemsCompras || [])
    .map(i => {
      const ci = cantidadPorItem.get(i.id)
      const categoria = Array.isArray(i.compras_categorias) ? i.compras_categorias[0] : i.compras_categorias
      return {
        conteoItemId: ci?.id ?? '',
        itemId: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        orden: i.orden,
        categoriaNombre: categoria?.nombre ?? 'Sin categoría',
        categoriaOrden: categoria?.orden ?? Number.MAX_SAFE_INTEGER,
        baseCalculo: i.base_calculo,
        coeficiente: i.coeficiente,
        metaSemanal: i.meta_semanal,
        cantidad: ci?.cantidad ?? 0,
      }
    })
    .sort((a, b) => a.categoriaOrden - b.categoriaOrden || a.orden - b.orden)

  const { data: historialData } = await supabase
    .from('fabrica_conteos')
    .select('id, fecha, semana_desde, semana_hasta, proyeccion_masa_kg, proyeccion_embolsado_kg, cerrado_en')
    .eq('estado', 'cerrado')
    .order('fecha', { ascending: false })
    .limit(20)

  const historial: ConteoHistorial[] = historialData || []

  return <StockClient conteoInicial={conteo!} insumosIniciales={insumos} historialInicial={historial} />
}
