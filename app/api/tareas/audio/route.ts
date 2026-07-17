import { createClient } from '@/lib/supabase/server'
import { transcribirAudio } from '@/lib/groq/transcribir'
import { NextRequest, NextResponse } from 'next/server'

const GROQ_API = 'https://api.groq.com/openai/v1'

interface PerfilLite { id: string; nombre: string; local_nombre: string | null }

// POST /api/tareas/audio
// Body: FormData con campo "audio" (blob) y "perfiles" (JSON string de PerfilLite[])
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const form = await request.formData()
    const audioBlob = form.get('audio') as Blob | null
    const perfilesJson = (form.get('perfiles') as string) || '[]'
    const perfiles: PerfilLite[] = JSON.parse(perfilesJson)

    if (!audioBlob) return NextResponse.json({ error: 'Sin audio' }, { status: 400 })

    // 1. Transcribir con Whisper via Groq
    const transcripcion = await transcribirAudio(audioBlob)

    if (!transcripcion) {
      return NextResponse.json({ error: 'No se detectó voz' }, { status: 400 })
    }

    // 2. Extraer campos con Llama via Groq
    const listaPerfiles = perfiles.map(p => `${p.nombre}${p.local_nombre ? ' (' + p.local_nombre + ')' : ''} [id: ${p.id}]`).join('\n')
    const hoy = new Date().toISOString().split('T')[0]

    const prompt = `Sos un asistente que extrae datos de tareas desde texto en español.

Hoy es ${hoy}.

Personas disponibles para asignar (usá el id entre corchetes, no el nombre):
${listaPerfiles || '(ninguna)'}

Texto del audio: "${transcripcion}"

Extraé los campos y respondé SOLO con un JSON válido, sin explicaciones, sin markdown:
{
  "titulo": "título claro y conciso de la tarea",
  "prioridad": "alta" | "media" | "baja",
  "fecha_limite": "YYYY-MM-DD" | null,
  "asignado_a": ["uuid1", "uuid2"] | [],
  "descripcion": "descripción adicional si hay" | null
}

Reglas:
- titulo: obligatorio, máximo 80 caracteres
- prioridad: "alta" si menciona urgente/urgencia/prioritario/inmediato, "baja" si menciona cuando puedas/sin apuro, sino "media"
- fecha_limite: interpretá expresiones como "el viernes", "la semana que viene", "el 30" en base a hoy (${hoy})
- asignado_a: buscá nombres en la lista de personas disponibles, devolvé los id (uuid) que coincidan
- Si no hay asignado claro, devolvé []`

    const llmRes = await fetch(`${GROQ_API}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 400,
      }),
    })

    if (!llmRes.ok) {
      const err = await llmRes.text()
      throw new Error(`LLM error: ${err}`)
    }

    const llmData = await llmRes.json()
    const rawJson = llmData.choices[0].message.content.trim()

    let campos
    try {
      const match = rawJson.match(/\{[\s\S]*\}/)
      campos = JSON.parse(match ? match[0] : rawJson)
    } catch {
      campos = { titulo: transcripcion.slice(0, 80), prioridad: 'media', fecha_limite: null, asignado_a: [], descripcion: null }
    }

    return NextResponse.json({ transcripcion, campos })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
