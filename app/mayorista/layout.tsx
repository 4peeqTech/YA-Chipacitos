import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IconHelp, IconListCheck, IconPackages, IconTruckDelivery } from '@tabler/icons-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'

// Sección del mayorista: los pedidos de los locales y el stock de su catálogo.
// Antes vivía dentro de /fabrica (su pantalla decía "Fábrica" y compartía menú con
// Registro/Stock/Reportes); desde el 25-10 es su propia sección. Las direcciones
// viejas (/fabrica/pedidos y /fabrica/catalogo) redirigen acá.
export default async function MayoristaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos').eq('id', user.id).single()

  // Solo el mayorista (26-10): el admin consulta los pedidos en /admin/pedidos.
  if (profile?.rol !== 'mayorista') redirect('/login')

  const navItems = [
    { href: '/mayorista/pedidos',  label: 'Pedidos',  icon: <IconTruckDelivery size={20} /> },
    { href: '/mayorista/catalogo', label: 'Catálogo', icon: <IconPackages size={20} /> },
    ...(profile?.modulos_permitidos?.includes('tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <IconListCheck size={20} /> }] : []),
    { href: '/ayuda',              label: 'Ayuda',    icon: <IconHelp size={20} /> },
  ]

  return (
    <LayoutOperativo titulo="Mayorista" subtitulo={profile?.nombre} rol={profile?.rol} navItems={navItems}>
      {children}
    </LayoutOperativo>
  )
}
