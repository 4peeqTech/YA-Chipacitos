import Link from 'next/link'
import { CircleHelp } from 'lucide-react'

/** Ícono `?` para el PageHeader: lleva a la sección (y al apartado) del manual que explica esta pantalla. */
export default function AyudaLink({ seccion, ancla }: { seccion: string; ancla?: string }) {
  return (
    <Link
      href={`/ayuda/${seccion}${ancla ? `#${ancla}` : ''}`}
      aria-label="Ver la ayuda de esta pantalla"
      title="Ayuda de esta pantalla"
      className="inline-flex size-11 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:size-9"
    >
      <CircleHelp size={18} />
    </Link>
  )
}
