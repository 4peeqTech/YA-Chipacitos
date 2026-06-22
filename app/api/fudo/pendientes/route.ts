import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getFudoToken, fudoGet, normalizeJsonApi } from '@/lib/fudo'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  // Traer locales configurados
  const { data: locales } = await supabase
    .from('locales_config')
    .select('sucursal, fudo_api_key, fudo_api_secret')
    .eq('activo', true)

  if (!locales?.length) return NextResponse.json([])

  // Traer IDs ya pagados en nuestro sistema
  const { data: yaPagados } = await supabase
    .from('fudo_pagos')
    .select('fudo_expense_id, sucursal')

  const pagadosSet = new Set(
    (yaPagados ?? []).map(p => `${p.sucursal}::${p.fudo_expense_id}`)
  )

  // Fetch paralelo a cada local
  const resultados = await Promise.allSettled(
    locales.map(async (local) => {
      const token = await getFudoToken(local.fudo_api_key!, local.fudo_api_secret!)
      const path = `/expenses?fields[expense]=amount,date,description,status,canceled`
        + `&fields[expenseCategory]=name&fields[provider]=name&fields[paymentMethod]=name`
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

  const todos = resultados.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  return NextResponse.json(todos)
}
