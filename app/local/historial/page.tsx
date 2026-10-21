export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import type { Pedido } from '@/lib/types'
import HistorialClient from './HistorialClient'
import { consultarCerrados, ESTADOS_EN_CURSO, SELECT_PEDIDO } from './consultas'

export default async function HistorialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Todos los que están en curso, más la primera página del historial.
  const [{ data: enCurso, error }, cerrados] = await Promise.all([
    supabase
      .from('pedidos')
      .select(SELECT_PEDIDO)
      .eq('local_id', user.id)
      .in('estado', [...ESTADOS_EN_CURSO])
      .order('created_at', { ascending: false }),
    consultarCerrados(supabase, user.id, { estado: 'todos' }).catch(() => null),
  ])

  return (
    <HistorialClient
      usuarioId={user.id}
      enCursoIniciales={(enCurso ?? []) as Pedido[]}
      cerradosIniciales={cerrados}
      errorCarga={!!error || !cerrados}
    />
  )
}
