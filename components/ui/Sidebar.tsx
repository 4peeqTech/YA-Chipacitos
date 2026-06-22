'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

interface SidebarProps {
  nombre: string
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

const standaloneItems: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '🏠' },
]

const sections: NavSection[] = [
  {
    label: 'Gastos',
    items: [
      { href: '/admin/gastos',            label: 'Gastos',            icon: '💰' },
      { href: '/admin/gastos/pendientes', label: 'Pendientes de pago', icon: '⏳' },
      { href: '/admin/resumen',           label: 'Resumen por local', icon: '📊' },
      { href: '/admin/fudo',              label: 'Fudo / Caja',       icon: '🏧' },
    ],
  },
  {
    label: 'Mayorista',
    items: [
      { href: '/admin/importar',     label: 'Sincronizar',       icon: '🔄' },
      { href: '/admin/posberry',     label: 'Ventas Posberry',   icon: '📈' },
      { href: '/admin/conciliacion', label: 'Conciliación',      icon: '📊' },
    ],
  },
  {
    label: 'Parámetros',
    items: [
      { href: '/admin/catalogo',     label: 'Catálogo',          icon: '📦' },
      { href: '/admin/mapeos',       label: 'Mapeo productos',   icon: '🔗' },
      { href: '/admin/usuarios',     label: 'Usuarios',          icon: '👥' },
      { href: '/admin/proveedores',  label: 'Proveedores',       icon: '🚚' },
      { href: '/admin/locales',      label: 'Locales',           icon: '🏪' },
      { href: '/admin/cajas',        label: 'Cajas',             icon: '🏦' },
      { href: '/admin/formas-pago',  label: 'Formas de pago',    icon: '💳' },
    ],
  },
]

const bottomStandaloneItems: NavItem[] = [
  { href: '/ayuda', label: 'Ayuda', icon: '❓' },
]

export default function Sidebar({ nombre }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

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

  const isItemActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="hidden lg:flex flex-col w-60 bg-[#111111] border-r border-[#2a2a2a] min-h-screen fixed left-0 top-0 z-40">
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
            <p className="text-[#888] text-[10px]">Admin</p>
          </div>
        </div>
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
