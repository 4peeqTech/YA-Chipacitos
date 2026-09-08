import { ClipboardCheck } from 'lucide-react'

export const metadata = { title: 'Conteos de fábrica | YA! Chipacitos' }

export default function ConteosFabricaPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-20 text-center">
      <ClipboardCheck size={28} className="text-muted" />
      <p className="text-text font-medium">Disponible próximamente</p>
      <p className="text-muted text-sm max-w-sm">Acá vas a ver el historial de conteos cerrados en Fábrica, con el detalle por insumo.</p>
    </div>
  )
}
