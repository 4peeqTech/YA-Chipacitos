import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AyudaClient from './AyudaClient'

export const dynamic = 'force-dynamic'

export default async function AyudaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, local_nombre').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const backHref = profile.rol === 'admin'
    ? '/admin/dashboard'
    : profile.rol === 'deposito' || profile.rol === 'fabrica'
      ? '/operador/pedidos'
      : '/local/pedidos'

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="bg-[#111111] border-b border-[#2a2a2a] px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <Link href={backHref} className="text-[#888] hover:text-[#f0f0f0] transition-colors text-sm">
          ← Volver
        </Link>
        <div className="flex-1" />
        <span className="font-['Syne'] font-bold text-[#e8c547] text-sm">YA! Chipacitos</span>
        <span className="text-xs bg-[#e8c547]/10 text-[#e8c547] px-2 py-0.5 rounded-full uppercase tracking-wider">Ayuda</span>
      </header>

      <AyudaClient rol={profile.rol} />
    </div>
  )
}
