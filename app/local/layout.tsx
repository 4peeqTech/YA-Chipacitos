import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Plus, ClipboardList, ListTodo, HelpCircle } from 'lucide-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'

export default async function LocalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, local_nombre, modulos_permitidos').eq('id', user.id).single()

  if (profile?.rol !== 'local' && profile?.rol !== 'admin') redirect('/login')

  const navItems = [
    { href: '/local/pedidos',   label: 'Pedir',   icon: <Plus size={20} /> },
    { href: '/local/historial', label: 'Pedidos', icon: <ClipboardList size={20} /> },
    ...(profile?.modulos_permitidos?.includes('tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <ListTodo size={20} /> }] : []),
    { href: '/ayuda',           label: 'Ayuda',   icon: <HelpCircle size={20} /> },
  ]

  return (
    <LayoutOperativo titulo={profile?.local_nombre || profile?.nombre || 'Local'} rol="local" navItems={navItems}>
      {children}
    </LayoutOperativo>
  )
}
