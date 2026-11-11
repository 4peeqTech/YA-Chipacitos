import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { hoyISOArgentina } from '@/lib/fechas'
import { POR_PAGINA, leerFiltros, paramsDeFiltros } from '@/lib/gastos/modelo'
import GastosClient from './GastosClient'
import {
  consultarCatalogosPago, consultarCuentasGastos, consultarEstadoFudo, consultarGasto, consultarLocales, generarRecurrentes, listarGastos,
  pedidosDeFacturas,
} from './datos'

export const metadata = {
  title: 'Gastos | YA! Chipacitos',
  description: 'Gastos del negocio por local: cargalos, pagalos y seguilos.',
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const hoy = hoyISOArgentina()
  const filtros = leerFiltros(params, hoy)
  const gastoParam = typeof params.gasto === 'string' ? params.gasto : undefined

  // Los que se repiten y ya tocan se crean antes de listar.
  await generarRecurrentes(supabase)

  const [lista, { data: proveedores }, catalogos, locales, fudo, cuentas] = await Promise.all([
    listarGastos(supabase, filtros),
    // Todos: un gasto de un proveedor archivado tiene que mostrarlo (B3, E19).
    supabase.from('proveedores').select('id, nombre, estado').order('nombre'),
    consultarCatalogosPago(supabase),
    consultarLocales(supabase),
    consultarEstadoFudo(supabase),
    consultarCuentasGastos(supabase),
  ])

  // Una página que ya no existe (se borraron gastos, o la URL es vieja): a la última.
  if (lista.filas.length === 0 && lista.cantidad > 0 && filtros.pagina > 1) {
    const ultima = Math.ceil(lista.cantidad / POR_PAGINA)
    const qs = paramsDeFiltros({ ...filtros, pagina: ultima }, hoy)
    redirect(qs ? `/admin/gastos?${qs}` : '/admin/gastos')
  }

  // El gasto que pide el link (?gasto=) puede no estar en esta página.
  const gastoSuelto = gastoParam && !lista.filas.some(g => g.id === gastoParam)
    ? await consultarGasto(supabase, gastoParam)
    : null
  const filas = gastoSuelto ? [...lista.filas, gastoSuelto] : lista.filas

  return (
    <GastosClient
      gastos={lista.filas}
      gastoSuelto={gastoSuelto}
      cantidad={lista.cantidad}
      resumen={lista.resumen}
      filtros={filtros}
      hoy={hoy}
      error={lista.error != null}
      proveedores={proveedores ?? []}
      cajas={catalogos.cajas}
      formasPago={catalogos.formasPago}
      localesCarga={locales}
      pedidoDeFactura={await pedidosDeFacturas(supabase, filas)}
      gastoInicial={gastoParam}
      fudo={fudo}
      cuentas={cuentas}
    />
  )
}
