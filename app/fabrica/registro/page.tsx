import Link from 'next/link'
import { Factory, Snowflake, Undo2, ArrowRight } from 'lucide-react'
import Card from '@/components/ui/Card'

const TARJETAS = [
  { href: '/fabrica/registro/produccion', label: 'Producción', descripcion: 'Cargar fécula y masa por turno', Icon: Factory },
  { href: '/fabrica/registro/embolsado', label: 'Embolsado', descripcion: 'Repartir masa de congelado en presentaciones', Icon: Snowflake },
  { href: '/fabrica/registro/devolucion', label: 'Devolución', descripcion: 'Registrar producto devuelto, con reinserción o pérdida', Icon: Undo2 },
] as const

export default function FabricaRegistroPage() {
  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-['Syne'] font-bold text-[#f0f0f0]">Registro</h1>
        <p className="text-[#888] text-xs mt-0.5">Producción, embolsado y devolución del día.</p>
      </div>

      <div className="space-y-3">
        {TARJETAS.map(({ href, label, descripcion, Icon }) => (
          <Link key={href} href={href}>
            <Card className="p-4 flex items-center gap-3 hover:border-[#e8c547] transition-colors">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-[#e8c547]">
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f0f0f0]">{label}</p>
                <p className="text-xs text-[#888] mt-0.5">{descripcion}</p>
              </div>
              <ArrowRight size={16} className="text-[#666] shrink-0" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
