export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import MapeosClient from './MapeosClient'

export default async function MapeosPage() {
  const supabase = await createClient()

  // Todos los nombres únicos de Posberry
  const { data: nombresRaw } = await supabase
    .from('ventas_posberry')
    .select('producto_nombre')
    .order('producto_nombre')

  const nombresUnicos = [...new Set((nombresRaw || []).map(r => r.producto_nombre).filter(Boolean))]

  const [{ data: mapeos }, { data: productos }] = await Promise.all([
    supabase.from('producto_mapeos').select('*, productos(nombre, tipo, destino)'),
    supabase.from('productos').select('id, nombre, tipo, destino').order('nombre'),
  ])

  return (
    <MapeosClient
      nombresPostberry={nombresUnicos}
      mapeosIniciales={mapeos || []}
      productos={productos || []}
    />
  )
}
