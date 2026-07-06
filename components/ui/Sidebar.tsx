'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { MODULOS } from '@/lib/modulos'

interface SidebarProps {
  nombre: string
  rolLabel?: string
  /** Si se omite, el usuario ve todos los módulos (admin). Si se pasa, solo ve los incluidos. */
  modulosPermitidos?: string[]
}

interface NavItem {
  href: string
  label: string
  icon: string
}

interface NavSection {
  label: string
  items: NavItem[]
}

const bottomStandaloneItems: NavItem[] = [
  { href: '/ayuda', label: 'Ayuda', icon: '❓' },
]

export default function Sidebar({ nombre, rolLabel = 'Admin', modulosPermitidos }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const modulosVisibles = modulosPermitidos
    ? MODULOS.filter(m => modulosPermitidos.includes(m.key))
    : MODULOS

  const standaloneItems: NavItem[] = modulosVisibles
    .filter(m => !m.section)
    .map(m => ({ href: m.href, label: m.label, icon: m.icon }))

  const sections: NavSection[] = Object.values(
    modulosVisibles.reduce((acc, m) => {
      if (!m.section) return acc
      if (!acc[m.section]) acc[m.section] = { label: m.section, items: [] }
      acc[m.section].items.push({ href: m.href, label: m.label, icon: m.icon })
      return acc
    }, {} as Record<string, NavSection>)
  )

  // Abre automáticamente la sección activa
  useEffect(() => {
    const activeSection = sections.find(s => s.items.some(i => pathname.startsWith(i.href)))
    if (activeSection) {
      setExpandedSections(new Set([activeSection.label]))
    }
  }, [pathname])

  const toggleSection = (sectionLabel: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionLabel)) {
      newExpanded.delete(sectionLabel)
    } else {
      newExpanded.add(sectionLabel)
    }
    setExpandedSections(newExpanded)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const allNavItems = [...standaloneItems, ...sections.flatMap(s => s.items), ...bottomStandaloneItems]
  const isItemActive = (href: string) => {
    const best = allNavItems
      .filter(item => pathname === item.href || pathname.startsWith(item.href + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0]
    return best?.href === href
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 bg-[#111111] border-r border-[#2a2a2a] h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <Image src="/chipacitos-logo.png" alt="YA! Chipacitos" width={48} height={48} className="rounded-lg shrink-0" />
        <div>
          <p className="font-['Syne'] font-bold text-[#e8c547] text-sm leading-tight">YA! Chipacitos</p>
          <p className="text-[#888] text-[10px] mt-0.5">Sistema de gestión</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto">
        {/* Standalone items */}
        {standaloneItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isItemActive(item.href)
                ? 'bg-[#e8c547] text-black font-bold'
                : 'text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* Sections */}
        {sections.map(section => (
          <div key={section.label}>
            <button
              onClick={() => toggleSection(section.label)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-[#666] hover:text-[#888] transition-colors uppercase tracking-wider"
            >
              {section.label}
              <span className={`text-xs transition-transform ${expandedSections.has(section.label) ? 'rotate-0' : '-rotate-90'}`}>
                ▼
              </span>
            </button>

            {expandedSections.has(section.label) && (
              <div className="space-y-1 pl-2">
                {section.items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isItemActive(item.href)
                        ? 'bg-[#e8c547] text-black font-bold'
                        : 'text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Ayuda al final */}
        {bottomStandaloneItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isItemActive(item.href)
                ? 'bg-[#e8c547] text-black font-bold'
                : 'text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-[#2a2a2a]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-[#e8c547] rounded-full flex items-center justify-center shrink-0">
            <span className="text-black text-xs font-bold">{nombre.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#f0f0f0] text-xs font-medium truncate">{nombre}</p>
            <p className="text-[#888] text-[10px]">{rolLabel}</p>
          </div>
        </div>
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="w-full text-xs text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] py-2 rounded-lg transition-colors text-left px-3"
        >
          → Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
