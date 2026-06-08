export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Card from '@/components/ui/Card'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const [
    { data: ventasHoy },
    { count: pedidosPendientes },
    { count: pedidosEnviados },
    { count: alertas },
  ] = await Promise.all([
    supabase.from('ventas_posberry').select('importe').eq('fecha', hoy),
    supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'enviado').gte('enviado_at', hoy),
    supabase.from('conciliaciones').select('*', { count: 'exact', head: true }).eq('tiene_alerta', true).eq('fecha', hoy),
  ])

  const totalVendido = ventasHoy?.reduce((s, v) => s + (v.importe || 0), 0) || 0

  const metricas = [
    { label: 'Vendido hoy',          valor: `$${totalVendido.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`, color: 'text-[#56d68a]',  bg: 'bg-[rgba(86,214,138,.1)]',  icon: '💰' },
    { label: 'Pedidos pendientes',   valor: pedidosPendientes || 0, color: 'text-[#f0a849]', bg: 'bg-[rgba(240,168,73,.1)]', icon: '⏳' },
    { label: 'Enviados hoy',         valor: pedidosEnviados || 0,   color: 'text-[#38bdf8]',   bg: 'bg-[rgba(56,189,248,.1)]',   icon: '🚚' },
    { label: 'Alertas conciliación', valor: alertas || 0, color: alertas ? 'text-[#e84210]' : 'text-[#888]', bg: alertas ? 'bg-[rgba(232,66,16,.1)]' : 'bg-[#1a1a1a]', icon: alertas ? '🚨' : '✅' },
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Dashboard</h1>
        <p className="text-sm text-[#888]">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricas.map(m => (
          <Card key={m.label} className={`p-4 ${m.bg}`}>
            <div className="text-2xl mb-2">{m.icon}</div>
            <div className={`text-2xl lg:text-3xl font-black ${m.color}`}>{m.valor}</div>
            <div className="text-xs text-[#888] mt-1">{m.label}</div>
          </Card>
        ))}
      </div>

      {/* Alerta */}
      {alertas ? (
        <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210] rounded-xl p-4">
          <p className="font-semibold text-[#e84210]">
            🚨 {alertas} producto{alertas !== 1 ? 's' : ''} con diferencias en conciliación hoy
          </p>
          <Link href="/admin/conciliacion" className="text-sm text-[#e84210] underline mt-1 inline-block">
            Ver conciliación →
          </Link>
        </div>
      ) : null}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-sm font-semibold text-[#e8c547] uppercase tracking-wider mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: '/admin/conciliacion', icon: '📊', label: 'Conciliación',  desc: 'Ventas vs pedidos' },
            { href: '/admin/importar',     icon: '🔄', label: 'Sincronizar',   desc: 'Datos de Google Sheets' },
            { href: '/admin/usuarios',     icon: '👥', label: 'Usuarios',      desc: 'Gestionar accesos' },
          ].map(item => (
            <Link key={item.href} href={item.href} className="block">
              <Card className="p-4 hover:border-[#e8c547] hover:shadow-[0_4px_24px_rgba(0,0,0,.4)] transition-all cursor-pointer">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-semibold text-[#f0f0f0]">{item.label}</div>
                <div className="text-xs text-[#888] mt-0.5">{item.desc}</div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
