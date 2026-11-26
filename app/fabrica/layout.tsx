import { exigirArea } from '@/lib/permisos/servidor'
import { opcionesDeArea, puedePantalla } from '@/lib/permisos/acceso'
import { IconBuildingFactory2, IconChartBar, IconHelp, IconListCheck, IconPackage, IconUsers } from '@tabler/icons-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'
import BarraContexto from '@/components/layout/BarraContexto'

// Fábrica: solo lo de producción (supervisor de fábrica y admin). Los pedidos de los
// locales y el catálogo del mayorista están en /mayorista desde el 25-10.
export default async function FabricaLayout({ children }: { children: React.ReactNode }) {
  const { acceso } = await exigirArea('fabrica')

  const navItems = [
    { href: '/fabrica/registro', label: 'Registro', icon: <IconBuildingFactory2 size={20} /> },
    { href: '/fabrica/personal', label: 'Personal', icon: <IconUsers size={20} /> },
    { href: '/fabrica/stock',    label: 'Stock',    icon: <IconPackage size={20} /> },
    { href: '/fabrica/reportes', label: 'Reportes', icon: <IconChartBar size={20} /> },
    ...(puedePantalla(acceso, 'tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <IconListCheck size={20} /> }] : []),
    { href: '/ayuda',            label: 'Ayuda',    icon: <IconHelp size={20} /> },
  ]

  return (
    <LayoutOperativo titulo="Fábrica" subtitulo={acceso.nombre} rol={acceso.rol} navItems={navItems}
      contexto={<BarraContexto areas={opcionesDeArea(acceso)} areaActual="fabrica" />}>
      {children}
    </LayoutOperativo>
  )
}
