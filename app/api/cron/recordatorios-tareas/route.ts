import { createClient as createAdminClient } from '@supabase/supabase-js'
import { enviarPush } from '@/lib/push/sendPush'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/cron/recordatorios-tareas
// Disparado por Vercel Cron una vez al día. Avisa por push a los
// participantes de cada tarea cuya fecha_limite es mañana.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = getAdminClient()

  const manana = new Date()
  manana.setDate(manana.getDate() + 1)
  const mananaISO = manana.toISOString().split('T')[0]

  const { data: tareas, error } = await supabase
    .from('tareas')
    .select('id, titulo, asignado_a, creado_por')
    .eq('fecha_limite', mananaISO)
    .neq('estado', 'completada')
    .is('recordatorio_enviado_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tareas?.length) return NextResponse.json({ procesadas: 0 })

  let enviadas = 0
  for (const tarea of tareas) {
    const destinatarios = [...new Set([tarea.creado_por, ...(tarea.asignado_a || [])])]
    await enviarPush({
      userIds: destinatarios,
      title: '⏰ Vence mañana',
      body: tarea.titulo,
      url: '/tareas',
    })
    enviadas++
  }

  await supabase
    .from('tareas')
    .update({ recordatorio_enviado_at: new Date().toISOString() })
    .in('id', tareas.map(t => t.id))

  return NextResponse.json({ procesadas: enviadas })
}
