export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RegistrosClient, {
  ProduccionRegistro, EmbolsadoRegistro, DevolucionRegistro, OperarioUI,
} from './RegistrosClient'

export const metadata = { title: 'Fábrica · Registros | YA! Chipacitos' }

// Rango amplio, no filtrado por preset: los últimos 12 meses de auditoría cruda.
function hace12Meses(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 12)
  return d.toISOString().slice(0, 10)
}

export default async function AdminFabricaRegistrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const desde = hace12Meses()

  const [{ data: producciones }, { data: embolsados }, { data: devoluciones }, { data: operarios }] = await Promise.all([
    supabase
      .from('fabrica_producciones')
      .select(`
        id, fecha, turno, fecula_kg, masa_kg, destino, created_at,
        sabor:fabrica_sabores(nombre), tamanio:fabrica_tamanios(nombre),
        operario_fabrica:fabrica_operarios(nombre), cargado_por:profiles(nombre)
      `)
      .gte('fecha', desde)
      .order('fecha', { ascending: false }),
    supabase
      .from('fabrica_embolsados')
      .select(`
        id, fecha, cantidad_kg, created_at,
        presentacion:fabrica_presentaciones(nombre), sabor:fabrica_sabores(nombre),
        tamanio:fabrica_tamanios(nombre), operario_fabrica:fabrica_operarios(nombre),
        cargado_por:profiles(nombre)
      `)
      .gte('fecha', desde)
      .order('fecha', { ascending: false }),
    supabase
      .from('fabrica_devoluciones')
      .select(`
        id, fecha, cantidad_kg, destino, notas, created_at,
        motivo:fabrica_devolucion_motivos(nombre), sabor:fabrica_sabores(nombre),
        tamanio:fabrica_tamanios(nombre), presentacion:fabrica_presentaciones(nombre),
        cargado_por:profiles(nombre)
      `)
      .gte('fecha', desde)
      .order('fecha', { ascending: false }),
    supabase.from('fabrica_operarios').select('id, nombre').order('orden'),
  ])

  const produccionesUI: ProduccionRegistro[] = ((producciones ?? []) as any[]).map(p => ({
    id: p.id,
    fecha: p.fecha,
    turno: p.turno,
    operarioNombre: p.operario_fabrica?.nombre ?? '—',
    saborNombre: p.sabor?.nombre ?? '—',
    tamanioNombre: p.tamanio?.nombre ?? null,
    feculaKg: p.fecula_kg,
    masaKg: p.masa_kg,
    destino: p.destino,
    cargadoPor: p.cargado_por?.nombre ?? null,
    createdAt: p.created_at,
  }))

  const embolsadosUI: EmbolsadoRegistro[] = ((embolsados ?? []) as any[]).map(e => ({
    id: e.id,
    fecha: e.fecha,
    presentacionNombre: e.presentacion?.nombre ?? '—',
    saborNombre: e.sabor?.nombre ?? '—',
    tamanioNombre: e.tamanio?.nombre ?? '—',
    operarioNombre: e.operario_fabrica?.nombre ?? '—',
    cantidadKg: e.cantidad_kg,
    cargadoPor: e.cargado_por?.nombre ?? null,
    createdAt: e.created_at,
  }))

  const devolucionesUI: DevolucionRegistro[] = ((devoluciones ?? []) as any[]).map(d => ({
    id: d.id,
    fecha: d.fecha,
    motivoNombre: d.motivo?.nombre ?? '—',
    destino: d.destino,
    saborNombre: d.sabor?.nombre ?? null,
    tamanioNombre: d.tamanio?.nombre ?? null,
    presentacionNombre: d.presentacion?.nombre ?? null,
    cantidadKg: d.cantidad_kg,
    notas: d.notas,
    cargadoPor: d.cargado_por?.nombre ?? null,
    createdAt: d.created_at,
  }))

  return (
    <RegistrosClient
      produccionesIniciales={produccionesUI}
      embolsadosIniciales={embolsadosUI}
      devolucionesIniciales={devolucionesUI}
      operarios={(operarios ?? []) as OperarioUI[]}
    />
  )
}
