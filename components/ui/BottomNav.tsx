'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  /** Número chico sobre el ícono (ej. pedidos en camino sin confirmar). 0 o nada = no se muestra. */
  badge?: number
}

interface BottomNavProps {
  items: NavItem[]
}

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav className="bg-surface border-t border-border flex safe-bottom">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-3xs font-medium transition-colors ${
              active ? 'text-accent' : 'text-muted'
            }`}
          >
            <span className="relative text-lg leading-none">
              {item.icon}
              {!!item.badge && (
                <span className="absolute -right-2.5 -top-1.5 min-w-4 h-4 rounded-full bg-accent2 px-1 text-3xs font-bold leading-4 text-black text-center" aria-label={`${item.badge} pendientes`}>
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
