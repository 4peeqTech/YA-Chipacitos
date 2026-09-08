'use client'

import { Search, X } from 'lucide-react'

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface2 border border-border text-text rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
