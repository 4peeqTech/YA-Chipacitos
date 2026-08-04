import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getFudoToken, fudoGet, normalizeJsonApi, getFudoCredentials } from '@/lib/fudo'

interface FilaCaja {
  sucursal: string
  caja: string
  ventas: number
  monto: number
  saldo?: number
  estado?: string
}

const RE_SALDO = /balance|amount|saldo/i
const RE_ESTADO = /status|state|abiert|open/i

// La API de Fudo no documenta públicamente el recurso de cajas (cash
// registers) fuera de la relación `cashRegister` en /sales. Probamos el
// recurso standalone /cashRegisters y, si no existe o no trae campos
// reconocibles de saldo/estado, nos quedamos con lo que siempre funciona:
// las ventas de /sales agrupadas por caja.
async function fetchCashRegistersInfo(token: string): Promise<Map<string, { saldo?: number; estado?: string }>> {
  const info = new Map<string, { saldo?: number; estado?: string }>()
  try {
    const raw = await fudoGet(token, '/cashRegisters?page[size]=100') as Parameters<typeof normalizeJsonApi>[0]
    const items = normalizeJsonApi(raw)
    for (const item of items) {
      const nombre = String(item.name ?? item.id)
      const entry: { saldo?: number; estado?: string } = {}
      for (const [key, value] of Object.entries(item)) {
        if (entry.saldo === undefined && RE_SALDO.test(key) && typeof value === 'number') entry.saldo = value
        if (entry.estado === undefined && RE_ESTADO.test(key) && (typeof value === 'string' || typeof value === 'boolean')) {
          entry.estado = typeof value === 'boolean' ? (value ? 'Abierta' : 'Cerrada') : value
        }
      }
      info.set(nombre, entry)
    }
  } catch {
    // Recurso no disponible en esta cuenta/plan: seguimos solo con /sales.
  }
  return info
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const hoy = new Date().toISOString().split('T')[0]
  const desde = searchParams.get('desde') ?? hoy
  const hasta = searchParams.get('hasta') ?? hoy

  const { data: locales } = await supabase
    .from('locales_config')
    .select('sucursal')
    .eq('activo', true)

  let cajasInfoDisponible = false

  const porSucursal = await Promise.all(
    (locales ?? []).map(async (local) => {
      const credenciales = getFudoCredentials(local.sucursal)
      if (!credenciales) {
        return { sucursal: local.sucursal, error: 'Sin credenciales Fudo configuradas', filas: [] as FilaCaja[] }
      }
      try {
        const token = await getFudoToken(credenciales.apiKey, credenciales.apiSecret)

        const [infoCajas, rawVentas] = await Promise.all([
          fetchCashRegistersInfo(token),
          fudoGet(token, `/sales?fields[sale]=total,createdAt,saleState`
            + `&fields[cashRegister]=name&include=cashRegister`
            + `&filter[saleState]=in.(CLOSED)`
            + `&filter[createdAt]=and(gte.${desde}T00:00:00Z,lte.${hasta}T23:59:59Z)`
            + `&page[size]=500&sort=-id`) as Promise<Parameters<typeof normalizeJsonApi>[0]>,
        ])

        if (infoCajas.size > 0) cajasInfoDisponible = true

        const ventas = normalizeJsonApi(rawVentas)
        const porCaja = new Map<string, { ventas: number; monto: number }>()
        for (const v of ventas) {
          const caja = v.cashRegister as Record<string, unknown> | null
          const nombre = caja?.name ? String(caja.name) : 'Sin caja asignada'
          const prev = porCaja.get(nombre) ?? { ventas: 0, monto: 0 }
          prev.ventas += 1
          prev.monto += Number(v.total ?? 0)
          porCaja.set(nombre, prev)
        }

        // Unión de cajas vistas en ventas + cajas conocidas por el recurso standalone
        const nombresCajas = new Set([...porCaja.keys(), ...infoCajas.keys()])
        const filas: FilaCaja[] = [...nombresCajas].map(nombre => ({
          sucursal: local.sucursal,
          caja: nombre,
          ventas: porCaja.get(nombre)?.ventas ?? 0,
          monto: porCaja.get(nombre)?.monto ?? 0,
          ...infoCajas.get(nombre),
        }))

        return { sucursal: local.sucursal, error: null, filas }
      } catch (err: unknown) {
        return { sucursal: local.sucursal, error: err instanceof Error ? err.message : 'Error desconocido', filas: [] as FilaCaja[] }
      }
    })
  )

  const filas = porSucursal.flatMap(r => r.filas).sort((a, b) => a.sucursal.localeCompare(b.sucursal) || a.caja.localeCompare(b.caja))
  const errores = porSucursal.filter(r => r.error).map(r => ({ sucursal: r.sucursal, error: r.error as string }))

  return NextResponse.json({ desde, hasta, filas, errores, cajasInfoDisponible })
}
