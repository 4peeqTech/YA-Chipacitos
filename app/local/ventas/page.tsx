export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Card from '@/components/ui/Card'

export default async function VentasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const hoy = new Date().toISOString().split('T')[0]
  const { data: ventas } = await supabase
    .from('ventas_posberry')
    .select('*')
    .eq('local_id', user.id)
    .eq('fecha', hoy)
    .order('producto_nombre')

  const total = ventas?.reduce((s, v) => s + (v.importe || 0), 0) || 0

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <p className="text-base font-medium text-[#f0f0f0]">${total.toLocaleString('es-AR', { minimumFractionDigits: 0 })}</p>
          <p className="text-[11px] text-[#888] mt-0.5">Vendido hoy</p>
        </Card>
        <Card className="p-3">
          <p className="text-base font-medium text-[#f0f0f0]">{ventas?.length || 0}</p>
          <p className="text-[11px] text-[#888] mt-0.5">Productos vendidos</p>
        </Card>
      </div>

      <p className="text-[11px] font-medium text-[#e8c547] uppercase tracking-wider">Detalle del día</p>

      {!ventas || ventas.length === 0 ? (
        <Card className="p-6 text-center text-xs text-[#888]">Sin ventas registradas hoy. El admin importa los datos de Posberry.</Card>
      ) : (
        <Card>
          {ventas.map((v, i) => (
            <div key={v.id} className={`flex items-center justify-between px-3 py-2 text-xs ${i < ventas.length - 1 ? 'border-b border-[#2a2a2a]' : ''}`}>
              <span className="text-[#f0f0f0] font-medium">{v.producto_nombre}</span>
              <div className="flex gap-4 text-right">
                <span className="text-[#888]">{v.cantidad} u.</span>
                <span className="text-[#f0f0f0] font-medium">${(v.importe || 0).toLocaleString('es-AR')}</span>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
