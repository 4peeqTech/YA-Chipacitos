export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import ReportesClient, {
  ProduccionFilaUI, EmbolsadoFilaUI, DevolucionFilaUI, ConteoSemanaUI, OperarioUI,
} from './ReportesClient'

export default async function FabricaReportesPage() {
  const supabase = await createClient()

  const [{ data: producciones }, { data: embolsados }, { data: devoluciones }, { data: conteos }, { data: operarios }] = await Promise.all([
    supabase
      .from('fabrica_producciones')
      .select(`
        fecha, turno, fecula_kg, masa_kg, operario_fabrica_id,
        operario_fabrica:fabrica_operarios(nombre),
        sabor:fabrica_sabores(nombre)
      `)
      .order('fecha', { ascending: false }),
    supabase
      .from('fabrica_embolsados')
      .select(`
        fecha, cantidad_kg, operario_fabrica_id,
        presentacion:fabrica_presentaciones(nombre),
        sabor:fabrica_sabores(nombre),
        tamanio:fabrica_tamanios(nombre),
        operario_fabrica:fabrica_operarios(nombre)
      `),
    supabase
      .from('fabrica_devoluciones')
      .select(`
        fecha, cantidad_kg, destino,
        motivo:fabrica_devolucion_motivos(nombre),
        sabor:fabrica_sabores(nombre),
        tamanio:fabrica_tamanios(nombre),
        presentacion:fabrica_presentaciones(nombre)
      `),
    supabase
      .from('fabrica_conteos')
      .select('id, semana_desde, semana_hasta, masas_proyectadas')
      .eq('estado', 'cerrado')
      .order('semana_desde', { ascending: false }),
    supabase.from('fabrica_operarios').select('id, nombre').order('orden'),
  ])

  const produccionesUI: ProduccionFilaUI[] = ((producciones ?? []) as any[]).map(p => ({
    fecha: p.fecha,
    turno: p.turno,
    operarioId: p.operario_fabrica_id,
    operarioNombre: p.operario_fabrica?.nombre ?? '—',
    saborNombre: p.sabor?.nombre ?? '—',
    feculaKg: p.fecula_kg,
    masaKg: p.masa_kg,
  }))

  const embolsadosUI: EmbolsadoFilaUI[] = ((embolsados ?? []) as any[]).map(e => ({
    fecha: e.fecha,
    presentacionNombre: e.presentacion?.nombre ?? '—',
    saborNombre: e.sabor?.nombre ?? '—',
    tamanioNombre: e.tamanio?.nombre ?? '—',
    operarioId: e.operario_fabrica_id,
    operarioNombre: e.operario_fabrica?.nombre ?? '—',
    cantidadKg: e.cantidad_kg,
  }))

  const devolucionesUI: DevolucionFilaUI[] = ((devoluciones ?? []) as any[]).map(d => ({
    fecha: d.fecha,
    motivoNombre: d.motivo?.nombre ?? '—',
    saborNombre: d.sabor?.nombre ?? '—',
    tamanioNombre: d.tamanio?.nombre ?? '—',
    presentacionNombre: d.presentacion?.nombre ?? '—',
    destino: d.destino,
    cantidadKg: d.cantidad_kg,
  }))

  const conteosUI: ConteoSemanaUI[] = ((conteos ?? []) as any[]).map(c => ({
    id: c.id,
    semanaDesde: c.semana_desde,
    semanaHasta: c.semana_hasta,
    // Fase 6 oculta: la proyección real del legacy es "número de masas" (ver
    // lib/fabrica/calculoSugerido.ts), no kg — este cruce contra masaRealKg queda
    // con un desajuste de unidades pendiente de revisar si se retoma esta fase.
    proyeccionMasaKg: c.masas_proyectadas,
    // proyeccion_embolsado_kg se dropeó en la Fase 2 del catálogo/conteos: nunca se
    // escribió desde ninguna pantalla, así que este cruce siempre mostró "sin
    // proyección" — se mantiene ese mismo comportamiento con un 0 fijo.
    proyeccionEmbolsadoKg: 0,
  }))

  return (
    <ReportesClient
      produccionesIniciales={produccionesUI}
      embolsadosIniciales={embolsadosUI}
      devolucionesIniciales={devolucionesUI}
      conteosIniciales={conteosUI}
      operarios={(operarios ?? []) as OperarioUI[]}
    />
  )
}
