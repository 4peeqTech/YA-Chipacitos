import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MateriaPrimaClient from './MateriaPrimaClient'

export const metadata = { title: 'Materia prima | YA! Chipacitos' }

export default async function MateriaPrimaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: items }, { data: proveedores }] = await Promise.all([
    supabase.from('fabrica_materia_prima').select('*').order('nombre'),
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre'),
  ])

  return <MateriaPrimaClient itemsIniciales={items ?? []} proveedores={proveedores ?? []} />
}
