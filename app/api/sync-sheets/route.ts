import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const SHEET_ID = '1oJiwMbjnrG6vUdtVFt19OjMFLFyTzCSu0y9aEKwdehQ'
const SHEET_NAME = 'BD'
const PREFIJOS_SUC = ['Suc.', 'Facultad']

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function toISO(ddmmyyyy: string): string | null {
  const [d, m, y] = (ddmmyyyy || '').split('/')
  if (!d || !m || !y || y.length !== 4) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function toSheet(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function parseNum(val: string | number): number {
  if (typeof val === 'number') return val
  return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0
}

function esSucursal(cliente: string): boolean {
  return PREFIJOS_SUC.some(p => cliente.startsWith(p))
}

export async function POST(req: NextRequest) {
  try {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { fechaDesde, fechaHasta } = await req.json()
  if (!fechaDesde || !fechaHasta) {
    return NextResponse.json({ error: 'Indicá fechaDesde y fechaHasta.' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'Falta GOOGLE_SHEETS_API_KEY en las variables de entorno. Seguí las instrucciones del setup.'
    }, { status: 400 })
  }

  // ── Fetch a Google Sheets API v4 ─────────────────────────────────────────────
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${apiKey}`

  let allValues: string[][]
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = err?.error?.message || `HTTP ${res.status}`
      return NextResponse.json({ error: `Error al leer el sheet: ${msg}` }, { status: 500 })
    }
    const data = await res.json()
    allValues = data.values || []
  } catch (e) {
    return NextResponse.json({
      error: `No se pudo conectar con Google Sheets: ${e instanceof Error ? e.message : String(e)}`
    }, { status: 500 })
  }

  if (allValues.length < 2) {
    return NextResponse.json({ importados: 0, porLocal: {}, noMapeados: [], mensaje: 'El sheet está vacío.' })
  }

  // Detectar índices de columnas por encabezado
  const headers = allValues[0].map(h => String(h).trim().toLowerCase())
  const idx = {
    idVenta:  headers.indexOf('idventa'),
    fecha:    headers.indexOf('fecha'),
    cliente:  headers.indexOf('cliente'),
    producto: headers.indexOf('producto'),
    unidades: headers.indexOf('unidades'),
    monto:    headers.findIndex(h => h.includes('monto bruto')),
  }

  // Validar encabezados
  const missing = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k)
  if (missing.length > 0) {
    return NextResponse.json({
      error: `No se encontraron las columnas: ${missing.join(', ')}. Verificá que la hoja se llame exactamente "BD".`
    }, { status: 400 })
  }

  // Filtrar por rango de fechas y sucursales
  const desdeParts = fechaDesde.split('-').map(Number)
  const hastaParts = fechaHasta.split('-').map(Number)
  const dDesde = new Date(desdeParts[0], desdeParts[1] - 1, desdeParts[2])
  const dHasta = new Date(hastaParts[0], hastaParts[1] - 1, hastaParts[2])

  const filasFiltradas = allValues.slice(1).filter(row => {
    const cliente = String(row[idx.cliente] || '').trim()
    if (!esSucursal(cliente)) return false

    const unidades = Number(row[idx.unidades]) || 0
    if (unidades <= 0) return false

    const fechaStr = String(row[idx.fecha] || '').trim()
    const iso = toISO(fechaStr)
    if (!iso) return false

    const [y, m, d] = iso.split('-').map(Number)
    const rowDate = new Date(y, m - 1, d)
    return rowDate >= dDesde && rowDate <= dHasta
  })

  if (!filasFiltradas.length) {
    const rango = fechaDesde === fechaHasta ? toSheet(fechaDesde) : `${toSheet(fechaDesde)} al ${toSheet(fechaHasta)}`
    return NextResponse.json({
      importados: 0, porLocal: {}, noMapeados: [],
      mensaje: `No hay ventas de sucursales del ${rango}.`
    })
  }

  // Mapear locales
  const admin = getAdmin()
  const { data: locales } = await admin
    .from('profiles').select('id, nombre, local_nombre').eq('rol', 'local')

  function matchLocal(cliente: string) {
    if (!locales) return null
    return locales.find(l => l.local_nombre === cliente)
      || locales.find(l => l.local_nombre && (
        cliente.includes(l.local_nombre) || l.local_nombre.includes(cliente)
      )) || null
  }

  const noMapeados: string[] = []
  const porLocal: Record<string, number> = {}
  const registros: Record<string, unknown>[] = []

  for (const row of filasFiltradas) {
    const idVenta  = String(row[idx.idVenta]  || '').trim()
    const cliente  = String(row[idx.cliente]  || '').trim()
    const producto = String(row[idx.producto] || '').trim()
    const unidades = Number(row[idx.unidades]) || 0
    const monto    = parseNum(row[idx.monto])
    const fechaIso = toISO(String(row[idx.fecha] || '').trim())

    if (!idVenta || !fechaIso) continue

    const local = matchLocal(cliente)
    if (!local) {
      if (!noMapeados.includes(cliente)) noMapeados.push(cliente)
      continue
    }

    registros.push({
      id_externo: idVenta, local_id: local.id,
      local_nombre: cliente, fecha: fechaIso,
      producto_nombre: producto, cantidad: unidades,
      importe: monto, archivo_origen: 'Google Sheets (live)',
    })
    const key = local.local_nombre || local.nombre
    porLocal[key] = (porLocal[key] || 0) + 1
  }

  const fechasUnicas = [...new Set(registros.map(r => r.fecha as string))]
  const localIdsVentas = [...new Set(registros.map(r => r.local_id as string))]

  // También incluir locales que tienen pedidos en el período (aunque no tengan ventas Posberry)
  // Pedidos en el período — offset Argentina UTC-3, sin filtro de estado
  const hastaNextDay = new Date(fechaHasta)
  hastaNextDay.setDate(hastaNextDay.getDate() + 1)
  const hastaUTC = `${hastaNextDay.toISOString().split('T')[0]}T03:00:00`

  const { data: pedidosEnPeriodo } = await admin
    .from('pedidos')
    .select('local_id, created_at')
    .gte('created_at', `${fechaDesde}T03:00:00`)
    .lte('created_at', hastaUTC)

  const localIdsPedidos = [...new Set((pedidosEnPeriodo || []).map(p => p.local_id as string))]
  const localIds = [...new Set([...localIdsVentas, ...localIdsPedidos])]

  // Convertir created_at UTC → fecha Argentina para cada pedido
  const fechasPedidos = [...new Set((pedidosEnPeriodo || []).map(p => {
    const dt = new Date(p.created_at as string)
    dt.setHours(dt.getHours() - 3)
    return dt.toISOString().split('T')[0]
  }))]
  const todasFechas = [...new Set([...fechasUnicas, ...fechasPedidos])]

  // Borrar en paralelo (un DELETE por local que cubre todas sus fechas del rango)
  await Promise.all(
    localIdsVentas.map(lid =>
      admin.from('ventas_posberry')
        .delete()
        .eq('local_id', lid)
        .eq('archivo_origen', 'Google Sheets (live)')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
    )
  )

  // Deduplicar por id_externo (el sheet puede tener filas repetidas)
  const vistos = new Set<string>()
  const registrosUnicos = registros.filter(r => {
    const id = r.id_externo as string
    if (vistos.has(id)) return false
    vistos.add(id)
    return true
  })

  let importados = 0
  if (registrosUnicos.length > 0) {
    const { error } = await admin
      .from('ventas_posberry')
      .insert(registrosUnicos)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    importados = registrosUnicos.length
  }

  // Recalcular conciliación para TODOS los locales × TODAS las fechas del rango
  await Promise.all(
    localIds.flatMap(lid =>
      todasFechas.map(f =>
        admin.rpc('recalcular_conciliacion', { p_fecha: f, p_local_id: lid })
      )
    )
  )

  const rango = fechaDesde === fechaHasta
    ? toSheet(fechaDesde)
    : `${toSheet(fechaDesde)} al ${toSheet(fechaHasta)}`

  return NextResponse.json({
    importados, porLocal, noMapeados,
    fechasCubiertas: fechasUnicas.length,
    mensaje: `✅ ${importados} ventas sincronizadas — ${rango}.`,
  })

  } catch (err: unknown) {
    console.error('[sync-sheets] Error no manejado:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Error interno: ${msg}` }, { status: 500 })
  }
}

export async function GET() {
  const keyOk = !!process.env.GOOGLE_SHEETS_API_KEY
  return NextResponse.json({ configurado: keyOk })
}
