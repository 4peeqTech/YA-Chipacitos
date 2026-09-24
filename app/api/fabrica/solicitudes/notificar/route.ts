import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { enviarPush } from '@/lib/push/sendPush'
import { NextRequest, NextResponse } from 'next/server'
import { formatearNumero } from '@/lib/formato'

// Los módulos de Compras vigentes (lib/modulos.tsx). tiene_acceso_compras()
// suma fabrica-conteos para lectura, pero ese módulo no abre las pantallas de
// Compras a las que llevan estos avisos: queda afuera a propósito.
const MODULOS_COMPRAS = ['compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes']

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
      url: '/admin/compras/pedidos/solicitudes',
      tipo: 'solicitud_fabrica',
    })

    // Segundo aviso si el conteo marcó sobrestock (F8). Lo calculó
    // cerrar_conteo_fabrica; acá solo se lee.
    const { data: solicitud } = await admin
      .from('compras_solicitudes')
      .select('conteo_id, fabrica_conteos(fabrica_conteo_definiciones(nombre))')
      .eq('id', solicitudId)
      .maybeSingle()
    let sobrestock = null
    if (solicitud?.conteo_id) {
      const { data: sobrantes } = await admin
        .from('fabrica_conteo_items')
        .select('exceso, descuento_base_sugerido, compras_items(nombre, unidad)')
        .eq('conteo_id', solicitud.conteo_id)
        .eq('sobrestock', true)
      if (sobrantes?.length) {
        const definicion = (solicitud.fabrica_conteos as unknown as { fabrica_conteo_definiciones: { nombre: string } | null } | null)
          ?.fabrica_conteo_definiciones?.nombre ?? ''
        const lineas = sobrantes.map(s => {
          const item = s.compras_items as unknown as { nombre: string; unidad: string | null } | null
          const unidad = item?.unidad ?? ''
          const base = `${item?.nombre ?? 'Insumo'}: sobran ${formatearNumero(Number(s.exceso), 1)} ${unidad}`.trim()
          return s.descuento_base_sugerido
            ? `${base} → sugerido pedir ${formatearNumero(Number(s.descuento_base_sugerido), 1)} menos en el próximo Pedido base`
            : base
        })
        sobrestock = await enviarPush({
          userIds,
          title: `⚠️ Sobrestock en conteo ${definicion}`.trim(),
          body: lineas.join('\n'),
          url: '/admin/compras/pedidos/base',
          tipo: 'sobrestock_conteo',
          tag: 'sobrestock_conteo',
        })
      }
    }
    return NextResponse.json({ ...resultado, sobrestock })
  } catch (err) {
    console.error('Error al notificar solicitud nueva', err)
    return NextResponse.json({ error: 'No se pudo enviar la notificación' }, { status: 500 })
  }
}
