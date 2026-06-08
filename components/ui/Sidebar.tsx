'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface SidebarProps {
  nombre: string
}

const links = [
  { href: '/admin/dashboard',    label: 'Dashboard',       icon: '🏠' },
  { href: '/admin/conciliacion', label: 'Conciliación',    icon: '📊' },
  { href: '/admin/mapeos',       label: 'Mapeo productos', icon: '🔗' },
  { href: '/admin/importar',     label: 'Sincronizar',     icon: '🔄' },
  { href: '/admin/usuarios',     label: 'Usuarios',        icon: '👥' },
  { href: '/admin/posberry',     label: 'Ventas Posberry', icon: '📈' },
  { href: '/ayuda',              label: 'Ayuda',           icon: '❓' },
]

export default function Sidebar({ nombre }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

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
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(link => {
          const active = pathname === link.href || pathname.startsWith(link.href + '/')
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-[#e8c547] text-black font-bold'
                  : 'text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'
              }`}
            >
              <span className="text-base">{link.icon}</span>
              {link.label}
            </Link>
          )
        })}
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
