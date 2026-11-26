import { exigirArea } from '@/lib/permisos/servidor'
import { opcionesDeArea, puedePantalla } from '@/lib/permisos/acceso'
import { IconHelp, IconListCheck, IconPackages, IconTruckDelivery } from '@tabler/icons-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'
import BarraContexto from '@/components/layout/BarraContexto'

// Sección del mayorista: los pedidos de los locales y el stock de su catálogo.
// Antes vivía dentro de /fabrica (su pantalla decía "Fábrica" y compartía menú con
// Registro/Stock/Reportes); desde el 25-10 es su propia sección. Las direcciones
// viejas (/fabrica/pedidos y /fabrica/catalogo) redirigen acá.
export default async function MayoristaLayout({ children }: { children: React.ReactNode }) {
  const { acceso } = await exigirArea('mayorista')

  const navItems = [
    { href: '/mayorista/pedidos',  label: 'Pedidos',  icon: <IconTruckDelivery size={20} /> },
    { href: '/mayorista/catalogo', label: 'Catálogo', icon: <IconPackages size={20} /> },
    ...(puedePantalla(acceso, 'tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <IconListCheck size={20} /> }] : []),
    { href: '/ayuda',              label: 'Ayuda',    icon: <IconHelp size={20} /> },
  ]

  return (
    <LayoutOperativo titulo="Mayorista" subtitulo={acceso.nombre} rol={acceso.rol} navItems={navItems}
      contexto={<BarraContexto areas={opcionesDeArea(acceso)} areaActual="mayorista" />}>
      {children}
    </LayoutOperativo>
  )
}
