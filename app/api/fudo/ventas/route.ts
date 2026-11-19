import { cargarAcceso } from '@/lib/permisos/servidor'
import { NextRequest, NextResponse } from 'next/server'
import { createClientTipado } from '@/lib/supabase/server'
import { fudoGet, getFudoCredentials, getFudoToken, olvidarFudoToken } from '@/lib/fudo'
import {
  PEDIR_ESPERA, filtroDiasArgentina, movimientosDePaginas, resumirVentas, validarPeriodo, ventasDePaginas, type PaginaFudo,
} from '@/lib/fudoVentas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/fudo/ventas?local=&desde=&hasta=&tipo=ventas|caja[&solo=totales]
// Las ventas cerradas (o los cobros y pagos) de UN local en el período, con
// todas las páginas: la pantalla pide los locales de a uno para mostrar el
// avance y no pasar el tiempo máximo de una función. Solo lee Fudo.

const TAM_PAGINA = 500
/** 60 páginas = 30.000 registros: un local grande hace ~4.000 ventas por mes. */
const MAX_PAGINAS = 60

export async function GET(req: NextRequest) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { acceso } = await cargarAcceso()
  if (!acceso?.esAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const q = new URL(req.url).searchParams
  const local = q.get('local') ?? ''
  const desde = q.get('desde') ?? ''
  const hasta = q.get('hasta') ?? ''
  const tipo = q.get('tipo') === 'caja' ? 'caja' : 'ventas'
  const soloTotales = q.get('solo') === 'totales'

  const problema = validarPeriodo(desde, hasta)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const { data: config } = await supabase
    .from('locales_config').select('sucursal').eq('sucursal', local).eq('tiene_fudo', true).maybeSingle()
  if (!config) return NextResponse.json({ error: `${local || 'Ese local'} no usa Fudo.` }, { status: 400 })

  const cred = await getFudoCredentials(local)
  if (!cred) return NextResponse.json({ error: 'Faltan sus claves de Fudo: cargalas en Conexión Fudo.' }, { status: 400 })

  const filtro = filtroDiasArgentina(desde, hasta)
  const base = tipo === 'ventas'
    // /sales rechaza fields[payment] y fields[paymentMethod]: los pagos llegan completos sin ellos.
    ? `/sales?fields[sale]=total,createdAt,saleType,cashRegister,payments&fields[cashRegister]=name`
      + `&include=cashRegister,payments,payments.paymentMethod&filter[saleState]=in.(CLOSED)&filter[createdAt]=${filtro}`
    : `/payments?fields[paymentMethod]=name&include=paymentMethod&filter[createdAt]=${filtro}`

  try {
    let token = await getFudoToken(cred.apiKey, cred.apiSecret)
    const paginas: PaginaFudo[] = []
    let completo = false
    for (let n = 1; n <= MAX_PAGINAS; n++) {
      const path = `${base}&page[size]=${TAM_PAGINA}&page[number]=${n}&sort=id`
      let pagina: PaginaFudo
      try {
        pagina = await fudoGet(token, path) as PaginaFudo
      } catch (e) {
        // Un token guardado que Fudo ya no acepta: se pide otro una vez.
        if (!(e instanceof Error && e.message.includes(' 401'))) throw e
        await olvidarFudoToken(cred.apiKey)
        token = await getFudoToken(cred.apiKey, cred.apiSecret)
        pagina = await fudoGet(token, path) as PaginaFudo
      }
      paginas.push(pagina)
      if ((pagina.data ?? []).length < TAM_PAGINA) { completo = true; break }
    }

    if (tipo === 'caja') {
      return NextResponse.json({ local, completo, movimientos: movimientosDePaginas(paginas, local) })
    }
    const ventas = ventasDePaginas(paginas, local)
    return NextResponse.json(soloTotales
      ? { local, completo, resumen: resumirVentas(local, ventas) }
      : { local, completo, ventas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Fudo no respondió.'
    const texto = /429/.test(msg) ? PEDIR_ESPERA
      : /auth failed: 40[13]/.test(msg) ? 'Fudo rechazó sus claves: revisalas en Conexión Fudo.'
      : 'Fudo no respondió. Probá de nuevo en un rato.'
    console.error(`[fudo/ventas] ${local}:`, msg)
    return NextResponse.json({ error: texto }, { status: 502 })
  }
}
