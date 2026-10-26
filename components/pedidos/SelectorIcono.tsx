'use client'

import { CLAVES_ICONO, ICONOS, esClaveIcono, estiloProducto, iconoAutomatico, motivoIconoAutomatico } from '@/lib/pedidos/categorias'

// Elegir el ícono de un producto (Admin → Catálogo). '' = automático: el ícono
// sale de la categoría (congelados) o del nombre, y se actualiza solo si cambian.
// Siempre dice por qué tiene el que tiene.
export default function SelectorIcono({ valor, onCambiar, nombre, categoria }: {
  valor: string
  onCambiar: (clave: string) => void
  nombre: string
  categoria: string | null
}) {
  const auto = iconoAutomatico({ nombre, categoria })
  const motivo = motivoIconoAutomatico({ nombre, categoria })
  const elegido = esClaveIcono(valor) ? valor : null
  const { icono: Vista, clase } = estiloProducto({ nombre, categoria, icono: elegido })
  const IconoAuto = estiloProducto({ nombre, categoria }).icono

  const porque = motivo === 'categoria' ? `por la categoría ${categoria}` : motivo === 'nombre' ? 'por el nombre' : 'el genérico: el nombre no dice qué es'

  const tile = (activo: boolean) =>
    `flex h-10 items-center justify-center rounded-lg border transition-colors ${
      activo ? 'border-accent bg-accent-bg text-accent' : 'border-border bg-surface2 text-muted hover:border-accent/50 hover:text-text'
    }`

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${clase}`} aria-hidden>
          <Vista size={20} />
        </span>
        <p className="text-xs text-muted">
          {elegido
            ? <>Elegido a mano: <span className="font-medium text-text">{ICONOS[elegido].etiqueta}</span></>
            : <>Automático: <span className="font-medium text-text">{auto ? ICONOS[auto].etiqueta : 'genérico'}</span>{auto ? ` (${porque})` : ''}</>}
        </p>
      </div>
      <div role="radiogroup" aria-label="Ícono del producto" className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
        <button type="button" role="radio" aria-checked={!elegido} onClick={() => onCambiar('')}
          title={`Automático (${porque})`} className={`${tile(!elegido)} flex-col gap-0.5`}>
          <IconoAuto size={15} aria-hidden />
          <span className="text-[9px] font-semibold leading-none">Auto</span>
        </button>
        {CLAVES_ICONO.map(clave => {
          const { icono: Icono, etiqueta } = ICONOS[clave]
          return (
            <button key={clave} type="button" role="radio" aria-checked={elegido === clave} aria-label={etiqueta}
              title={etiqueta} onClick={() => onCambiar(clave)} className={tile(elegido === clave)}>
              <Icono size={18} aria-hidden />
            </button>
          )
        })}
      </div>
    </div>
  )
}
