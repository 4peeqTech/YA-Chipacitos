'use client'

import { X } from 'lucide-react'

export default function ClearFiltersButton({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-muted hover:text-text hover:bg-surface2 transition-colors"
    >
      <X size={14} /> Limpiar filtros
    </button>
  )
}
