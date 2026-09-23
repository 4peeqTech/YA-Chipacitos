'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import { ChevronDown, ListTree } from 'lucide-react'

interface Props {
  apartados: { ancla: string; titulo: string }[]
}

/** "En esta página": índice lateral fijo en desktop, desplegable arriba en mobile. */
export default function IndiceAnclas({ apartados }: Props) {
  const [activa, setActiva] = useState(apartados[0]?.ancla)

  // El contenido llega por streaming (después del loading.tsx), así que el navegador no
  // encuentra el #ancla al cargar: se scrollea a mano cuando el apartado ya existe.
  useEffect(() => {
    const ancla = decodeURIComponent(window.location.hash.slice(1))
    if (ancla) document.getElementById(ancla)?.scrollIntoView()
  }, [])

  // Apartado activo = el último cuyo título ya pasó por debajo de la barra superior.
  useEffect(() => {
    let frame = 0
    const calcular = () => {
      frame = 0
      let actual = apartados[0]?.ancla
      for (const a of apartados) {
        const el = document.getElementById(a.ancla)
        if (el && el.getBoundingClientRect().top <= 120) actual = a.ancla
      }
      // Al fondo de la página el último apartado puede no llegar arriba: marcarlo igual.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) actual = apartados.at(-1)?.ancla ?? actual
      setActiva(actual)
    }
    const alScrollear = () => { if (!frame) frame = requestAnimationFrame(calcular) }
    calcular()
    window.addEventListener('scroll', alScrollear, { passive: true })
    return () => {
      window.removeEventListener('scroll', alScrollear)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [apartados])

  if (apartados.length < 2) return null

  const links = (alElegir?: (e: MouseEvent<HTMLAnchorElement>) => void) => (
    <ul className="space-y-0.5">
      {apartados.map(a => (
        <li key={a.ancla}>
          <a
            href={`#${a.ancla}`}
            onClick={alElegir}
            aria-current={activa === a.ancla ? 'location' : undefined}
            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
              activa === a.ancla ? 'bg-accent-bg font-medium text-text' : 'text-muted hover:bg-surface2 hover:text-text'
            }`}
          >
            {a.titulo}
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      <details className="group rounded-xl border border-border bg-surface lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><ListTree size={16} className="text-accent" /> En esta página</span>
          <ChevronDown size={16} className="text-muted transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <nav aria-label="En esta página" className="px-2 pb-2">
          {links(e => e.currentTarget.closest('details')?.removeAttribute('open'))}
        </nav>
      </details>

      <nav aria-label="En esta página" className="sticky top-20 hidden lg:block">
        <p className="mb-2 px-3 text-xs font-semibold text-faint">En esta página</p>
        {links()}
      </nav>
    </>
  )
}
