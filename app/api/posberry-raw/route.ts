import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const SHEET_ID   = '1oJiwMbjnrG6vUdtVFt19OjMFLFyTzCSu0y9aEKwdehQ'
const SHEET_NAME = 'BD'

function toISO(ddmmyyyy: string): string | null {
  const [d, m, y] = (ddmmyyyy || '').split('/')
  if (!d || !m || !y || y.length !== 4) return null
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

function parseNum(val: string | number): number {
  if (typeof val === 'number') return val
  return parseFloat(String(val).replace(/\./g,'').replace(',','.')) || 0
}

export async function GET(req: NextRequest) {
  // Auth: solo admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Falta GOOGLE_SHEETS_API_KEY' }, { status: 400 })

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${apiKey}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: err?.error?.message || `HTTP ${res.status}` }, { status: 500 })
  }

  const json = await res.json()
  const rows: string[][] = json.values || []
  if (rows.length < 2) return NextResponse.json({ filas: [], headers: [] })

  const rawHeaders = rows[0].map((h: string) => String(h).trim())
  const headers    = rawHeaders.map(h => h.toLowerCase())

  // Detectar columnas dinámicamente
  const idx = {
    idVenta:   headers.indexOf('idventa'),
    idCliente: headers.findIndex(h => h.includes('idcliente') || h === 'id cliente'),
    fecha:     headers.indexOf('fecha'),
    cliente:   headers.indexOf('cliente'),
    direccion: headers.findIndex(h => h.includes('domicilio') || h.includes('direcci')),
    producto:  headers.indexOf('producto'),
    unidades:  headers.indexOf('unidades'),
    monto:     headers.findIndex(h => h.includes('monto bruto')),
  }

  const { searchParams } = new URL(req.url)
  const desde   = searchParams.get('desde')
  const hasta   = searchParams.get('hasta')

  const filas = rows.slice(1)
    .filter(row => {
      if (!row[idx.idVenta] && !row[idx.cliente]) return false
      if (desde || hasta) {
        const iso = toISO(String(row[idx.fecha] || ''))
        if (!iso) return false
        if (desde && iso < desde) return false
        if (hasta && iso > hasta) return false
      }
      return true
    })
    .map(row => ({
      idVenta:   String(row[idx.idVenta]   || '').trim(),
      idCliente: idx.idCliente >= 0 ? String(row[idx.idCliente] || '').trim() : '',
      fecha:     toISO(String(row[idx.fecha] || '')) || String(row[idx.fecha] || ''),
      cliente:   String(row[idx.cliente]   || '').trim(),
      direccion: idx.direccion >= 0 ? String(row[idx.direccion] || '').trim() : '',
      producto:  String(row[idx.producto]  || '').trim(),
      unidades:  Number(row[idx.unidades]) || 0,
      monto:     idx.monto >= 0 ? parseNum(row[idx.monto]) : 0,
    }))
    .filter(r => r.idVenta || r.cliente)

  // Columnas originales para mostrar al usuario
  const columnasExtras = rawHeaders.filter((_, i) =>
    ![idx.idVenta,idx.fecha,idx.cliente,idx.direccion,idx.producto,idx.unidades,idx.monto].includes(i)
  )

  return NextResponse.json({ filas, total: filas.length, columnasExtras })
}
