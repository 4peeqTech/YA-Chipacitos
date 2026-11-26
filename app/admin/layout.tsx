import { Suspense } from 'react'
import { exigirArea } from '@/lib/permisos/servidor'
import { opcionesDeArea, pantallasDe, puedePantalla } from '@/lib/permisos/acceso'
import { LayoutDashboard, Wallet, BarChart3, RefreshCw, ListTodo, HelpCircle } from 'lucide-react'
import Header from '@/components/ui/Header'
import { BadgeEntorno } from '@/components/ui/Badge'
import BottomNav from '@/components/ui/BottomNav'
import Sidebar from '@/components/ui/Sidebar'
import BarraContexto from '@/components/layout/BarraContexto'
import NotificationBell from '@/components/ui/NotificationBell'
import AvisoRedireccion from '@/components/ui/AvisoRedireccion'
import { ProveedorAcceso } from '@/components/ui/AccesoModulos'
import { IconClipboardCheck } from '@tabler/icons-react'
import { getModuloPorPath } from '@/lib/modulos'

// El control fino de qué pantallas de /admin/* puede abrir cada persona
// (lib/permisos/acceso, puedeEntrarRuta) vive en proxy.ts, que es el único
// lugar del árbol de Server Components con acceso al pathname de la request.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, acceso } = await exigirArea('administracion')

  const { data: perfil } = await supabase.from('profiles').select('roles(nombre)').eq('id', acceso.id).single()
  const rolLabel = (perfil?.roles as unknown as { nombre: string } | null)?.nombre || 'Admin'
  // Quien no es admin ve solo sus pantallas (antes: roles con módulos).
  const conPantallas = !acceso.esAdmin
  const pantallas = pantallasDe(acceso)
  const tieneTareas = puedePantalla(acceso, 'tareas')

  const navBase = [
    { href: '/admin/dashboard',    label: 'Dashboard',       icon: <LayoutDashboard size={20} /> },
    { href: '/admin/gastos',       label: 'Gastos',          icon: <Wallet size={20} /> },
    { href: '/admin/conciliacion', label: 'Conciliación',    icon: <BarChart3 size={20} /> },
    { href: '/admin/importar',     label: 'Sincronizar',     icon: <RefreshCw size={20} /> },
  ]
  // En el celular no hay sidebar: a los roles con módulos se les muestra solo lo
  // que tienen habilitado (antes veían todo y el proxy los rebotaba). Supervisión
  // va en la barra solo para ellos: el supervisor de locales trabaja desde el teléfono.
  const navItems = [
    ...(conPantallas ? navBase.filter(i => pantallas.includes(getModuloPorPath(i.href)?.key ?? '')) : navBase),
    ...(conPantallas && pantallas.includes('supervision')
      ? [{ href: '/admin/supervision', label: 'Supervisión', icon: <IconClipboardCheck size={20} /> }]
      : []),
    ...(tieneTareas ? [{ href: '/tareas', label: 'Tareas', icon: <ListTodo size={20} /> }] : []),
    { href: '/ayuda',              label: 'Ayuda',           icon: <HelpCircle size={20} /> },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Cuenta el rebote de proxy.ts cuando el link pedía un módulo sin permiso */}
      <Suspense fallback={null}><AvisoRedireccion /></Suspense>

      {/* Sidebar solo desktop */}
      <Sidebar
        nombre={acceso.nombre || 'Admin'}
        rolLabel={rolLabel}
        modulosPermitidos={conPantallas ? pantallas : undefined}
        usuarioEmail={acceso.email}
        contexto={<BarraContexto areas={opcionesDeArea(acceso)} areaActual="administracion" compacta />}
      />

      {/* Contenido principal — empuja a la derecha en desktop */}
      <div className="lg:ml-60 flex flex-col min-h-screen">
        {/* Header solo mobile */}
        <div className="lg:hidden">
          <Header titulo="YA! Chipacitos" subtitulo={acceso.nombre} rol={acceso.rol} />
          <BarraContexto areas={opcionesDeArea(acceso)} areaActual="administracion" />
        </div>

        {/* Header desktop */}
        <header className="hidden lg:flex items-center justify-between px-6 py-4 bg-[#111111] border-b border-[#2a2a2a] sticky top-0 z-30">
          <BadgeEntorno />
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#888]">{acceso.nombre}</span>
              <span className="text-xs bg-[#e8c547]/10 text-[#e8c547] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">{rolLabel}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
          {/* Los links entre pantallas se apagan si el módulo destino no está permitido */}
          <ProveedorAcceso acceso={acceso}>
            {children}
          </ProveedorAcceso>
        </main>

        {/* Bottom nav solo mobile — fijo abajo */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
          <BottomNav items={navItems} />
        </div>
      </div>
    </div>
  )
}
