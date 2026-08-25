import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InsumosClient from './InsumosClient'

export const metadata = { title: 'Insumos | YA! Chipacitos' }

export default async function InsumosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: items }, { data: proveedores }, { data: categorias }, { data: definicionItems }] = await Promise.all([
    supabase.from('compras_items').select('*, compras_item_proveedores(proveedor_id, es_principal, precio_ref, codigo_proveedor)').order('nombre'),
    supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('maneja_stock', true)
      .eq('estado', 'activo')
      .order('nombre'),
    supabase.from('compras_categorias').select('id, nombre').order('orden'),
    supabase
      .from('fabrica_conteo_definicion_items')
      .select('item_id, fabrica_conteo_definiciones(nombre)')
      .eq('activo', true),
  ])

  const conteosPorItem: Record<string, string[]> = {}
  for (const di of (definicionItems ?? []) as unknown as { item_id: string; fabrica_conteo_definiciones: { nombre: string } | null }[]) {
    if (!di.fabrica_conteo_definiciones) continue
    conteosPorItem[di.item_id] ??= []
    conteosPorItem[di.item_id].push(di.fabrica_conteo_definiciones.nombre)
  }

  return (
    <InsumosClient
      itemsIniciales={items ?? []}
      proveedores={proveedores ?? []}
      categorias={categorias ?? []}
      conteosPorItem={conteosPorItem}
    />
  )
}
