import { exigirArea, sucursalesDeLocales } from '@/lib/permisos/servidor'
import { opcionesDeArea, puedePantalla } from '@/lib/permisos/acceso'
import { Plus, ClipboardList, ListTodo, HelpCircle } from 'lucide-react'
import { IconBuildingStore } from '@tabler/icons-react'
import LayoutOperativo from '@/components/layout/LayoutOperativo'
import BarraContexto from '@/components/layout/BarraContexto'
import EmptyState from '@/components/ui/EmptyState'

// Locales trabaja sobre una sucursal (T4): la de la cuenta de local, o la elegida
// en el selector si la persona tiene varias. Las páginas leen la misma con
// sucursalesDeLocales().
export default async function LocalLayout({ children }: { children: React.ReactNode }) {
  const { supabase, acceso } = await exigirArea('locales')
  const { sucursales, actual } = await sucursalesDeLocales()

  const [{ data: profile }, { count: enCamino }] = await Promise.all([
    supabase.from('profiles').select('nombre, local_nombre, roles(nombre)').eq('id', acceso.id).single(),
    // Pedidos en camino sin confirmar: número sobre la pestaña "Pedidos".
    actual
      ? supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('local_id', actual.cuentaLocalId).eq('estado', 'enviado')
      : Promise.resolve({ count: 0 }),
  ])

  const navItems = [
    { href: '/local/pedidos',   label: 'Pedir',   icon: <Plus size={20} /> },
    { href: '/local/historial', label: 'Pedidos', icon: <ClipboardList size={20} />, badge: enCamino ?? 0 },
    ...(puedePantalla(acceso, 'tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <ListTodo size={20} /> }] : []),
    { href: '/ayuda',           label: 'Ayuda',   icon: <HelpCircle size={20} /> },
  ]

  // La cuenta de un local se sigue viendo con su nombre. Con varias sucursales el
  // selector dice cuál; con una sola (sin ser su cuenta), el título.
  const esCuentaDeLocal = actual?.cuentaLocalId === acceso.id
  const titulo = esCuentaDeLocal ? profile?.local_nombre || profile?.nombre || 'Local'
    : sucursales.length > 1 ? 'Locales' : actual?.nombre ?? 'Locales'
  const rolNombre = esCuentaDeLocal ? 'local' : (profile?.roles as unknown as { nombre: string } | null)?.nombre ?? acceso.rol

  return (
    <LayoutOperativo titulo={titulo} subtitulo={esCuentaDeLocal ? undefined : acceso.nombre} rol={rolNombre} navItems={navItems}
      contexto={<BarraContexto areas={opcionesDeArea(acceso)} areaActual="locales" sucursales={sucursales} sucursalActual={actual?.id} />}>
      {actual ? children : (
        <EmptyState icono={IconBuildingStore} titulo="No tenés una sucursal para trabajar"
          descripcion="Para pedir y ver pedidos hace falta una sucursal con cuenta de local. Pedísela a quien gestiona usuarios." />
      )}
    </LayoutOperativo>
  )
}
