import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GastosClient from './GastosClient'
import { consultarCatalogosPago } from './datos'

export const metadata = {
  title: 'Gastos | YA! Chipacitos',
  description: 'Gastos del negocio por local: cargalos, pagalos y seguilos.',
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ gasto?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { gasto } = await searchParams

  const [{ data: gastos }, { data: proveedores }, catalogos] = await Promise.all([
    // La vista pide es_admin(): cualquier otro rol recibe una lista vacía.
    supabase.from('v_gastos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre'),
    consultarCatalogosPago(supabase),
  ])

  // Para linkear el pedido de los gastos que salieron de una factura (v_gastos
  // trae solo su número). Solo las facturas de estos gastos, en tandas: la
  // lista de ids va en la URL y no puede crecer sin límite.
  const facturaIds = [...new Set((gastos ?? []).map(g => g.factura_id).filter((id): id is string => !!id))]
  const TANDA = 100
  const tandas = await Promise.all(
    Array.from({ length: Math.ceil(facturaIds.length / TANDA) }, (_, i) =>
      supabase.from('compras_facturas').select('id, pedido_id').in('id', facturaIds.slice(i * TANDA, (i + 1) * TANDA))),
  )
  const pedidoDeFactura = Object.fromEntries(tandas.flatMap(t => t.data ?? []).map(f => [f.id, f.pedido_id]))

  return (
    <GastosClient
      gastos={gastos ?? []}
      proveedores={proveedores ?? []}
      cajas={catalogos.cajas}
      formasPago={catalogos.formasPago}
      pedidoDeFactura={pedidoDeFactura}
      gastoInicial={gasto}
    />
  )
}
