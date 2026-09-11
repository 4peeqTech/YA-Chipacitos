import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { enviarPush } from '@/lib/push/sendPush'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/fabrica/solicitudes/descartada
// Body: { solicitudId: string }
// Avisa a Fábrica que Compras descartó su solicitud y que el conteo quedó
// libre para rehacerse. El cliente no elige destinatarios ni manda el
// motivo — se resuelven acá con service role, igual que /notificar.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { solicitudId } = await request.json()
    if (!solicitudId) return NextResponse.json({ error: 'Falta solicitudId' }, { status: 400 })

    const admin = getAdminClient()
    const { data: solicitud } = await admin
      .from('compras_solicitudes')
      .select('conteo_id, fabrica_conteos(motivo_descarte, definicion_id, fabrica_conteo_definiciones(nombre))')
      .eq('id', solicitudId)
      .maybeSingle()

    const conteo = solicitud?.fabrica_conteos as unknown as { motivo_descarte: string | null; definicion_id: string; fabrica_conteo_definiciones: { nombre: string } | null } | null
    if (!conteo) return NextResponse.json({ sent: 0, failed: 0 })

    const { data: destinatarios } = await admin
      .from('profiles')
      .select('id')
      .eq('estado', 'activo')
      .in('rol', ['supervisor_fabrica', 'admin'])

    const userIds = (destinatarios || []).map(p => p.id)
    const nombreDefinicion = conteo.fabrica_conteo_definiciones?.nombre ?? 'del conteo'
    let body = `Compras descartó la solicitud de "${nombreDefinicion}". Hay que repetir el conteo.`
    if (conteo.motivo_descarte) body += ` Motivo: ${conteo.motivo_descarte}`

    const resultado = await enviarPush({
      userIds,
      title: '🔄 Conteo rechazado',
      body,
      url: '/fabrica/stock',
      tipo: 'conteo_descartado',
    })
    return NextResponse.json(resultado)
  } catch (err: any) {
    console.error('Error al notificar descarte de solicitud', err)
    return NextResponse.json({ error: 'No se pudo enviar la notificación' }, { status: 500 })
  }
}
