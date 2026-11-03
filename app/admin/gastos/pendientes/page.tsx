import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { hoyISOArgentina } from '@/lib/fechas'
import { leerFiltrosPendientes, paramsDePendientes } from '@/lib/gastos/modelo'
import PendientesClient from './PendientesClient'
import { consultarCatalogosPago, consultarLocales, consultarPendientes } from '../datos'

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

  // Los de Fudo los trae el cliente (API externa, lenta): la página no espera por ellos.
  const [pendientes, todos, { data: pagadosFudo }, catalogos, locales] = await Promise.all([
    consultarPendientes(supabase, filtros),
    // El número de arriba es todo lo que se debe, sin filtros (como antes).
    conFiltros
      ? supabase.rpc('gastos_pendientes_resumen', {})
      : Promise.resolve(null),
    supabase.from('v_fudo_gastos_pagados').select('*').order('created_at', { ascending: false }).limit(200),
    consultarCatalogosPago(supabase),
    consultarLocales(supabase),
  ])
  const sinFiltro = todos?.data
    ? { cantidad: todos.data.reduce((s, g) => s + Number(g.cantidad), 0), total: todos.data.reduce((s, g) => s + Number(g.total), 0) }
    : { cantidad: pendientes.grupos.reduce((s, g) => s + g.cantidad, 0), total: pendientes.grupos.reduce((s, g) => s + g.total, 0) }

  return (
    <PendientesClient
      grupos={pendientes.grupos}
      totalApp={sinFiltro}
      filtros={filtros}
      hoy={hoyISOArgentina()}
      error={pendientes.error != null}
      pagadosFudo={pagadosFudo ?? []}
      cajas={catalogos.cajas}
      formasPago={catalogos.formasPago}
      locales={locales}
    />
  )
}
