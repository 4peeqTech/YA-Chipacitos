export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { diaFabrica, diaAnterior } from '@/lib/fabrica/diaFabrica'
import ProduccionClient, { Parametro, ProduccionTurno } from './ProduccionClient'

export default async function FabricaProduccionPage() {
  const supabase = await createClient()

  const hoy = diaFabrica(new Date())
  const ayer = diaAnterior(hoy)

  const [{ data: sabores }, { data: tamanios }, { data: configRow }, { data: producciones }] =
    await Promise.all([
      supabase.from('fabrica_sabores').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_tamanios').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('config').select('value').eq('key', 'fabrica_rendimiento_masa').maybeSingle(),
      supabase
        .from('fabrica_producciones')
        .select(`
          id, fecha, turno, fecula_kg, masa_kg, sabor_id, destino, tamanio_id,
          sabor:fabrica_sabores(nombre),
          tamanio:fabrica_tamanios(nombre)
        `)
        .in('fecha', [ayer, hoy])
        .order('created_at', { ascending: false }),
    ])

  const rendimientoMasa = Number(configRow?.value ?? '2.5') || 2.5

  return (
    <ProduccionClient
      hoy={hoy}
      ayer={ayer}
      sabores={(sabores ?? []) as Parametro[]}
      tamanios={(tamanios ?? []) as Parametro[]}
      rendimientoMasa={rendimientoMasa}
      produccionesIniciales={((producciones ?? []) as any[]).map(p => ({
        id: p.id,
        fecha: p.fecha,
        turno: p.turno,
        feculaKg: p.fecula_kg,
        masaKg: p.masa_kg,
        saborId: p.sabor_id,
        saborNombre: p.sabor?.nombre ?? '—',
        destino: p.destino,
        tamanioId: p.tamanio_id,
        tamanioNombre: p.tamanio?.nombre ?? null,
      })) as ProduccionTurno[]}
    />
  )
}
