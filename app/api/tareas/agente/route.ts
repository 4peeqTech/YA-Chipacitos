import { createClient } from '@/lib/supabase/server'
import { enviarPush } from '@/lib/push/sendPush'
import { NextRequest, NextResponse } from 'next/server'
import type { EstadoTarea, PrioridadTarea } from '@/lib/types'

const GROQ_API = 'https://api.groq.com/openai/v1'
const MAX_TURNOS = 4

interface PerfilLite { id: string; nombre: string; local_nombre: string | null }
interface ChatMsg { role: 'user' | 'assistant'; content: string }

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'listar_tareas',
      description: 'Lista las tareas visibles para el usuario (las que creó o le asignaron), con filtros opcionales.',
      parameters: {
        type: 'object',
        properties: {
          filtro_estado: { type: 'string', enum: ['pendiente', 'en_progreso', 'completada'] },
          filtro_prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
          solo_mias: { type: 'boolean', description: 'true = solo tareas creadas por el usuario o asignadas a él' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description: 'Crea una nueva tarea.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
          fecha_limite: { type: 'string', description: 'YYYY-MM-DD, opcional' },
          asignado_a: { type: 'array', items: { type: 'string' }, description: 'ids (uuid) de las personas asignadas' },
        },
        required: ['titulo', 'prioridad'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_estado_tarea',
      description: 'Cambia el estado de una tarea existente.',
      parameters: {
        type: 'object',
        properties: {
          tarea_id: { type: 'string' },
          nuevo_estado: { type: 'string', enum: ['pendiente', 'en_progreso', 'completada'] },
        },
        required: ['tarea_id', 'nuevo_estado'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'marcar_completada',
      description: 'Marca una tarea como completada.',
      parameters: {
        type: 'object',
        properties: { tarea_id: { type: 'string' } },
        required: ['tarea_id'],
      },
    },
  },
]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { messages, perfiles }: { messages: ChatMsg[]; perfiles: PerfilLite[] } = await request.json()
    if (!messages?.length) return NextResponse.json({ error: 'Sin mensajes' }, { status: 400 })

    const userNombre = perfiles.find(p => p.id === user.id)?.nombre || 'Usuario'
    const hoy = new Date().toISOString().split('T')[0]
    const listaPerfiles = perfiles.map(p => `${p.nombre}${p.local_nombre ? ' (' + p.local_nombre + ')' : ''} [id: ${p.id}]`).join('\n')

    const systemPrompt = `Sos el asistente del módulo de Tareas de YA! Chipacitos. Respondés en español, de forma breve y directa.

Hoy es ${hoy}. El usuario que te habla es ${userNombre} (id: ${user.id}).

Personas disponibles para asignar tareas (usá el id entre corchetes):
${listaPerfiles || '(ninguna)'}

Usá las herramientas disponibles para consultar o modificar tareas. Solo podés ver y modificar las tareas que el usuario creó o que le asignaron a él — si una acción falla por permisos, explicáselo. No inventes tareas ni ids que no vengan de una herramienta.`

    const conversation: Array<Record<string, unknown>> = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    for (let turno = 0; turno < MAX_TURNOS; turno++) {
      const llmRes = await fetch(`${GROQ_API}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: conversation,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 700,
        }),
      })

      if (!llmRes.ok) {
        const err = await llmRes.text()
        throw new Error(`LLM error: ${err}`)
      }

      const llmData = await llmRes.json()
      const msg = llmData.choices[0].message

      if (!msg.tool_calls?.length) {
        return NextResponse.json({ reply: msg.content || 'No tengo una respuesta para eso.' })
      }

      conversation.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls })

      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(call.function.arguments || '{}') } catch { /* args inválidos, se ejecuta con {} */ }

        const resultado = await ejecutarTool(call.function.name, args, { supabase, userId: user.id, userNombre, perfiles })

        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(resultado),
        })
      }
    }

    return NextResponse.json({ reply: 'No pude completar la solicitud, ¿podés reformularla?' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type Ctx = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  userNombre: string
  perfiles: PerfilLite[]
}

async function ejecutarTool(nombre: string, args: Record<string, unknown>, ctx: Ctx) {
  const { supabase, userId, userNombre, perfiles } = ctx

  if (nombre === 'listar_tareas') {
    // La RLS ya limita esto a tareas creadas por el usuario o asignadas a él.
    let query = supabase.from('tareas').select('id, titulo, prioridad, estado, fecha_limite, asignado_a, creado_por')
    if (args.filtro_estado) query = query.eq('estado', args.filtro_estado as EstadoTarea)
    if (args.filtro_prioridad) query = query.eq('prioridad', args.filtro_prioridad as PrioridadTarea)

    const { data, error } = await query.order('fecha_limite', { ascending: true }).limit(30)
    if (error) return { error: error.message }

    let tareas = data || []
    if (args.solo_mias === true) {
      tareas = tareas.filter(t => t.creado_por === userId || (t.asignado_a || []).includes(userId))
    }

    return {
      tareas: tareas.map(t => ({
        id: t.id,
        titulo: t.titulo,
        prioridad: t.prioridad,
        estado: t.estado,
        fecha_limite: t.fecha_limite,
        asignado_a: (t.asignado_a || []).map((id: string) => perfiles.find(p => p.id === id)?.nombre || id),
      })),
    }
  }

  if (nombre === 'crear_tarea') {
    const titulo = String(args.titulo || '').trim()
    if (!titulo) return { error: 'Falta el título de la tarea' }

    const asignadoA = Array.isArray(args.asignado_a) ? (args.asignado_a as string[]) : []
    const { data, error } = await supabase
      .from('tareas')
      .insert({
        titulo,
        descripcion: args.descripcion || null,
        prioridad: (args.prioridad as PrioridadTarea) || 'media',
        fecha_limite: args.fecha_limite || null,
        asignado_a: asignadoA,
        creado_por: userId,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    const destinatarios = asignadoA.filter(id => id !== userId)
    if (destinatarios.length) {
      enviarPush({ userIds: destinatarios, title: '📋 Nueva tarea asignada', body: `${userNombre} te asignó: ${titulo}`, url: '/tareas' }).catch(() => {})
    }

    return { ok: true, tarea_id: data.id, titulo: data.titulo }
  }

  if (nombre === 'actualizar_estado_tarea' || nombre === 'marcar_completada') {
    const tareaId = String(args.tarea_id || '')
    const nuevoEstado: EstadoTarea = nombre === 'marcar_completada' ? 'completada' : (args.nuevo_estado as EstadoTarea)
    if (!tareaId || !nuevoEstado) return { error: 'Faltan datos (tarea_id / nuevo_estado)' }

    const { data, error } = await supabase
      .from('tareas')
      .update({ estado: nuevoEstado })
      .eq('id', tareaId)
      .select('id, titulo, creado_por, asignado_a')
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { error: 'No se encontró la tarea, o no tenés permiso para modificarla' }

    const destinatarios = [...new Set([data.creado_por, ...(data.asignado_a || [])])].filter(id => id !== userId)
    if (destinatarios.length) {
      enviarPush({ userIds: destinatarios, title: '📋 Estado actualizado', body: `${userNombre} marcó "${data.titulo}" como ${nuevoEstado}`, url: '/tareas' }).catch(() => {})
    }

    return { ok: true, tarea_id: data.id, titulo: data.titulo, estado: nuevoEstado }
  }

  return { error: `Herramienta desconocida: ${nombre}` }
}
