import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IconBuildingFactory2, IconChartBar, IconHelp, IconListCheck, IconPackage, IconUsers } from '@tabler/icons-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'

// Fábrica: solo lo de producción (supervisor de fábrica y admin). Los pedidos de los
// locales y el catálogo del mayorista están en /mayorista desde el 25-10.
export default async function FabricaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos').eq('id', user.id).single()

  if (!['supervisor_fabrica', 'admin'].includes(profile?.rol ?? '')) redirect('/login')

  const navItems = [
    { href: '/fabrica/registro', label: 'Registro', icon: <IconBuildingFactory2 size={20} /> },
    { href: '/fabrica/personal', label: 'Personal', icon: <IconUsers size={20} /> },
    { href: '/fabrica/stock',    label: 'Stock',    icon: <IconPackage size={20} /> },
    { href: '/fabrica/reportes', label: 'Reportes', icon: <IconChartBar size={20} /> },
    ...(profile?.modulos_permitidos?.includes('tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <IconListCheck size={20} /> }] : []),
    { href: '/ayuda',            label: 'Ayuda',    icon: <IconHelp size={20} /> },
  ]

  return (
    <LayoutOperativo titulo="Fábrica" subtitulo={profile?.nombre} rol={profile?.rol} navItems={navItems}>
      {children}
    </LayoutOperativo>
  )
}
