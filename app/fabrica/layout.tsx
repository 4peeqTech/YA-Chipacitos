import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/ui/Header'
import BottomNav from '@/components/ui/BottomNav'

export default async function FabricaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol').eq('id', user.id).single()

  if (profile?.rol !== 'fabrica' && profile?.rol !== 'admin') redirect('/login')

  const navItems = [
    { href: '/fabrica/pedidos',   label: 'Pedidos',  icon: '🚚' },
    { href: '/fabrica/catalogo',  label: 'Catálogo', icon: '🔀' },
    { href: '/ayuda',             label: 'Ayuda',    icon: '❓' },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header titulo="Fábrica" subtitulo={profile?.nombre} rol="fabrica" />
      <main className="flex-1 pb-24 lg:pb-16 w-full lg:pt-4">
        {children}
      </main>
      <div className="lg:hidden fixed bottom-0 left-0 right-0">
        <BottomNav items={navItems} />
      </div>
      <div className="hidden lg:block fixed bottom-0 left-0 right-0 bg-[#111111] border-t border-[#2a2a2a]">
        <div className="flex">
          {navItems.map(item => (
            <a key={item.href} href={item.href}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] text-[#888] hover:text-[#e8c547]">
              <span className="text-lg">{item.icon}</span>{item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
