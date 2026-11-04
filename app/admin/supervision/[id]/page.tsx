export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SELECT_VISITA, cargarCatalogo, cargarUsuario } from '@/lib/supervision/datos'
import type { VisitaSupervision } from '@/lib/supervision/tipos'
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
  const [{ data: visita }, catalogo, usuario] = await Promise.all([
    supabase.from('supervision_visitas').select(SELECT_VISITA).eq('id', id).maybeSingle(),
    cargarCatalogo(supabase),
    cargarUsuario(supabase, user.id),
  ])
  if (!visita) notFound()

  return (
    <DetalleVisita visita={visita as VisitaSupervision} sucursales={catalogo.sucursales} bloques={catalogo.bloques}
      esAdmin={usuario.esAdmin} aviso={aviso === 'cerrada' ? 'Visita cerrada' : null} />
  )
}
