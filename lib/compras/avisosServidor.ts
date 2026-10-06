// Runner de los avisos de compras (B5 §5.1). Solo servidor: usa el service role
// (como lib/push/sendPush.ts) porque las vistas de compras devuelven 0 filas sin
// auth.uid(). Lo llaman el cron, "Revisar ahora" y el after() de guardarRemito.
//
// compras_avisos_tomar decide QUÉ avisar (y lo marca como avisado, con lock);
// acá solo se arma el texto, se reparte y se manda. Si el push falla no se
// reintenta: la campanita igual lo tiene y el tablero lo muestra.

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/database.types'
import { enviarPush } from '@/lib/push/sendPush'
import { MODULOS_COMPRAS } from '@/lib/modulos'
import {
  armarAvisos, destinatariosDe, resumenCorrida, TIPOS_AVISO,
  type FilaAviso, type PerfilAviso, type ResultadoCorrida, type ResumenCorrida, type TipoAviso,
} from './avisos'

function clienteServicio() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const Filas = z.array(z.object({
  tipo: z.enum(['remito_listo', 'pedido_demorado', 'diferencias', 'nc_pendiente', 'stock_bajo']),
  entidad_id: z.string(),
  pedido_id: z.string().nullable(),
  numero: z.number().nullable(),
  codigo: z.string().nullable(),
  proveedor_nombre: z.string().nullable(),
  insumo_nombre: z.string().nullable(),
  unidad: z.string().nullable(),
  cantidad: z.number().nullable(),
  minimo: z.number().nullable(),
  dias: z.number().nullable(),
  pendientes: z.number().nullable(),
  repetido: z.boolean(),
}))

export interface OpcionesCorrida {
  origen: 'cron' | 'manual' | 'remito'
  /** Default: los 5. Un tipo apagado en la config no se toma igual. */
  tipos?: TipoAviso[]
  pedidoId?: string
  /** Usuario que no recibe (quien cargó el remito). */
  excluir?: string
  /** Quien tocó "Revisar ahora". */
  por?: string
}

export async function correrAvisos(op: OpcionesCorrida): Promise<ResumenCorrida> {
  const admin = clienteServicio()
  const resultado: ResultadoCorrida = {}
  let error: string | null = null
  let filas: FilaAviso[] = []

  try {
    const { data, error: errTomar } = await admin.rpc('compras_avisos_tomar', {
      p_tipos: op.tipos ?? undefined,
      p_pedido_id: op.pedidoId ?? undefined,
    })
    if (errTomar) throw new Error(errTomar.message)
    filas = Filas.parse(data ?? [])

    if (filas.length > 0) {
      const { data: perfiles, error: errPerfiles } = await admin
        .from('profiles')
        .select('id, rol, modulos_permitidos')
        .eq('estado', 'activo')
        .or(`rol.eq.admin,modulos_permitidos.ov.{${MODULOS_COMPRAS.join(',')}}`)
      if (errPerfiles) throw new Error(errPerfiles.message)
      const lista: PerfilAviso[] = perfiles ?? []

      for (const m of armarAvisos(filas)) {
        const userIds = destinatariosDe(m.tipo, lista, op.excluir)
        if (userIds.length > 0) {
          await enviarPush({ userIds, title: m.title, body: m.body, url: m.url, tipo: `compras_${m.tipo}`, tag: m.tag })
        }
        resultado[m.tipo] = { candidatos: m.cantidad, avisados: userIds.length > 0 ? m.cantidad : 0, destinatarios: userIds.length }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    console.error('[avisos-compras]', op.origen, error)
  }

  // El remito solo deja rastro si avisó algo (o falló): si no, sería una fila por remito.
  if (op.origen !== 'remito' || filas.length > 0 || error) {
    const { error: errLog } = await admin.from('compras_avisos_corridas').insert({
      origen: op.origen,
      por: op.por ?? null,
      resultado: Object.fromEntries(TIPOS_AVISO.filter(t => resultado[t]).map(t => [t, { ...resultado[t] }])),
      error,
    })
    if (errLog) console.error('[avisos-compras] no se pudo registrar la corrida', errLog.message)
  }

  return { origen: op.origen, resultado, error, texto: error ? 'No se pudo revisar los avisos.' : resumenCorrida(resultado) }
}

/** E5: después de guardar un remito. Nunca tira: no puede cambiar el resultado del remito. */
export async function avisarRemitoListo(pedidoId: string, userId: string): Promise<void> {
  try {
    await correrAvisos({ origen: 'remito', tipos: ['remito_listo'], pedidoId, excluir: userId })
  } catch (e) {
    console.error('[avisos-compras] remito listo', e)
  }
}
