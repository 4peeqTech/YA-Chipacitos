import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import { ROLE_HOME } from '@/lib/modulos'
import type { Rol } from '@/lib/types'

export default async function TareasLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos').eq('id', user.id).single()

  if (!profile) redirect('/login')

  const tieneAcceso = profile.rol === 'admin' || (profile.modulos_permitidos || []).includes('tareas')
  if (!tieneAcceso) redirect(ROLE_HOME[profile.rol as Rol] || '/login')

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
