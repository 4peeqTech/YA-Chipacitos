import type { ReactNode } from 'react'
import Header from '@/components/ui/Header'
import BottomNav from '@/components/ui/BottomNav'

interface NavItem {
  href: string
  label: string
  icon: ReactNode
}

/** Shell compartido por los layouts operativos (fábrica/local/depósito): Header +
 * contenido + nav inferior (BottomNav en mobile, barra horizontal en desktop). El
 * guard de acceso y la lista de navItems quedan en cada layout — lo único que se
 * repetía letra por letra era este armazón visual. */
export default function LayoutOperativo({
  titulo,
  subtitulo,
  rol,
  navItems,
  children,
}: {
  titulo: string
  subtitulo?: string
  rol?: string
  navItems: NavItem[]
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Header titulo={titulo} subtitulo={subtitulo} rol={rol} />
      <main className="flex-1 pb-24 lg:pb-16 w-full lg:pt-4">
        {children}
      </main>
      <div className="lg:hidden fixed bottom-0 left-0 right-0">
        <BottomNav items={navItems} />
      </div>
      <div className="hidden lg:block fixed bottom-0 left-0 right-0 bg-surface border-t border-border">
        <div className="flex">
          {navItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted hover:text-accent transition-colors"
            >
              <span className="text-lg">{item.icon}</span>{item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
