import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getFudoToken, fudoGet, normalizeJsonApi, getFudoCredentials } from '@/lib/fudo'

class SinCredenciales extends Error {
  constructor() { super('La sucursal no tiene Fudo conectado.') }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  // Traer locales configurados
  const { data: locales } = await supabase
    .from('locales_config')
    .select('sucursal')
    .eq('activo', true)

  if (!locales?.length) return NextResponse.json({ items: [], errores: [] })

  // Los que ya se pagaron desde la app (Gastos › Pendientes de pago). Fudo los
  // sigue viendo impagos: el pago se anota acá, no allá.
  const { data: yaPagados, error: errPagados } = await supabase
    .from('fudo_gastos_pagados')
    .select('fudo_expense_id, sucursal')
  if (errPagados) return NextResponse.json({ error: 'No pudimos leer los pagos ya registrados.' }, { status: 500 })

  const pagadosSet = new Set(
    (yaPagados ?? []).map(p => `${p.sucursal}::${p.fudo_expense_id}`)
  )

  // Fetch paralelo a cada local
  const resultados = await Promise.allSettled(
    locales.map(async (local) => {
      const credenciales = getFudoCredentials(local.sucursal)
      if (!credenciales) throw new SinCredenciales()
      const token = await getFudoToken(credenciales.apiKey, credenciales.apiSecret)
      // Las relaciones van en fields[expense]: si no, el include no llega (JSON:API).
      const path = `/expenses?fields[expense]=amount,date,description,status,canceled,expenseCategory,provider,payments`
        + `&fields[expenseCategory]=name&fields[provider]=name&fields[payment]=amount,paymentMethod&fields[paymentMethod]=name`
        + `&include=expenseCategory,provider,payments.paymentMethod`
        + `&filter[status]=eq.UNPAID`
        + `&page[size]=500&sort=-id`
      const raw = await fudoGet(token, path) as Parameters<typeof normalizeJsonApi>[0]
      const items = normalizeJsonApi(raw)
      return items
        .filter(i => !pagadosSet.has(`${local.sucursal}::${i.id}`))
        .map(i => ({ ...i, sucursal: local.sucursal, _source: 'fudo' }))
    })
  )

  const items = resultados.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  // Una sucursal que no responde no tapa a las demás, pero la pantalla lo avisa.
  // sin_conexion = la sucursal no tiene Fudo configurado (no se arregla reintentando).
  const errores = resultados.flatMap((r, i) => r.status === 'rejected'
    ? [{
      sucursal: locales[i].sucursal,
      motivo: r.reason instanceof SinCredenciales ? 'sin_conexion' : 'error',
      error: r.reason instanceof Error ? r.reason.message : 'No respondió',
    }]
    : [])
  return NextResponse.json({ items, errores })
}
