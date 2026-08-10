export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { diaFabrica, diaAnterior } from '@/lib/fabrica/diaFabrica'
import type { ProduccionCongelado, EmbolsadoLinea } from '@/lib/fabrica/pools'
import EmbolsadoClient, { Parametro, PresentacionParam } from './EmbolsadoClient'

export default async function FabricaEmbolsadoPage() {
  const supabase = await createClient()

  const hoy = diaFabrica(new Date())
  const ayer = diaAnterior(hoy)

  const [{ data: sabores }, { data: tamanios }, { data: presentaciones }, { data: producciones }, { data: embolsados }] =
    await Promise.all([
      supabase.from('fabrica_sabores').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_tamanios').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_presentaciones').select('id, nombre, peso_kg').eq('activo', true).order('orden'),
      supabase
        .from('fabrica_producciones')
        .select(`
          fecha, turno, masa_kg, sabor_id, tamanio_id,
          sabor:fabrica_sabores(nombre),
          tamanio:fabrica_tamanios(nombre)
        `)
        .eq('destino', 'congelado_embolsado')
        .in('fecha', [ayer, hoy]),
      supabase
        .from('fabrica_embolsados')
        .select(`
          id, fecha, tamanio_id, sabor_id, presentacion_id, cantidad_kg,
          presentacion:fabrica_presentaciones(nombre)
        `)
        .in('fecha', [ayer, hoy]),
    ])

  const produccionesUI: ProduccionCongelado[] = ((producciones ?? []) as any[]).map(p => ({
    fecha: p.fecha,
    turno: p.turno,
    masaKg: p.masa_kg,
    saborId: p.sabor_id,
    saborNombre: p.sabor?.nombre ?? '—',
    tamanioId: p.tamanio_id,
    tamanioNombre: p.tamanio?.nombre ?? '—',
  }))

  const embolsadosUI: EmbolsadoLinea[] = ((embolsados ?? []) as any[]).map(e => ({
    id: e.id,
    fecha: e.fecha,
    tamanioId: e.tamanio_id,
    saborId: e.sabor_id,
    presentacionId: e.presentacion_id,
    presentacionNombre: e.presentacion?.nombre ?? '—',
    cantidadKg: e.cantidad_kg,
  }))

  return (
    <EmbolsadoClient
      hoy={hoy}
      ayer={ayer}
      sabores={(sabores ?? []) as Parametro[]}
      tamanios={(tamanios ?? []) as Parametro[]}
      presentaciones={(presentaciones ?? []).map(p => ({ id: p.id, nombre: p.nombre, pesoKg: p.peso_kg }))}
      produccionesIniciales={produccionesUI}
      embolsadosIniciales={embolsadosUI}
    />
  )
}
