export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { bloquesDeVisita } from '@/lib/supervision/calculos'
import { SELECT_VISITA, cargarCatalogo, cargarEquipos, cargarRequerimientos, cargarUsuario } from '@/lib/supervision/datos'
import type { ResumenVisita, VisitaSupervision } from '@/lib/supervision/tipos'
import DetalleVisita from '@/components/supervision/DetalleVisita'

export const metadata = { title: 'Visita | Supervisión de locales' }

export default async function DetalleVisitaPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aviso?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ id }, { aviso }] = await Promise.all([params, searchParams])
  const [{ data }, catalogo, usuario, { requerimientos }] = await Promise.all([
    supabase.from('supervision_visitas').select(SELECT_VISITA).eq('id', id).maybeSingle(),
    cargarCatalogo(supabase),
    cargarUsuario(supabase, user.id),
    cargarRequerimientos(supabase, id),
  ])
  if (!data) notFound()
  const visita = data as VisitaSupervision

  // La visita cerrada anterior del lugar (la que se tomó para los pendientes), para la tendencia.
  const { data: anterior } = visita.anterior_id
    ? await supabase.from('supervision_visitas').select('id, fecha, resumen').eq('id', visita.anterior_id).maybeSingle()
    : { data: null }

  const lugar = catalogo.lugares.find(l => l.id === visita.lugar_id)
  const eq = lugar?.tipo === 'mayorista' ? await cargarEquipos(supabase) : null
  return (
    <DetalleVisita visita={visita} lugares={catalogo.lugares} bloques={bloquesDeVisita(visita, catalogo.bloques, lugar)} requerimientos={[...requerimientos].reverse()} equipos={eq?.equipos} esAdmin={usuario.esAdmin}
      anterior={anterior ? { id: anterior.id as string, fecha: anterior.fecha as string, pct: (anterior.resumen as ResumenVisita | null)?.pct ?? null } : null}
      aviso={aviso === 'cerrada' ? 'Visita cerrada' : null} />
  )
}
