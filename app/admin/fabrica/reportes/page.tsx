export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportesClient, {
  ProduccionFilaUI, EmbolsadoFilaUI, DevolucionFilaUI, ConteoSemanaUI, OperarioUI,
} from './ReportesClient'

export const metadata = { title: 'Fábrica · Reportes | YA! Chipacitos' }

export default async function AdminFabricaReportesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
        id, fecha, cantidad_kg, destino, notas,
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
    id: d.id,
    fecha: d.fecha,
    motivoNombre: d.motivo?.nombre ?? '—',
    saborNombre: d.sabor?.nombre ?? 'Sin detalle',
    tamanioNombre: d.tamanio?.nombre ?? 'Sin detalle',
    presentacionNombre: d.presentacion?.nombre ?? 'Sin detalle',
    destino: d.destino,
    cantidadKg: d.cantidad_kg ?? 0,
    notas: d.notas,
  }))

  const conteosUI: ConteoSemanaUI[] = ((conteos ?? []) as any[]).map(c => ({
    id: c.id,
    semanaDesde: c.semana_desde,
    semanaHasta: c.semana_hasta,
    masasProyectadas: c.masas_proyectadas,
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
