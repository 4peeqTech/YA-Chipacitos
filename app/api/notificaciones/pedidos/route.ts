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

// POST /api/notificaciones/pedidos
// Body: { pedidoId, evento }  (evento: creado | editado | enviado | cancelado | recibido | mensaje)
//
// El título, el texto y los destinatarios se arman acá (D9): quien llama solo
// dice qué pasó y en qué pedido. Se verifica con SU sesión que puede ver el
// pedido (RLS) y que el estado corresponde al evento; los destinatarios se
// resuelven con service role:
//   creado               → rol del destino (fábrica → mayorista, depósito → deposito)
//   editado, enviado     → local dueño
//   cancelado, mensaje   → la otra parte
//   recibido             → rol del destino, solo si hubo diferencias

type Evento = 'creado' | 'editado' | 'enviado' | 'cancelado' | 'recibido' | 'mensaje'
const EVENTOS: Evento[] = ['creado', 'editado', 'enviado', 'cancelado', 'recibido', 'mensaje']

const ROL_DESTINO: Record<string, string> = { fabrica: 'mayorista', deposito: 'deposito' }
const URL_DESTINO: Record<string, string> = { fabrica: '/fabrica/pedidos', deposito: '/deposito/pedidos' }
const URL_LOCAL = '/local/historial'
const NOMBRE_DESTINO: Record<string, string> = { fabrica: 'El mayorista', deposito: 'Depósito' }

// Estados en los que tiene sentido cada aviso (evita avisos falsos).
const ESTADOS_VALIDOS: Record<Evento, string[] | null> = {
  creado: ['pendiente', 'preparando'],
  editado: ['pendiente', 'preparando'],
  enviado: ['enviado', 'recibido'],
  cancelado: ['cancelado'],
  recibido: ['recibido'],
  mensaje: null,
}

function recortar(texto: string, max = 120) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const pedidoId: unknown = body?.pedidoId
    const evento: unknown = body?.evento
    if (typeof pedidoId !== 'string' || !EVENTOS.includes(evento as Evento)) {
      return NextResponse.json({ error: 'Falta pedidoId o el evento no es válido' }, { status: 400 })
    }
    const ev = evento as Evento

    // Con la sesión de quien llama: si RLS no le deja ver el pedido, 403.
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, numero, local_id, local_nombre, destino, estado, motivo_cancelacion, recepcion_con_diferencias')
      .eq('id', pedidoId)
      .maybeSingle()
    if (!pedido) return NextResponse.json({ error: 'No podés ver este pedido' }, { status: 403 })

    const validos = ESTADOS_VALIDOS[ev]
    if (validos && !validos.includes(pedido.estado)) {
      return NextResponse.json({ error: 'El pedido no está en un estado que corresponda a este aviso' }, { status: 409 })
    }

    const admin = getAdminClient()
    const esLocalDueno = pedido.local_id === user.id
    const rolDestino = ROL_DESTINO[pedido.destino]
    const n = `#${pedido.numero}`

    async function idsDelDestino(): Promise<string[]> {
      if (!rolDestino) return []
      const { data } = await admin.from('profiles').select('id').eq('rol', rolDestino)
      return (data || []).map(p => p.id)
    }
    const alLocal = () => ({ ids: pedido.local_id ? [pedido.local_id] : [], url: URL_LOCAL })
    const alDestino = async () => ({ ids: await idsDelDestino(), url: URL_DESTINO[pedido.destino] || URL_LOCAL })

    let destinatarios: { ids: string[]; url: string }
    let title: string
    let texto: string

    switch (ev) {
      case 'creado': {
        const { count } = await admin.from('pedido_items').select('id', { count: 'exact', head: true }).eq('pedido_id', pedido.id)
        destinatarios = await alDestino()
        title = `Pedido nuevo ${n}`
        texto = `${pedido.local_nombre}: ${count ?? 0} producto${count === 1 ? '' : 's'}`
        break
      }
      case 'editado':
        destinatarios = alLocal()
        title = `${NOMBRE_DESTINO[pedido.destino] ?? 'Quien despacha'} cambió tu pedido ${n}`
        texto = 'Mirá qué cambió antes de recibirlo.'
        break
      case 'enviado':
        destinatarios = alLocal()
        title = `Tu pedido ${n} está en camino`
        texto = 'Cuando llegue, confirmá la recepción.'
        break
      case 'cancelado':
        destinatarios = esLocalDueno ? await alDestino() : alLocal()
        title = `Pedido ${n} cancelado`
        texto = esLocalDueno ? `Lo canceló ${pedido.local_nombre}` : 'Se canceló tu pedido'
        if (pedido.motivo_cancelacion) texto += `: ${recortar(pedido.motivo_cancelacion)}`
        break
      case 'recibido':
        if (!pedido.recepcion_con_diferencias) return NextResponse.json({ sent: 0, failed: 0 })
        destinatarios = await alDestino()
        title = `Pedido ${n} recibido con diferencias`
        texto = `${pedido.local_nombre} marcó diferencias en lo que llegó.`
        break
      case 'mensaje': {
        // El texto sale del último mensaje de quien llama, no del body.
        const { data: msg } = await admin
          .from('pedido_mensajes')
          .select('texto, autor_nombre')
          .eq('pedido_id', pedido.id)
          .eq('autor_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!msg) return NextResponse.json({ error: 'No hay mensaje para avisar' }, { status: 409 })
        destinatarios = esLocalDueno ? await alDestino() : alLocal()
        title = `Mensaje en el pedido ${n}`
        texto = `${msg.autor_nombre}: ${recortar(msg.texto)}`
        break
      }
    }

    const userIds = destinatarios.ids.filter(id => id !== user.id)
    const resultado = await enviarPush({
      userIds,
      title,
      body: texto,
      url: destinatarios.url,
      tipo: 'pedido',
      tag: `pedido-${pedido.id}-${ev}`,
    })
    return NextResponse.json(resultado)
  } catch (err) {
    console.error('Error al notificar pedido', err)
    return NextResponse.json({ error: 'No se pudo enviar la notificación' }, { status: 500 })
  }
}
