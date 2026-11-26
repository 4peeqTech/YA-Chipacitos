import { exigirArea } from '@/lib/permisos/servidor'
import { opcionesDeArea, puedePantalla } from '@/lib/permisos/acceso'
import { ClipboardList, Shuffle, ListTodo, HelpCircle } from 'lucide-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'
import BarraContexto from '@/components/layout/BarraContexto'

export default async function DepositoLayout({ children }: { children: React.ReactNode }) {
  const { acceso } = await exigirArea('deposito')

  const navItems = [
    { href: '/deposito/pedidos',  label: 'Pedidos',  icon: <ClipboardList size={20} /> },
    { href: '/deposito/catalogo', label: 'Catálogo', icon: <Shuffle size={20} /> },
    ...(puedePantalla(acceso, 'tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <ListTodo size={20} /> }] : []),
    { href: '/ayuda',             label: 'Ayuda',    icon: <HelpCircle size={20} /> },
  ]

  return (
    <LayoutOperativo titulo="Depósito" subtitulo={acceso.nombre} rol={acceso.rol} navItems={navItems}
      contexto={<BarraContexto areas={opcionesDeArea(acceso)} areaActual="deposito" />}>
      {children}
    </LayoutOperativo>
  )
}
