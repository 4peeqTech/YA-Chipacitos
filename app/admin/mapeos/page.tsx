export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import MapeosClient from './MapeosClient'

export default async function MapeosPage() {
  const supabase = await createClient()

  const [{ data: nombresRaw }, { data: mapeos }, { data: productos }] = await Promise.all([
    supabase.from('ventas_posberry').select('producto_nombre').order('producto_nombre').limit(5000),
    supabase.from('producto_mapeos').select('*, productos(nombre, tipo, destino)'),
    supabase.from('productos').select('id, nombre, tipo, destino').order('nombre'),
  ])

  // nombres ignorados (eliminados por el usuario)
  const ignorados = new Set((mapeos || []).filter(m => m.ignorado).map(m => m.nombre_posberry))

  // combinar nombres de ventas + nombres de mapeos manuales, excluyendo ignorados
  const nombresDeVentas = (nombresRaw || []).map(r => r.producto_nombre).filter(Boolean).filter((n: string) => !ignorados.has(n))
  const nombresDeMapeos = (mapeos || []).filter(m => !m.ignorado).map(m => m.nombre_posberry).filter(Boolean)
  const nombresUnicos = [...new Set([...nombresDeVentas, ...nombresDeMapeos])].sort()

  return (
    <MapeosClient
      nombresPostberry={nombresUnicos}
      mapeosIniciales={(mapeos || []).filter(m => !m.ignorado)}
      productos={productos || []}
    />
  )
}
