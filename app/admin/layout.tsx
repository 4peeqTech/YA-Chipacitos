import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/ui/Header'
import BottomNav from '@/components/ui/BottomNav'
import Sidebar from '@/components/ui/Sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol').eq('id', user.id).single()

  if (profile?.rol !== 'admin') redirect('/login')

  const navItems = [
    { href: '/admin/dashboard',    label: 'Dashboard',       icon: '🏠' },
    { href: '/admin/gastos',       label: 'Gastos',          icon: '💰' },
    { href: '/admin/conciliacion', label: 'Conciliación',    icon: '📊' },
    { href: '/admin/importar',     label: 'Sincronizar',     icon: '🔄' },
    { href: '/ayuda',              label: 'Ayuda',           icon: '❓' },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Sidebar solo desktop */}
      <Sidebar nombre={profile?.nombre || 'Admin'} />

      {/* Contenido principal — empuja a la derecha en desktop */}
      <div className="lg:ml-60 flex flex-col min-h-screen">
        {/* Header solo mobile */}
        <div className="lg:hidden">
          <Header titulo="YA! Chipacitos" subtitulo={profile?.nombre} rol="admin" />
        </div>

        {/* Header desktop */}
        <header className="hidden lg:flex items-center justify-between px-6 py-4 bg-[#111111] border-b border-[#2a2a2a] sticky top-0 z-30">
          <div />
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#888]">{profile?.nombre}</span>
            <span className="text-xs bg-[#e8c547]/10 text-[#e8c547] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">Admin</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>

        {/* Bottom nav solo mobile */}
        <div className="lg:hidden">
          <BottomNav items={navItems} />
        </div>
      </div>
    </div>
  )
}
