import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NomencladorClient from './NomencladorClient'
import type {
  ItemNom, ExternoNom, ComponenteNom, CategoriaNom, SaborNom, PresentacionNom,
} from '@/lib/nomenclador/tipos'

export const metadata = { title: 'Nomenclador | YA! Chipacitos' }

// Son unos cientos de filas: se trae todo y se filtra en el navegador (D8).
export default async function NomencladorPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: items }, { data: externos }, { data: componentes },
    { data: categorias }, { data: sabores }, { data: presentaciones },
  ] = await Promise.all([
    supabase.from('nomenclador_items')
      .select('id, codigo, tipo, nombre, nombres_alternativos, categoria_id, sabor_id, presentacion_id, variante_de, unidad_base, rinde_cantidad, notas, a_revisar, estado')
      .order('codigo'),
    supabase.from('nomenclador_externos')
      .select('id, sistema, codigo, nombre, item_id, origen, activo, notas')
      .order('sistema').order('codigo'),
    supabase.from('nomenclador_componentes')
      .select('item_id, componente_id, cantidad, unidad, merma_pct, orden, notas')
      .order('orden'),
    supabase.from('nomenclador_categorias').select('id, nombre, tipo, orden, activo').order('orden'),
    supabase.from('nomenclador_sabores').select('id, nombre, nombres_alternativos, orden, activo').order('orden'),
    supabase.from('nomenclador_presentaciones').select('id, nombre, cantidad, unidad, orden, activo').order('orden'),
  ])

  return (
    <NomencladorClient
      items={(items ?? []) as ItemNom[]}
      externos={(externos ?? []) as ExternoNom[]}
      componentes={(componentes ?? []) as ComponenteNom[]}
      categorias={(categorias ?? []) as CategoriaNom[]}
      sabores={(sabores ?? []) as SaborNom[]}
      presentaciones={(presentaciones ?? []) as PresentacionNom[]}
    />
  )
}
