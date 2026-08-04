import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getFudoToken, fudoGet, normalizeJsonApi, getFudoCredentials } from '@/lib/fudo'

interface FilaDetalle {
  fuente: 'Posberry' | 'Fudo'
  sucursal: string
  fecha: string
  descripcion: string
  monto: number
}

interface FilaResumen {
  nombre: string
  posberry: { monto: number; ventas: number } | null
  fudo: { monto: number; ventas: number } | null
  fudoError?: string
}

// Normaliza nombres de sucursal para poder cruzar "YA! CORDOBA" (Fudo)
// con "Suc. Cordoba" (Posberry) — mismo criterio que matchLocal() en
// app/api/sync-sheets/route.ts.
function normalizarNombre(s: string): string {
  return s.replace(/^\s*(ya!|suc\.?)\s*/i, '').trim().toUpperCase()
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

  const [{ data: locales }, { data: ventasPosberry, error: posberryError }] = await Promise.all([
    supabase.from('locales_config').select('sucursal').eq('activo', true),
    supabase
      .from('ventas_posberry')
      .select('local_id, local_nombre, fecha, producto_nombre, cantidad, importe, profiles(local_nombre)')
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ])

  if (posberryError) return NextResponse.json({ error: posberryError.message }, { status: 500 })

  // ── Posberry: agrupar por local ──────────────────────────────────────────
  const posberryPorLocal = new Map<string, { nombre: string; monto: number; ventas: number }>()
  const detallePosberry: FilaDetalle[] = []

  for (const v of ventasPosberry ?? []) {
    const perfil = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles
    const nombre = (perfil as { local_nombre: string | null } | null)?.local_nombre || v.local_nombre || 'Sin nombre'
    const key = normalizarNombre(nombre)
    const prev = posberryPorLocal.get(key) ?? { nombre, monto: 0, ventas: 0 }
    prev.monto += v.importe ?? 0
    prev.ventas += 1
    posberryPorLocal.set(key, prev)

    detallePosberry.push({
      fuente: 'Posberry',
      sucursal: nombre,
      fecha: v.fecha,
      descripcion: `${v.producto_nombre} (${v.cantidad})`,
      monto: v.importe ?? 0,
    })
  }

  // ── Fudo: una consulta por sucursal activa, en paralelo ──────────────────
  const resultadosFudo = await Promise.all(
    (locales ?? []).map(async (local) => {
      const credenciales = getFudoCredentials(local.sucursal)
      if (!credenciales) {
        return { sucursal: local.sucursal, error: 'Sin credenciales Fudo configuradas' as string | null, monto: 0, ventas: 0, detalle: [] as FilaDetalle[] }
      }
      try {
        const token = await getFudoToken(credenciales.apiKey, credenciales.apiSecret)
        const path = `/sales?fields[sale]=total,createdAt,saleType,saleState`
          + `&fields[cashRegister]=name&include=cashRegister`
          + `&filter[saleState]=in.(CLOSED)`
          + `&filter[createdAt]=and(gte.${desde}T00:00:00Z,lte.${hasta}T23:59:59Z)`
          + `&page[size]=500&sort=-id`
        const raw = await fudoGet(token, path) as Parameters<typeof normalizeJsonApi>[0]
        const items = normalizeJsonApi(raw)
        const monto = items.reduce((s, it) => s + Number(it.total ?? 0), 0)
        const detalle: FilaDetalle[] = items.map(it => ({
          fuente: 'Fudo',
          sucursal: local.sucursal,
          fecha: String(it.createdAt ?? '').slice(0, 10),
          descripcion: String(it.saleType ?? 'Venta'),
          monto: Number(it.total ?? 0),
        }))
        return { sucursal: local.sucursal, error: null, monto, ventas: items.length, detalle }
      } catch (err: unknown) {
        return { sucursal: local.sucursal, error: err instanceof Error ? err.message : 'Error desconocido', monto: 0, ventas: 0, detalle: [] as FilaDetalle[] }
      }
    })
  )

  const detalleFudo = resultadosFudo.flatMap(r => r.detalle)

  // ── Merge resumen por local (normalizado) ────────────────────────────────
  const resumenMap = new Map<string, FilaResumen>()

  for (const [key, p] of posberryPorLocal) {
    resumenMap.set(key, { nombre: p.nombre, posberry: { monto: p.monto, ventas: p.ventas }, fudo: null })
  }
  for (const r of resultadosFudo) {
    const key = normalizarNombre(r.sucursal)
    const prev: FilaResumen = resumenMap.get(key) ?? { nombre: r.sucursal, posberry: null, fudo: null }
    prev.fudo = r.error ? null : { monto: r.monto, ventas: r.ventas }
    if (r.error) prev.fudoError = r.error
    resumenMap.set(key, prev)
  }

  const resumen = [...resumenMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const detalle = [...detallePosberry, ...detalleFudo].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return NextResponse.json({ desde, hasta, resumen, detalle })
}
