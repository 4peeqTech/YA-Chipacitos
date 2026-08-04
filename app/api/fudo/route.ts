import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getFudoToken, fudoGet, normalizeJsonApi, getFudoCredentials } from '@/lib/fudo'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const sucursal = searchParams.get('sucursal') ?? ''
  const tipo = searchParams.get('tipo') ?? 'expenses'
  const desde = searchParams.get('desde') ?? new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const hasta = searchParams.get('hasta') ?? new Date().toISOString().split('T')[0]

  const { data: localConfig, error: configError } = await supabase
    .from('locales_config')
    .select('sucursal')
    .eq('sucursal', sucursal)
    .eq('activo', true)
    .single()

  if (configError || !localConfig) {
    return NextResponse.json({ error: `Sucursal "${sucursal}" no encontrada o inactiva` }, { status: 400 })
  }

  const credenciales = getFudoCredentials(sucursal)
  if (!credenciales) {
    return NextResponse.json({ error: `Sucursal "${sucursal}" sin credenciales Fudo configuradas` }, { status: 400 })
  }

  try {
    const token = await getFudoToken(credenciales.apiKey, credenciales.apiSecret)

    let path = ''
    if (tipo === 'expenses') {
      path = `/expenses?fields[expense]=amount,date,description,status,canceled`
            + `&fields[expenseCategory]=name&fields[provider]=name&fields[payment]=amount,paid_at,canceled&fields[paymentMethod]=name`
            + `&include=expenseCategory,provider,payments,payments.paymentMethod`
            + `&filter[date]=and(gte.${desde},lte.${hasta})`
            + `&page[size]=500&sort=-id`
    } else if (tipo === 'sales') {
      path = `/sales?fields[sale]=total,createdAt,closedAt,saleType,saleState`
            + `&fields[cashRegister]=name&fields[paymentMethod]=name`
            + `&include=cashRegister,payments,payments.paymentMethod`
            + `&filter[saleState]=in.(CLOSED)`
            + `&filter[createdAt]=and(gte.${desde}T00:00:00Z,lte.${hasta}T23:59:59Z)`
            + `&page[size]=500&sort=-id`
    } else if (tipo === 'payments') {
      path = `/payments?fields[payment]=amount,paidAt,canceled,receivedAmount`
            + `&fields[paymentMethod]=name`
            + `&include=paymentMethod`
            + `&filter[paidAt]=and(gte.${desde}T00:00:00Z,lte.${hasta}T23:59:59Z)`
            + `&page[size]=500&sort=-id`
    }

    const raw = await fudoGet(token, path) as Parameters<typeof normalizeJsonApi>[0]
    const items = normalizeJsonApi(raw)

    return NextResponse.json({ items, total: items.length, sucursal, tipo, desde, hasta })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
