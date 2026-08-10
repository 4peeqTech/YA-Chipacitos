import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { enviarPush } from '@/lib/push/sendPush'
import { NextRequest, NextResponse } from 'next/server'

const MODULOS_COMPRAS = ['compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-remitos', 'compras-reportes', 'compras-solicitudes', 'compras-pedido-base', 'compras-conteos']

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/fabrica/solicitudes/notificar
// Body: { solicitudId: string }
// Notifica a todos los usuarios con acceso a Compras (mismo criterio que
// tiene_acceso_compras() en SQL: rol admin, o algún módulo compras-* en
// modulos_permitidos) de que hay una solicitud nueva para revisar. El
// cliente no elige destinatarios — se resuelven acá con service role,
// igual que /api/notificaciones/pedidos.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { solicitudId } = await request.json()
    if (!solicitudId) return NextResponse.json({ error: 'Falta solicitudId' }, { status: 400 })

    const admin = getAdminClient()
    const { data: destinatarios } = await admin
      .from('profiles')
      .select('id')
      .eq('estado', 'activo')
      .or(`rol.eq.admin,modulos_permitidos.ov.{${MODULOS_COMPRAS.join(',')}}`)

    const userIds = (destinatarios || []).map(p => p.id)
    const resultado = await enviarPush({
      userIds,
      title: '🏭 Nueva solicitud de Fábrica',
      body: 'Fábrica cerró el conteo semanal y pide revisar la compra complementaria.',
      url: '/admin/compras/solicitudes',
      tipo: 'solicitud_fabrica',
    })
    return NextResponse.json(resultado)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
