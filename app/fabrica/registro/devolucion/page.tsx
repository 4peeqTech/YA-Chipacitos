export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { diaFabrica, diaAnterior } from '@/lib/fabrica/diaFabrica'
import DevolucionClient, { Parametro, DevolucionRegistro } from './DevolucionClient'

export default async function FabricaDevolucionPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>
}) {
  const supabase = await createClient()

  const hoy = diaFabrica(new Date())
  const ayer = diaAnterior(hoy)
  const dia = (await searchParams).dia || hoy

  const [{ data: sabores }, { data: tamanios }, { data: presentaciones }, { data: motivos }, { data: devoluciones }] =
    await Promise.all([
      supabase.from('fabrica_sabores').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_tamanios').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_presentaciones').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('fabrica_devolucion_motivos').select('id, nombre').eq('activo', true).order('orden'),
      supabase
        .from('fabrica_devoluciones')
        .select(`
          id, fecha, cantidad_kg, destino, notas,
          sabor:fabrica_sabores(nombre),
          tamanio:fabrica_tamanios(nombre),
          presentacion:fabrica_presentaciones(nombre),
          motivo:fabrica_devolucion_motivos(nombre)
        `)
        .eq('fecha', dia)
        .order('created_at', { ascending: false }),
    ])

  return (
    <DevolucionClient
      key={dia}
      dia={dia}
      hoy={hoy}
      ayer={ayer}
      sabores={(sabores ?? []) as Parametro[]}
      tamanios={(tamanios ?? []) as Parametro[]}
      presentaciones={(presentaciones ?? []) as Parametro[]}
      motivos={(motivos ?? []) as Parametro[]}
      devolucionesIniciales={((devoluciones ?? []) as any[]).map(d => ({
        id: d.id,
        fecha: d.fecha,
        cantidadKg: d.cantidad_kg,
        destino: d.destino,
        notas: d.notas,
        saborNombre: d.sabor?.nombre ?? '—',
        tamanioNombre: d.tamanio?.nombre ?? '—',
        presentacionNombre: d.presentacion?.nombre ?? '—',
        motivoNombre: d.motivo?.nombre ?? '—',
      })) as DevolucionRegistro[]}
    />
  )
}
