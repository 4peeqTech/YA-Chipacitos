'use client'

import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

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
    <header className="bg-[#111111] border-b-2 border-[#e8c547] px-4 py-0 flex items-stretch gap-3 shadow-[0_4px_24px_rgba(0,0,0,.6)] sticky top-0 z-50 min-h-[56px]">
      <div className="flex items-center gap-3 flex-1 min-w-0 py-2">
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
      <button
        onClick={toggleTheme}
        className="text-[#888] hover:text-[#e8c547] transition-colors shrink-0 flex items-center"
        title={light ? 'Tema oscuro' : 'Tema claro'}
      >
        {light ? '🌙' : '☀️'}
      </button>
      <button
        onClick={handleLogout}
        className="text-[#888] hover:text-[#e8c547] transition-colors shrink-0 flex items-center ml-1"
        title="Salir"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </header>
  )
}
