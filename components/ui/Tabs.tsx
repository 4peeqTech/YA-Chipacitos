'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export interface TabItem {
  href: string
  label: string
  icon?: ReactNode
}

export default function Tabs({ items }: { items: TabItem[] }) {
  const pathname = usePathname()

  const activeHref = [...items]
    .filter(item => pathname === item.href || pathname.startsWith(item.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4 mb-6">
      {items.map(item => {
        const active = item.href === activeHref
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              active
                ? 'bg-accent text-black'
                : 'bg-surface2 text-muted hover:text-text hover:bg-border'
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
