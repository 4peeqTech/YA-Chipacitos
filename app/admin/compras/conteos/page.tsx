import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ConteosClient from './ConteosClient'

export const metadata = { title: 'Conteos | YA! Chipacitos' }

export default async function ConteosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: definiciones }, { data: items }, { data: catalogo }, { data: categorias }] = await Promise.all([
    supabase.from('fabrica_conteo_definiciones').select('*').order('orden'),
    supabase.from('fabrica_conteo_definicion_items').select('*').eq('activo', true),
    supabase.from('compras_items').select('id, nombre, unidad, categoria_id').eq('estado', 'activo').order('nombre'),
    supabase.from('compras_categorias').select('id, nombre').order('orden'),
  ])

  return (
    <ConteosClient
      definicionesIniciales={definiciones ?? []}
      itemsIniciales={items ?? []}
      catalogo={catalogo ?? []}
      categorias={categorias ?? []}
    />
  )
}
