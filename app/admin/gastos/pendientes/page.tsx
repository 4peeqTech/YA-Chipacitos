import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { hoyISOArgentina } from '@/lib/fechas'
import { leerFiltrosPendientes, paramsDePendientes } from '@/lib/gastos/modelo'
import PendientesClient from './PendientesClient'
import { consultarCatalogosPago, consultarEstadoFudo, consultarLocales, consultarPendientes } from '../datos'

export const metadata = {
  title: 'Pendientes de pago | YA! Chipacitos',
}

export default async function PendientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const filtros = leerFiltrosPendientes(await searchParams)
  const conFiltros = paramsDePendientes({ ...filtros, orden: 'viejos' }) !== ''

  const [pendientes, todos, catalogos, locales, fudo] = await Promise.all([
    consultarPendientes(supabase, filtros),
    // Los números de arriba son todo lo que se debe, sin filtros.
    conFiltros ? supabase.rpc('gastos_pendientes_resumen', {}) : Promise.resolve(null),
    consultarCatalogosPago(supabase),
    consultarLocales(supabase),
    consultarEstadoFudo(supabase),
  ])
  const filasTotales = todos?.data
    ? todos.data.map(g => ({ cantidad: Number(g.cantidad), total: Number(g.total), vencidos: Number(g.vencidos) }))
    : pendientes.grupos
  const totales = {
    cantidad: filasTotales.reduce((s, g) => s + g.cantidad, 0),
    total: Math.round(filasTotales.reduce((s, g) => s + g.total, 0) * 100) / 100,
    vencidos: filasTotales.reduce((s, g) => s + g.vencidos, 0),
  }

  return (
    <PendientesClient
      grupos={pendientes.grupos}
      totales={totales}
      filtros={filtros}
      hoy={hoyISOArgentina()}
      error={pendientes.error != null}
      cajas={catalogos.cajas}
      formasPago={catalogos.formasPago}
      locales={locales}
      fudo={fudo}
    />
  )
}
