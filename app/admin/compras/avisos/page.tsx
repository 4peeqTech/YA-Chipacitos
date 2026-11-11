import { redirect } from 'next/navigation'
import { createClientTipado } from '@/lib/supabase/server'
import { CLAVES_AVISOS, TIPOS_AVISO, leerConfigAvisos, totalAvisados, type ResultadoCorrida, type TipoAviso } from '@/lib/compras/avisos'
import { codigoDevolucion, codigoPedido } from '@/lib/compras/codigos'
import AvisosClient, { type AvisoReciente, type Corrida } from './AvisosClient'

export const metadata = { title: 'Avisos | YA! Chipacitos' }

export default async function AvisosPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') redirect('/admin')

  const [{ data: config }, { data: ultimas }, { data: ultimaCron }, { data: enviados }] = await Promise.all([
    supabase.from('compras_config').select('clave, valor').in('clave', CLAVES_AVISOS),
    supabase.from('compras_avisos_corridas').select('origen, corrida_en, resultado, error').order('corrida_en', { ascending: false }).limit(1),
    supabase.from('compras_avisos_corridas').select('corrida_en').eq('origen', 'cron').order('corrida_en', { ascending: false }).limit(1),
    supabase.from('compras_avisos_enviados').select('id, tipo, entidad_id, pedido_id, enviado_en, envios').order('enviado_en', { ascending: false }).limit(30),
  ])

  // Los nombres para los links, solo de las filas que se muestran.
  const filas = enviados ?? []
  const pedidoIds = [...new Set(filas.map(f => f.pedido_id).filter((x): x is string => !!x))]
  const devolucionIds = filas.filter(f => f.tipo === 'nc_pendiente').map(f => f.entidad_id)
  const insumoIds = filas.filter(f => f.tipo === 'stock_bajo').map(f => f.entidad_id)
  const [{ data: pedidos }, { data: devoluciones }, { data: insumos }] = await Promise.all([
    pedidoIds.length ? supabase.from('compras_pedidos').select('id, numero').in('id', pedidoIds) : Promise.resolve({ data: [] }),
    devolucionIds.length ? supabase.from('compras_devoluciones').select('id, secuencia').in('id', devolucionIds) : Promise.resolve({ data: [] }),
    insumoIds.length ? supabase.from('compras_items').select('id, nombre').in('id', insumoIds) : Promise.resolve({ data: [] }),
  ])
  const numeroPedido = new Map((pedidos ?? []).map(p => [p.id, p.numero]))
  const secuencia = new Map((devoluciones ?? []).map(d => [d.id, d.secuencia]))
  const nombreInsumo = new Map((insumos ?? []).map(i => [i.id, i.nombre]))

  const recientes: AvisoReciente[] = filas
    .filter((f): f is typeof f & { tipo: TipoAviso } => (TIPOS_AVISO as string[]).includes(f.tipo))
    .map(f => {
      const numero = f.pedido_id ? numeroPedido.get(f.pedido_id) : undefined
      let etiqueta: string | null = null
      if (f.tipo === 'stock_bajo') etiqueta = nombreInsumo.get(f.entidad_id) ?? null
      else if (f.tipo === 'nc_pendiente') {
        const s = secuencia.get(f.entidad_id)
        etiqueta = numero != null && s != null ? codigoDevolucion(numero, s) : null
      } else etiqueta = numero != null ? codigoPedido(numero) : null
      return { id: f.id, tipo: f.tipo, entidadId: f.entidad_id, pedidoId: f.pedido_id, etiqueta, enviadoEn: f.enviado_en, envios: f.envios }
    })

  const u = ultimas?.[0]
  const ultima: Corrida | null = u
    ? { origen: u.origen as Corrida['origen'], corridaEn: u.corrida_en, avisos: totalAvisados((u.resultado ?? {}) as ResultadoCorrida), error: u.error }
    : null

  return (
    <AvisosClient
      config={leerConfigAvisos(config ?? [])}
      ultima={ultima}
      ultimaAutomatica={ultimaCron?.[0]?.corrida_en ?? null}
      recientes={recientes}
    />
  )
}
