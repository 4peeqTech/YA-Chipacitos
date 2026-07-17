import { createClient } from '@/lib/supabase/server'
import { enviarPush } from '@/lib/push/sendPush'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/notificaciones/tareas
// Body: { userIds: string[], title: string, body: string, url?: string }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { userIds, title, body, url } = await request.json()
    const resultado = await enviarPush({ userIds, title, body, url, tipo: 'tarea' })
    return NextResponse.json(resultado)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
