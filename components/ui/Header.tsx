'use client'

import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LogOut, Moon, Sun } from 'lucide-react'
import NotificationBell from '@/components/ui/NotificationBell'

interface HeaderProps {
  titulo: string
  subtitulo?: string
  rol?: string
}

const rolLabel: Record<string, string> = {
  local:    'Sucursal',
  fabrica:  'Fábrica',
  deposito: 'Depósito',
  admin:    'Admin',
  squad:    'Squad',
}

export default function Header({ titulo, subtitulo, rol }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const [light, setLight] = useState(false)

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'))
  }, [])

  function toggleTheme() {
    const next = !light
    setLight(next)
    if (next) {
      document.documentElement.classList.add('light')
      document.cookie = 'theme=light; path=/; max-age=31536000'
    } else {
      document.documentElement.classList.remove('light')
      document.cookie = 'theme=dark; path=/; max-age=31536000'
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-[#111111] border-b-2 border-[#e8c547] px-4 py-0 flex items-center gap-3 shadow-[0_4px_24px_rgba(0,0,0,.6)] sticky top-0 z-50 min-h-[56px]">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Image src="/chipacitos-logo.png" alt="YA! Chipacitos" width={36} height={36} className="rounded-md shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-['Syne'] font-bold text-[#e8c547] text-base leading-tight truncate">{titulo}</p>
          {subtitulo && <p className="text-[#888] text-[11px]">{subtitulo}</p>}
        </div>
      </div>
      {rol && (
        <div className="flex items-center shrink-0">
          <span className="text-[10px] font-semibold text-[#888] bg-[#1a1a1a] border border-[#2a2a2a] px-2.5 py-1 rounded-full uppercase tracking-wider">
            {rolLabel[rol] || rol}
          </span>
        </div>
      )}
      <NotificationBell />
      <button
        onClick={toggleTheme}
        className="text-[#888] hover:text-[#e8c547] transition-colors shrink-0 w-8 h-8 flex items-center justify-center"
        title={light ? 'Tema oscuro' : 'Tema claro'}
        aria-label={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      >
        {light ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      <button
        onClick={handleLogout}
        className="text-[#888] hover:text-[#e8c547] transition-colors shrink-0 w-8 h-8 flex items-center justify-center"
        title="Salir"
        aria-label="Cerrar sesión"
      >
        <LogOut size={18} />
      </button>
    </header>
  )
}
