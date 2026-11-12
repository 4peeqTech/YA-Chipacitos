export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { bloquesDeVisita, catalogoDeTipo } from '@/lib/supervision/calculos'
import { SELECT_VISITA, cargarCatalogo, cargarEquipos, cargarRequerimientos } from '@/lib/supervision/datos'
import type { VisitaSupervision } from '@/lib/supervision/tipos'
import ChecklistVisita from '@/components/supervision/ChecklistVisita'

export const metadata = { title: 'Checklist | Supervisión de locales' }

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const [{ data }, catalogo, { requerimientos }] = await Promise.all([
    supabase.from('supervision_visitas').select(SELECT_VISITA).eq('id', id).maybeSingle(),
    cargarCatalogo(supabase),
    cargarRequerimientos(supabase, id),
  ])
  if (!data) notFound()
  const visita = data as VisitaSupervision

  // Los ítems de esta visita: los que se mostraron al iniciarla (o, en las
  // anteriores a la v2, el catálogo del lugar).
  const lugar = catalogo.lugares.find(l => l.id === visita.lugar_id)
  // Mayoristas: sus equipos de Ya! en uso, los parámetros y el catálogo completo
  // (los ítems se recalculan si se corrige la ficha durante la visita).
  const eq = lugar?.tipo === 'mayorista' ? await cargarEquipos(supabase) : null
  return <ChecklistVisita inicial={visita} sucursal={lugar?.nombre ?? visita.lugar_id}
    bloques={bloquesDeVisita(visita, catalogo.bloques, lugar)}
    requerimientos={lugar?.tipo === 'mayorista' ? null : [...requerimientos].reverse()}
    parametros={eq?.parametros}
    mayorista={lugar && eq ? {
      lugar,
      equipos: eq.equipos.filter(e => e.lugar_id === lugar.id && e.situacion === 'en_uso'),
      catalogo: catalogoDeTipo(catalogo.bloques, 'mayorista'),
    } : undefined} />
}
