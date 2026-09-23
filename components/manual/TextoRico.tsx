import { Fragment } from 'react'

/** Renderiza el marcado mínimo del manual: **negrita** (botones y pantallas) y `código`. */
export default function TextoRico({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*.+?\*\*|`.+?`)/g)
  return (
    <>
      {partes.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i} className="font-semibold text-text">{p.slice(2, -2)}</strong>
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return <code key={i} className="font-mono text-[0.9em] text-text bg-surface2 rounded px-1 py-0.5">{p.slice(1, -1)}</code>
        }
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}
