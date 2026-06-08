'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    const redirectMap: Record<string, string> = {
      local:    '/local/pedidos',
      deposito: '/deposito/pedidos',
      fabrica:  '/fabrica/pedidos',
      admin:    '/admin/dashboard',
    }

    router.push(profile?.rol ? redirectMap[profile.rol] : '/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/chipacitos-logo.png" alt="YA! Chipacitos" width={100} height={100} className="rounded-2xl shadow-lg" />
          <p className="font-['Syne'] font-bold text-[#e8c547] text-xl tracking-tight">YA! Chipacitos</p>
          <p className="text-[#888] text-sm">Sistema de gestión interna</p>
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@email.com"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] placeholder:text-[#555] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#e8c547] transition-colors [color-scheme:dark] autofill:bg-[#1a1a1a]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-2">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] placeholder:text-[#555] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#e8c547] transition-colors [color-scheme:dark]"
              />
            </div>

            {error && (
              <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 text-[#e84210] text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold py-3 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed tracking-wide mt-2"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
