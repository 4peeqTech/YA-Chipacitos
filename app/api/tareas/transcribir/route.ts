import { createClient } from '@/lib/supabase/server'
import { transcribirAudio } from '@/lib/groq/transcribir'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/tareas/transcribir
// Body: FormData con campo "audio" (blob). A diferencia de /api/tareas/audio,
// esto solo transcribe (sin extraer campos de tarea) — para dictar texto
// libre en un campo, como el comentario de un informe.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const form = await request.formData()
    const audioBlob = form.get('audio') as Blob | null
    if (!audioBlob) return NextResponse.json({ error: 'Sin audio' }, { status: 400 })

    const transcripcion = await transcribirAudio(audioBlob)
    if (!transcripcion) return NextResponse.json({ error: 'No se detectó voz' }, { status: 400 })

    return NextResponse.json({ transcripcion })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
