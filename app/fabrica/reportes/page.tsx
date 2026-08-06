export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import ReportesClient, { ProduccionFilaUI, EmbolsadoFilaUI, ConteoSemanaUI } from './ReportesClient'

export default async function FabricaReportesPage() {
  const supabase = await createClient()

  const [{ data: producciones }, { data: embolsados }, { data: conteos }] = await Promise.all([
    supabase
      .from('fabrica_producciones')
      .select(`
        fecha, turno, fecula_kg, masa_kg,
        operario:profiles(nombre),
        sabor:fabrica_sabores(nombre)
      `)
      .order('fecha', { ascending: false }),
    supabase
      .from('fabrica_embolsados')
      .select(`
        cantidad_kg,
        presentacion:fabrica_presentaciones(nombre),
        produccion:fabrica_producciones(fecha)
      `),
    supabase
      .from('fabrica_conteos')
      .select('id, semana_desde, semana_hasta, masas_proyectadas, proyeccion_embolsado_kg')
      .eq('estado', 'cerrado')
      .order('semana_desde', { ascending: false }),
  ])

  const produccionesUI: ProduccionFilaUI[] = ((producciones ?? []) as any[]).map(p => ({
    fecha: p.fecha,
    turno: p.turno,
    operarioNombre: p.operario?.nombre ?? '—',
    saborNombre: p.sabor?.nombre ?? '—',
    feculaKg: p.fecula_kg,
    masaKg: p.masa_kg,
  }))

  const embolsadosUI: EmbolsadoFilaUI[] = ((embolsados ?? []) as any[])
    .filter(e => e.produccion?.fecha)
    .map(e => ({
      fecha: e.produccion.fecha,
      presentacionNombre: e.presentacion?.nombre ?? '—',
      cantidadKg: e.cantidad_kg,
    }))

  const conteosUI: ConteoSemanaUI[] = ((conteos ?? []) as any[]).map(c => ({
    id: c.id,
    semanaDesde: c.semana_desde,
    semanaHasta: c.semana_hasta,
    // Fase 6 oculta: la proyección real del legacy es "número de masas" (ver
    // lib/fabrica/calculoSugerido.ts), no kg — este cruce contra masaRealKg queda
    // con un desajuste de unidades pendiente de revisar si se retoma esta fase.
    proyeccionMasaKg: c.masas_proyectadas,
    proyeccionEmbolsadoKg: c.proyeccion_embolsado_kg,
  }))

  return (
    <ReportesClient
      produccionesIniciales={produccionesUI}
      embolsadosIniciales={embolsadosUI}
      conteosIniciales={conteosUI}
    />
  )
}
