import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import Sidebar from '@/components/ui/Sidebar'
import BottomNav from '@/components/ui/BottomNav'
import { getRoleHome, esRolConModulos } from '@/lib/modulos'

export default async function TareasLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos, roles(nombre)').eq('id', user.id).single()

  if (!profile) redirect('/login')

  const rolLabel = (profile.roles as unknown as { nombre: string } | null)?.nombre || 'Admin'
  const modulosPermitidos: string[] = profile.modulos_permitidos || []
  const tieneAcceso = profile.rol === 'admin' || modulosPermitidos.includes('tareas')
  if (!tieneAcceso) redirect(getRoleHome(profile.rol))

  // Admin y Squad ya navegan todo el sistema con el Sidebar — mantenerlo
  // acá evita que Tareas se sienta "fuera" del resto de la app para ellos.
  // Local/Depósito/Fábrica no tienen ese patrón (usan BottomNav), así que
  // se quedan con el header simple + volver.
  if (profile.rol === 'admin' || esRolConModulos(profile.rol)) {
    const candidatos = [
      { href: '/admin/dashboard',    label: 'Dashboard',       icon: '🏠', key: 'dashboard' },
      { href: '/admin/gastos',       label: 'Gastos',          icon: '💰', key: 'gastos' },
      { href: '/admin/conciliacion', label: 'Conciliación',    icon: '📊', key: 'conciliacion' },
      { href: '/admin/importar',     label: 'Sincronizar',     icon: '🔄', key: 'importar' },
    ]
    const navItems = [
      ...(profile.rol === 'admin' ? candidatos : candidatos.filter(c => modulosPermitidos.includes(c.key))),
      { href: '/tareas', label: 'Tareas', icon: '📋' },
      { href: '/ayuda', label: 'Ayuda', icon: '❓' },
    ]

    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Sidebar
          nombre={profile.nombre || 'Admin'}
          rolLabel={rolLabel}
          modulosPermitidos={esRolConModulos(profile.rol) ? modulosPermitidos : undefined}
        />
        <div className="lg:ml-60 flex flex-col min-h-screen">
          <div className="lg:hidden">
            <Header titulo="Tareas" subtitulo={profile.nombre} rol={profile.rol} />
          </div>
          <header className="hidden lg:flex items-center justify-between px-6 py-4 bg-[#111111] border-b border-[#2a2a2a] sticky top-0 z-30">
            <div />
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#888]">{profile.nombre}</span>
              <span className="text-xs bg-[#e8c547]/10 text-[#e8c547] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">{rolLabel}</span>
            </div>
          </header>
          <main className="flex-1 pb-20 lg:pb-0">
            {children}
          </main>
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
            <BottomNav items={navItems} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header titulo="Tareas" subtitulo={profile.nombre} rol={profile.rol} />
      <div className="px-4 lg:px-6 pt-3">
        <Link
          href={getRoleHome(profile.rol)}
          className="text-xs text-[#888] hover:text-[#e8c547] transition-colors inline-flex items-center gap-1"
        >
          ← Volver
        </Link>
      </div>
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  )
}
