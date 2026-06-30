import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import Sidebar from '@/components/ui/Sidebar'
import { ROLE_HOME } from '@/lib/modulos'
import type { Rol } from '@/lib/types'

const ROL_LABEL: Record<string, string> = { admin: 'Admin', squad: 'Squad' }

export default async function TareasLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos').eq('id', user.id).single()

  if (!profile) redirect('/login')

  const modulosPermitidos: string[] = profile.modulos_permitidos || []
  const tieneAcceso = profile.rol === 'admin' || modulosPermitidos.includes('tareas')
  if (!tieneAcceso) redirect(ROLE_HOME[profile.rol as Rol] || '/login')

  // Admin y Squad ya navegan todo el sistema con el Sidebar — mantenerlo
  // acá evita que Tareas se sienta "fuera" del resto de la app para ellos.
  // Local/Depósito/Fábrica no tienen ese patrón (usan BottomNav), así que
  // se quedan con el header simple + volver.
  if (profile.rol === 'admin' || profile.rol === 'squad') {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Sidebar
          nombre={profile.nombre || 'Admin'}
          rolLabel={ROL_LABEL[profile.rol] || 'Admin'}
          modulosPermitidos={profile.rol === 'squad' ? modulosPermitidos : undefined}
        />
        <div className="lg:ml-60 flex flex-col min-h-screen">
          <div className="lg:hidden">
            <Header titulo="Tareas" subtitulo={profile.nombre} rol={profile.rol} />
          </div>
          <header className="hidden lg:flex items-center justify-between px-6 py-4 bg-[#111111] border-b border-[#2a2a2a] sticky top-0 z-30">
            <div />
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#888]">{profile.nombre}</span>
              <span className="text-xs bg-[#e8c547]/10 text-[#e8c547] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">{ROL_LABEL[profile.rol] || 'Admin'}</span>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header titulo="Tareas" subtitulo={profile.nombre} rol={profile.rol} />
      <div className="px-4 lg:px-6 pt-3">
        <Link
          href={ROLE_HOME[profile.rol as Rol] || '/'}
          className="text-xs text-[#888] hover:text-[#e8c547] transition-colors inline-flex items-center gap-1"
        >
          ← Volver
        </Link>
      </div>
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  )
}
