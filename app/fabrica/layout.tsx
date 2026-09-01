import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Truck, Factory, Users, Package, BarChart3, Shuffle, ListTodo, HelpCircle } from 'lucide-react'
import Header from '@/components/ui/Header'
import BottomNav from '@/components/ui/BottomNav'

export default async function FabricaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos').eq('id', user.id).single()

  if (!['supervisor_fabrica', 'mayorista', 'admin'].includes(profile?.rol ?? '')) redirect('/login')

  // Pedidos y Catálogo son de mayorista/admin — supervisor_fabrica no los ve (ver guard en
  // app/fabrica/pedidos/page.tsx y app/fabrica/catalogo/page.tsx). Mayorista, a su vez, no ve
  // el resto del árbol de fábrica (Registro/Personal/Stock/Reportes).
  const veCatalogoPedidos = ['admin', 'mayorista'].includes(profile?.rol ?? '')
  const veFabricaOperativa = profile?.rol !== 'mayorista'

  const navItems = [
    ...(veCatalogoPedidos ? [{ href: '/fabrica/pedidos', label: 'Pedidos', icon: <Truck size={20} /> }] : []),
    ...(veFabricaOperativa ? [
      { href: '/fabrica/registro',   label: 'Registro',   icon: <Factory size={20} /> },
      { href: '/fabrica/personal',   label: 'Personal',   icon: <Users size={20} /> },
      { href: '/fabrica/stock',      label: 'Stock',      icon: <Package size={20} /> },
      { href: '/fabrica/reportes',   label: 'Reportes',   icon: <BarChart3 size={20} /> },
    ] : []),
    ...(veCatalogoPedidos ? [{ href: '/fabrica/catalogo', label: 'Catálogo', icon: <Shuffle size={20} /> }] : []),
    ...(profile?.modulos_permitidos?.includes('tareas') ? [{ href: '/tareas', label: 'Tareas', icon: <ListTodo size={20} /> }] : []),
    { href: '/ayuda',             label: 'Ayuda',    icon: <HelpCircle size={20} /> },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header titulo="Fábrica" subtitulo={profile?.nombre} rol={profile?.rol} />
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
