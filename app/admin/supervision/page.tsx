export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cargarCatalogo, cargarUsuario, cargarVisitas } from '@/lib/supervision/datos'
import SupervisionClient, { type VistaSupervision } from '@/components/supervision/SupervisionClient'

export const metadata = { title: 'Supervisión de locales | YA! Chipacitos' }

const VISTAS: VistaSupervision[] = ['nueva', 'visitas', 'analisis', 'lugares']

// Checklist del Supervisor de locales: nueva visita, historial y análisis.
export default async function SupervisionPage({ searchParams }: { searchParams: Promise<{ vista?: string; aviso?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { vista, aviso } = await searchParams
  const [catalogo, { visitas, error }, usuario] = await Promise.all([
    cargarCatalogo(supabase), cargarVisitas(supabase), cargarUsuario(supabase, user.id),
  ])

  return (
    <SupervisionClient
      lugares={catalogo.lugares}
      esAdmin={usuario.esAdmin}
      bloques={catalogo.bloques}
      visitasIniciales={visitas}
      errorCarga={!!(error ?? catalogo.error)}
      nombreUsuario={usuario.nombre}
      vistaInicial={VISTAS.includes(vista as VistaSupervision) ? (vista as VistaSupervision) : 'nueva'}
      aviso={aviso === 'eliminada' ? 'Visita eliminada' : null}
    />
  )
}
