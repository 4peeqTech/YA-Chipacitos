export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CatalogoMayorista from '@/components/pedidos/mayorista/CatalogoMayorista'
import type { Producto } from '@/lib/types'
import { COLUMNAS_CATEGORIA, esPedible, indexarCategorias, type CategoriaCatalogo } from '@/lib/pedidos/categorias'

export default async function MayoristaCatalogoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Catálogo es del mayorista (el layout ya lo controla; esto cubre un acceso directo).
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user!.id).single()
  if (profile?.rol !== 'mayorista') redirect('/login')

  const [{ data: productos }, { data: categorias }] = await Promise.all([
    supabase.from('productos').select('*').eq('tipo', 'producto').eq('destino', 'fabrica').order('nombre'),
    supabase.from('catalogo_categorias').select(COLUMNAS_CATEGORIA).eq('destino', 'fabrica').order('orden'),
  ])

  // Las categorías que el admin desactivó no se ven: nadie las puede pedir.
  const lista = (categorias ?? []) as CategoriaCatalogo[]
  const cats = indexarCategorias(lista)
  return (
    <CatalogoMayorista
      productosIniciales={((productos ?? []) as Producto[]).filter(p => esPedible(p, cats))}
      categoriasCatalogo={lista}
    />
  )
}
