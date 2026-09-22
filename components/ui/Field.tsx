import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export const controlClass =
  'w-full bg-surface2 border border-border text-text rounded-field px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors disabled:opacity-50'

/** Envoltorio label + control + ayuda — reemplaza el par label/input suelto repetido en ~28 archivos. */
export function Field({
  label,
  ayuda,
  obligatorio,
  children,
}: {
  label: string
  ayuda?: string
  obligatorio?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-accent uppercase tracking-wider mb-1.5">
        {label}
        {obligatorio && <span className="text-brand-red ml-0.5">*</span>}
      </label>
      {children}
      {ayuda && <p className="text-3xs text-faint mt-1">{ayuda}</p>}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={className ?? controlClass} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={className ?? controlClass} {...props}>{children}</select>
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={className ?? controlClass} {...props} />
}
