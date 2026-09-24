'use client'

import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { LogOut, Moon, Sun } from 'lucide-react'
import NotificationBell from '@/components/ui/NotificationBell'
import { BadgeEntorno } from '@/components/ui/Badge'

interface HeaderProps {
  titulo: string
  subtitulo?: string
  rol?: string
}

const rolLabel: Record<string, string> = {
  local:    'Sucursal',
  supervisor_fabrica: 'Supervisor de Fábrica',
  mayorista: 'Mayorista',
  deposito: 'Depósito',
  admin:    'Admin',
  squad:    'Squad',
}

// El tema vive en la clase `light` de <html> (la pone el layout desde la
// cookie). En el server se asume oscuro; al hidratar se lee la clase real.
function suscribirTema(onCambio: () => void) {
  const obs = new MutationObserver(onCambio)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => obs.disconnect()
}
const leerTemaClaro = () => document.documentElement.classList.contains('light')
const temaClaroEnServer = () => false

export default function Header({ titulo, subtitulo, rol }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const light = useSyncExternalStore(suscribirTema, leerTemaClaro, temaClaroEnServer)

  function toggleTheme() {
    const next = !light
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
    <header className="bg-surface border-b-2 border-accent px-4 py-0 flex items-center gap-3 shadow-[0_4px_24px_rgba(0,0,0,.6)] sticky top-0 z-50 min-h-[56px]">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Image src="/chipacitos-logo.png" alt="YA! Chipacitos" width={36} height={36} className="rounded-md shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-['Syne'] font-bold text-accent text-base leading-tight truncate">{titulo}</p>
          {subtitulo && <p className="text-muted text-2xs">{subtitulo}</p>}
        </div>
      </div>
      <div className="shrink-0">
        <BadgeEntorno corto />
      </div>
      {/* En celular el rol no entra: el título y el nombre ya dicen dónde estás. */}
      {rol && (
        <div className="hidden sm:flex items-center shrink-0">
          <span className="text-3xs font-semibold text-muted bg-surface2 border border-border px-2.5 py-1 rounded-full uppercase tracking-wider">
            {rolLabel[rol] || rol}
          </span>
        </div>
      )}
      <NotificationBell />
      <button
        onClick={toggleTheme}
        className="text-muted hover:text-accent transition-colors shrink-0 w-8 h-8 flex items-center justify-center"
        title={light ? 'Tema oscuro' : 'Tema claro'}
        aria-label={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      >
        {light ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      <button
        onClick={handleLogout}
        className="text-muted hover:text-accent transition-colors shrink-0 w-8 h-8 flex items-center justify-center"
        title="Salir"
        aria-label="Cerrar sesión"
      >
        <LogOut size={18} />
      </button>
    </header>
  )
}
