import { redirect } from 'next/navigation'
import { exigirSesion } from '@/lib/permisos/servidor'
import { homeDe, pantallasDe, puedePantalla } from '@/lib/permisos/acceso'
import Link from 'next/link'
import { LayoutDashboard, Wallet, BarChart3, RefreshCw, ListTodo, HelpCircle } from 'lucide-react'
import Header from '@/components/ui/Header'
import Sidebar from '@/components/ui/Sidebar'
import BottomNav from '@/components/ui/BottomNav'
import NotificationBell from '@/components/ui/NotificationBell'

export default async function TareasLayout({ children }: { children: React.ReactNode }) {
  const { supabase, acceso } = await exigirSesion()
  if (!puedePantalla(acceso, 'tareas')) redirect(homeDe(acceso))

  const { data: perfil } = await supabase.from('profiles').select('roles(nombre)').eq('id', acceso.id).single()
  const rolLabel = (perfil?.roles as unknown as { nombre: string } | null)?.nombre || 'Admin'
  const pantallas = pantallasDe(acceso)

  // Admin y Squad ya navegan todo el sistema con el Sidebar — mantenerlo
  // acá evita que Tareas se sienta "fuera" del resto de la app para ellos.
  // Local/Depósito/Fábrica no tienen ese patrón (usan BottomNav), así que
  // se quedan con el header simple + volver.
  if (acceso.areas.includes('administracion')) {
    const candidatos = [
      { href: '/admin/dashboard',    label: 'Dashboard',       icon: <LayoutDashboard size={20} />, key: 'dashboard' },
      { href: '/admin/gastos',       label: 'Gastos',          icon: <Wallet size={20} />, key: 'gastos' },
      { href: '/admin/conciliacion', label: 'Conciliación',    icon: <BarChart3 size={20} />, key: 'conciliacion' },
      { href: '/admin/importar',     label: 'Sincronizar',     icon: <RefreshCw size={20} />, key: 'importar' },
    ]
    const navItems = [
      ...(acceso.esAdmin ? candidatos : candidatos.filter(c => pantallas.includes(c.key))),
      { href: '/tareas', label: 'Tareas', icon: <ListTodo size={20} /> },
      { href: '/ayuda', label: 'Ayuda', icon: <HelpCircle size={20} /> },
    ]

    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Sidebar
          nombre={acceso.nombre || 'Admin'}
          rolLabel={rolLabel}
          modulosPermitidos={acceso.esAdmin ? undefined : pantallas}
          usuarioEmail={acceso.email}
        />
        <div className="lg:ml-60 flex flex-col min-h-screen">
          <div className="lg:hidden">
            <Header titulo="Tareas" subtitulo={acceso.nombre} rol={acceso.rol} />
          </div>
          <header className="hidden lg:flex items-center justify-between px-6 py-4 bg-[#111111] border-b border-[#2a2a2a] sticky top-0 z-30">
            <div />
            <div className="flex items-center gap-4">
              <NotificationBell />
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#888]">{acceso.nombre}</span>
                <span className="text-xs bg-[#e8c547]/10 text-[#e8c547] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">{rolLabel}</span>
              </div>
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
      <Header titulo="Tareas" subtitulo={acceso.nombre} rol={acceso.rol} />
      <div className="px-4 lg:px-6 pt-3">
        <Link
          href={homeDe(acceso)}
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
