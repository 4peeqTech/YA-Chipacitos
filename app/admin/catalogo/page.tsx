export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import AdminCatalogoClient from './AdminCatalogoClient'

export default async function AdminCatalogoPage() {
  const supabase = await createClient()
  const [{ data: productos }, { data: mapeos }, { data: sabores }, { data: presentaciones }, { data: tamanios }] = await Promise.all([
    supabase.from('productos').select('*').order('destino').order('nombre'),
    supabase.from('producto_mapeos').select('nombre_posberry, producto_id'),
    supabase.from('fabrica_sabores').select('id, nombre').eq('activo', true).order('orden'),
    supabase.from('fabrica_presentaciones').select('id, nombre, peso_kg').eq('activo', true).order('orden'),
    supabase.from('fabrica_tamanios').select('id, nombre').eq('activo', true).order('orden'),
  ])

  return (
    <AdminCatalogoClient
      productosIniciales={productos || []}
      mapeos={mapeos || []}
      sabores={sabores || []}
      presentaciones={(presentaciones || []).map(p => ({ id: p.id, nombre: p.nombre, pesoKg: p.peso_kg }))}
      tamanios={tamanios || []}
    />
  )
}
