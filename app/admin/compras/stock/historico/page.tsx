import { History } from 'lucide-react'

export const metadata = { title: 'Histórico por insumo | YA! Chipacitos' }

export default function HistoricoPorInsumoPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-20 text-center">
      <History size={28} className="text-muted" />
      <p className="text-text font-medium">Disponible próximamente</p>
      <p className="text-muted text-sm max-w-sm">Acá vas a poder elegir un insumo y ver cómo evolucionó su stock contado a lo largo del tiempo.</p>
    </div>
  )
}
