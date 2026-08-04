export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import ConciliacionClient from './ConciliacionClient'

export default async function ConciliacionPage() {
  const supabase = await createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const [{ data: conc }, { data: locales }, { data: ventas }, { data: mapeos }] = await Promise.all([
    supabase
      .from('conciliaciones')
      .select('*, profiles(nombre, local_nombre)')
      .eq('fecha', hoy)
      .order('tiene_alerta', { ascending: false }),
    supabase.from('profiles').select('id, nombre, local_nombre').eq('rol', 'local').ilike('local_nombre', 'Suc.%'),
    supabase.from('ventas_posberry').select('importe').eq('fecha', hoy),
    supabase.from('producto_mapeos').select('nombre_posberry, productos(nombre)'),
  ])

  const ventasHoy = ventas?.reduce((s, v) => s + (v.importe || 0), 0) || 0

  // Lookup: nombre_posberry → nombre local del sistema
  const mapaProductos: Record<string, string> = {}
  ;(mapeos || []).forEach((m) => {
    const prod = Array.isArray(m.productos) ? m.productos[0] : m.productos
    if (prod?.nombre) mapaProductos[m.nombre_posberry] = prod.nombre
  })

  return (
    <ConciliacionClient
      conciliacionesIniciales={conc || []}
      locales={locales || []}
      ventasHoy={ventasHoy}
      fechaInicial={hoy}
      mapaProductos={mapaProductos}
    />
  )
}
