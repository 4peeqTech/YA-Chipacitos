import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { cargarComprobante } from '@/lib/compras/cargarComprobante'
import ComprobanteImagen, { ANCHO_COMPROBANTE } from '@/lib/compras/ComprobanteImagen'
import { altoComprobante, nombreArchivoComprobante } from '@/lib/compras/comprobanteFactura'

// PNG del comprobante interno de una factura confirmada (B2). Solo admin: el
// proxy deja pasar /api/* sin chequear el módulo, así que valida cargarComprobante.
// La URL no termina en .png a propósito: el matcher de proxy.ts excluye esas rutas.
// Las fuentes y el logo se empaquetan con outputFileTracingIncludes (next.config.ts).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Fuente = { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: 'normal' }
type Recursos = { fonts: Fuente[]; logo: string }

let recursos: Promise<Recursos> | null = null

function cargarRecursos(): Promise<Recursos> {
  recursos ??= (async (): Promise<Recursos> => {
    const raiz = process.cwd()
    const fuente = (archivo: string) => readFile(join(raiz, 'assets/fonts', archivo))
    const [regular, semi, bold, extra, logo] = await Promise.all([
      fuente('DMSans-Regular.ttf'),
      fuente('DMSans-SemiBold.ttf'),
      fuente('Syne-Bold.ttf'),
      fuente('Syne-ExtraBold.ttf'),
      readFile(join(raiz, 'public/chipacitos-logo.png')),
    ])
    return {
      fonts: [
        { name: 'DM Sans', data: regular, weight: 400, style: 'normal' },
        { name: 'DM Sans', data: semi, weight: 600, style: 'normal' },
        { name: 'Syne', data: bold, weight: 700, style: 'normal' },
        { name: 'Syne', data: extra, weight: 800, style: 'normal' },
      ],
      logo: `data:image/png;base64,${logo.toString('base64')}`,
    }
  })().catch(e => {
    recursos = null // que el próximo pedido reintente
    throw e
  })
  return recursos
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Un id que no es uuid no llega a la base (daría 22P02 → 500): no existe.
  if (!z.uuid().safeParse(id).success) return texto('La factura no existe', 404)
  const supabase = await createClientTipado()
  const r = await cargarComprobante(supabase, id)
  if (!r.ok) return texto(r.error, r.status)

  try {
    const { fonts, logo } = await cargarRecursos()
    const imagen = new ImageResponse(<ComprobanteImagen d={r.data} logo={logo} />, {
      width: ANCHO_COMPROBANTE,
      height: altoComprobante(r.data),
      fonts,
    })
    // Se renderiza acá adentro para que un error de Satori caiga en el catch y
    // no a mitad del stream.
    const png = await imagen.arrayBuffer()
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="${nombreArchivoComprobante(r.data)}"`,
      },
    })
  } catch (e) {
    console.error(e)
    return texto('No se pudo generar la imagen', 500)
  }
}

function texto(mensaje: string, status: number): Response {
  return new Response(mensaje, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } })
}
