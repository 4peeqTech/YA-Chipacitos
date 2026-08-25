export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { diaFabrica, diaAnterior } from '@/lib/fabrica/diaFabrica'
import CongeladosClient, { Parametro, Congelado } from './CongeladosClient'

export default async function FabricaCongeladosPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>
}) {
  const supabase = await createClient()

  const hoy = diaFabrica(new Date())
  const ayer = diaAnterior(hoy)
  const dia = (await searchParams).dia || hoy

  const [{ data: sabores }, { data: tamanios }, { data: presentaciones }, { data: operarios }, { data: congelados }] =
    await Promise.all([
      supabase.from('fabrica_sabores').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_tamanios').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_presentaciones').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_operarios').select('id, nombre').eq('activo', true).order('orden'),
      supabase
        .from('fabrica_embolsados')
        .select(`
          id, fecha, tamanio_id, sabor_id, presentacion_id, cantidad_kg, operario_fabrica_id,
          presentacion:fabrica_presentaciones(nombre),
          operario_fabrica:fabrica_operarios(nombre)
        `)
        .eq('fecha', dia)
        .order('updated_at', { ascending: false }),
    ])

  const congeladosUI: Congelado[] = ((congelados ?? []) as any[]).map(c => ({
    id: c.id,
    fecha: c.fecha,
    tamanioId: c.tamanio_id,
    saborId: c.sabor_id,
    presentacionId: c.presentacion_id,
    presentacionNombre: c.presentacion?.nombre ?? '—',
    cantidadKg: c.cantidad_kg,
    operarioId: c.operario_fabrica_id,
    operarioNombre: c.operario_fabrica?.nombre ?? null,
  }))

  return (
    <CongeladosClient
      key={dia}
      dia={dia}
      hoy={hoy}
      ayer={ayer}
      sabores={(sabores ?? []) as Parametro[]}
      tamanios={(tamanios ?? []) as Parametro[]}
      presentaciones={(presentaciones ?? []) as Parametro[]}
      operarios={(operarios ?? []) as Parametro[]}
      congeladosIniciales={congeladosUI}
    />
  )
}
