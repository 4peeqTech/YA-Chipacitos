import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClipboardList, Shuffle, ListTodo, HelpCircle } from 'lucide-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'

export default async function DepositoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos').eq('id', user.id).single()

  if (profile?.rol !== 'deposito' && profile?.rol !== 'admin') redirect('/login')

  const navItems = [
    { href: '/deposito/pedidos',  label: 'Pedidos',  icon: <ClipboardList size={20} /> },
    { href: '/deposito/catalogo', label: 'Catálogo', icon: <Shuffle size={20} /> },
    ...(profile?.modulos_permitidos?.includes('tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <ListTodo size={20} /> }] : []),
    { href: '/ayuda',             label: 'Ayuda',    icon: <HelpCircle size={20} /> },
  ]

  return (
    <LayoutOperativo titulo="Depósito" subtitulo={profile?.nombre} rol="deposito" navItems={navItems}>
      {children}
    </LayoutOperativo>
  )
}
