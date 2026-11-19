import { exigirArea } from '@/lib/permisos/servidor'
import { puedePantalla } from '@/lib/permisos/acceso'
import { Plus, ClipboardList, ListTodo, HelpCircle } from 'lucide-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'

export default async function LocalLayout({ children }: { children: React.ReactNode }) {
  const { supabase, acceso } = await exigirArea('locales')

  const [{ data: profile }, { count: enCamino }] = await Promise.all([
    supabase.from('profiles').select('nombre, local_nombre').eq('id', acceso.id).single(),
    // Pedidos en camino sin confirmar: número sobre la pestaña "Pedidos".
    supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('local_id', acceso.id).eq('estado', 'enviado'),
  ])


  const navItems = [
    { href: '/local/pedidos',   label: 'Pedir',   icon: <Plus size={20} /> },
    { href: '/local/historial', label: 'Pedidos', icon: <ClipboardList size={20} />, badge: enCamino ?? 0 },
    ...(puedePantalla(acceso, 'tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <ListTodo size={20} /> }] : []),
    { href: '/ayuda',           label: 'Ayuda',   icon: <HelpCircle size={20} /> },
  ]

  return (
    <LayoutOperativo titulo={profile?.local_nombre || profile?.nombre || 'Local'} rol="local" navItems={navItems}>
      {children}
    </LayoutOperativo>
  )
}
