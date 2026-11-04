export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SELECT_VISITA, cargarCatalogo } from '@/lib/supervision/datos'
import type { VisitaSupervision } from '@/lib/supervision/tipos'
import ChecklistVisita from '@/components/supervision/ChecklistVisita'

export const metadata = { title: 'Checklist | Supervisión de locales' }

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const [{ data: visita }, catalogo] = await Promise.all([
    supabase.from('supervision_visitas').select(SELECT_VISITA).eq('id', id).maybeSingle(),
    cargarCatalogo(supabase),
  ])
  if (!visita) notFound()

  const sucursal = catalogo.sucursales.find(s => s.id === visita.sucursal_id)?.nombre ?? visita.sucursal_id
  return <ChecklistVisita inicial={visita as VisitaSupervision} sucursal={sucursal} bloques={catalogo.bloques} />
}
