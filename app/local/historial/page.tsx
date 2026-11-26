export const dynamic = 'force-dynamic'

import { cargarAcceso, sucursalesDeLocales } from '@/lib/permisos/servidor'
import type { Pedido } from '@/lib/types'
import HistorialClient from './HistorialClient'
import { consultarCerrados, ESTADOS_EN_CURSO, SELECT_PEDIDO } from './consultas'

export default async function HistorialPage() {
  const { supabase, acceso } = await cargarAcceso()
  const { actual } = await sucursalesDeLocales()
  if (!acceso || !actual) return null

  // Todos los que están en curso, más la primera página del historial.
  const [{ data: enCurso, error }, cerrados] = await Promise.all([
    supabase
      .from('pedidos')
      .select(SELECT_PEDIDO)
      .eq('local_id', actual.cuentaLocalId)
      .in('estado', [...ESTADOS_EN_CURSO])
      .order('created_at', { ascending: false }),
    consultarCerrados(supabase, actual.cuentaLocalId, { estado: 'todos' }).catch(() => null),
  ])

  return (
    <HistorialClient
      key={actual.id}
      usuarioId={acceso.id}
      localId={actual.cuentaLocalId}
      enCursoIniciales={(enCurso ?? []) as Pedido[]}
      cerradosIniciales={cerrados}
      errorCarga={!!error || !cerrados}
    />
  )
}
