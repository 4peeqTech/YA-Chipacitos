export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { calcularSemanaConteo } from '@/lib/fabrica/semanaConteo'
import ProduccionClient, { Parametro, ProduccionTurno } from './ProduccionClient'

export default async function FabricaProduccionPage() {
  const supabase = await createClient()

  const hoy = calcularSemanaConteo(new Date()).fecha

  const [{ data: sabores }, { data: tamanios }, { data: presentaciones }, { data: configRow }, { data: produccionesHoy }] =
    await Promise.all([
      supabase.from('fabrica_sabores').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_tamanios').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_presentaciones').select('id, nombre, peso_kg').eq('activo', true).order('orden'),
      supabase.from('config').select('value').eq('key', 'fabrica_rendimiento_masa').maybeSingle(),
      supabase
        .from('fabrica_producciones')
        .select(`
          id, fecha, turno, fecula_kg, masa_kg, sabor_id, destino, tamanio_id,
          sabor:fabrica_sabores(nombre),
          tamanio:fabrica_tamanios(nombre),
          fabrica_embolsados(id, presentacion_id, sabor_id, cantidad_kg,
            presentacion:fabrica_presentaciones(nombre, peso_kg),
            sabor:fabrica_sabores(nombre))
        `)
        .eq('fecha', hoy)
        .order('created_at', { ascending: false }),
    ])

  const rendimientoMasa = Number(configRow?.value ?? '2.5') || 2.5

  return (
    <ProduccionClient
      hoy={hoy}
      sabores={(sabores ?? []) as Parametro[]}
      tamanios={(tamanios ?? []) as Parametro[]}
      presentaciones={(presentaciones ?? []).map(p => ({ id: p.id, nombre: p.nombre, pesoKg: p.peso_kg }))}
      rendimientoMasa={rendimientoMasa}
      produccionesIniciales={((produccionesHoy ?? []) as any[]).map(p => ({
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
        embolsados: (p.fabrica_embolsados ?? []).map((e: any) => ({
          id: e.id,
          presentacionId: e.presentacion_id,
          presentacionNombre: e.presentacion?.nombre ?? '—',
          saborId: e.sabor_id,
          saborNombre: e.sabor?.nombre ?? '—',
          cantidadKg: e.cantidad_kg,
        })),
      })) as ProduccionTurno[]}
    />
  )
}
