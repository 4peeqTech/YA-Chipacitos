import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { obtenerLector } from './lector'

export const metadata = { title: 'Manual | YA! Chipacitos' }

export default async function AyudaLayout({ children }: { children: React.ReactNode }) {
  const { inicio } = await obtenerLector()

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <Link
          href={inicio}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted transition-colors hover:text-text"
        >
          <ArrowLeft size={16} /> Volver al sistema
        </Link>
        <div className="flex-1" />
        <span className="font-['Syne'] text-sm font-bold text-accent">YA! Chipacitos</span>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  )
}
