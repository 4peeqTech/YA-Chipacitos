import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/ui/Header'
import BottomNav from '@/components/ui/BottomNav'
import Sidebar from '@/components/ui/Sidebar'
import NotificationBell from '@/components/ui/NotificationBell'
import { esRolConModulos } from '@/lib/modulos'

// El control fino de qué rutas /admin/* puede pisar un usuario squad o de
// rol personalizado (según modulos_permitidos) vive en proxy.ts, que es
// el único lugar del árbol de Server Components con acceso al pathname
// de la request.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos, roles(nombre)').eq('id', user.id).single()

  if (!profile) redirect('/login')
  if (profile.rol !== 'admin' && !esRolConModulos(profile.rol)) redirect('/login')

  const rolLabel = (profile.roles as unknown as { nombre: string } | null)?.nombre || 'Admin'
  const esSquad = esRolConModulos(profile.rol)
  const modulosPermitidos: string[] = profile.modulos_permitidos || []

  const tieneTareas = !esSquad || modulosPermitidos.includes('tareas')

  const navItems = [
    { href: '/admin/dashboard',    label: 'Dashboard',       icon: '🏠' },
    { href: '/admin/gastos',       label: 'Gastos',          icon: '💰' },
    { href: '/admin/conciliacion', label: 'Conciliación',    icon: '📊' },
    { href: '/admin/importar',     label: 'Sincronizar',     icon: '🔄' },
    ...(tieneTareas ? [{ href: '/tareas', label: 'Tareas', icon: '📋' }] : []),
    { href: '/ayuda',              label: 'Ayuda',           icon: '❓' },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Sidebar solo desktop */}
      <Sidebar
        nombre={profile?.nombre || 'Admin'}
        rolLabel={rolLabel}
        modulosPermitidos={esSquad ? modulosPermitidos : undefined}
        usuarioEmail={user.email}
      />

      {/* Contenido principal — empuja a la derecha en desktop */}
      <div className="lg:ml-60 flex flex-col min-h-screen">
        {/* Header solo mobile */}
        <div className="lg:hidden">
          <Header titulo="YA! Chipacitos" subtitulo={profile?.nombre} rol={profile?.rol} />
        </div>

        {/* Header desktop */}
        <header className="hidden lg:flex items-center justify-between px-6 py-4 bg-[#111111] border-b border-[#2a2a2a] sticky top-0 z-30">
          <div />
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#888]">{profile?.nombre}</span>
              <span className="text-xs bg-[#e8c547]/10 text-[#e8c547] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">{rolLabel}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>

        {/* Bottom nav solo mobile — fijo abajo */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
          <BottomNav items={navItems} />
        </div>
      </div>
    </div>
  )
}
