'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface BottomNavProps {
  items: NavItem[]
}

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav className="bg-[#111111] border-t border-[#2a2a2a] flex safe-bottom">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
              active ? 'text-[#e8c547]' : 'text-[#888]'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
