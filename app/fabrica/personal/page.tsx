export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Users } from 'lucide-react'
import Card from '@/components/ui/Card'

export default async function FabricaPersonalPage() {
  const supabase = await createClient()
  const { data: operarios } = await supabase
    .from('fabrica_operarios').select('*').order('orden').order('nombre')

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-['Syne'] font-bold text-[#f0f0f0]">Personal</h1>
        <p className="text-[#888] text-xs mt-0.5">
          Operarios a cargo. Se editan desde Admin → Parámetros → Fábrica.
        </p>
      </div>

      {!operarios || operarios.length === 0 ? (
        <p className="text-center text-[#888] text-sm py-8">Todavía no hay operarios cargados.</p>
      ) : (
        <div className="space-y-2">
          {operarios.map(op => (
            <Card key={op.id} className={`p-4 flex items-center gap-3 ${!op.activo ? 'opacity-50' : ''}`}>
              <div className="w-10 h-10 shrink-0 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-[#e8c547]">
                <Users size={18} />
              </div>
              <p className="flex-1 min-w-0 text-sm font-semibold text-[#f0f0f0] truncate">{op.nombre}</p>
              <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border shrink-0 ${
                op.activo ? 'bg-green-900/30 border-green-800 text-green-300' : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#666]'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${op.activo ? 'bg-green-400' : 'bg-[#555]'}`} />
                {op.activo ? 'Activo' : 'Inactivo'}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
