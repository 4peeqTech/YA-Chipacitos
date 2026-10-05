'use client'

import type { MouseEvent, ReactNode } from 'react'
import Link from 'next/link'
import { rutaDe, type Entidad } from '@/lib/compras/rutas'
import { usePuedeEntrar } from './AccesoModulos'

type Variante = 'codigo' | 'texto' | 'chip'

const CLASES: Record<Variante, string> = {
  // El código como se ve hoy (P-0012) con el subrayado accent de los links de
  // la app. El color lo pone quien lo usa (text-text o text-muted).
  codigo: 'whitespace-nowrap font-mono tabular-nums underline decoration-accent decoration-2 underline-offset-4 transition-opacity hover:opacity-80',
  // Hereda el color del texto que lo rodea.
  texto: 'underline decoration-accent decoration-2 underline-offset-4 transition-opacity hover:opacity-80',
  chip: 'inline-flex items-center gap-1 rounded-full border border-transparent bg-surface2 px-2 py-0.5 text-2xs font-medium text-muted transition-colors hover:border-accent hover:text-text',
}

// Cómo se ve cuando el usuario no tiene el módulo del destino: el mismo texto, sin link.
const CLASES_TEXTO: Record<Variante, string> = {
  codigo: 'whitespace-nowrap font-mono tabular-nums',
  texto: '',
  chip: 'inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-2xs font-medium text-muted',
}

/**
 * Link a la pantalla de una entidad del circuito (pedido, remito, factura…).
 *
 * Frena el clic: `DataTable` abre la fila con cualquier clic adentro, y un
 * link dentro de una celda tiene que ir a su destino sin abrir la fila.
 * `onNavegar` cierra el modal de origen, para cuando el destino es la misma
 * página (de un pedido a otro, por ejemplo).
 *
 * Si el usuario no tiene el módulo del destino (mismo chequeo que proxy.ts),
 * queda como texto plano: un link que rebota con "sin acceso" no sirve.
 */
export default function LinkEntidad({
  entidad,
  variante = 'codigo',
  onNavegar,
  className = '',
  title,
  children,
}: {
  entidad: Entidad
  variante?: Variante
  onNavegar?: () => void
  className?: string
  title?: string
  children: ReactNode
}) {
  const puedeEntrar = usePuedeEntrar()
  const href = rutaDe(entidad)

  if (!puedeEntrar(href)) {
    // Sin title: suele decir a dónde lleva el link, y acá no lleva a ningún lado.
    return <span className={`${CLASES_TEXTO[variante]} ${className}`}>{children}</span>
  }

  function alClic(e: MouseEvent<HTMLAnchorElement>) {
    e.stopPropagation()
    onNavegar?.()
  }

  return (
    <Link
      href={href}
      onClick={alClic}
      // Enter sobre el link no tiene que llegar a la fila.
      onKeyDown={e => e.stopPropagation()}
      title={title}
      className={`${CLASES[variante]} ${className}`}
    >
      {children}
    </Link>
  )
}
