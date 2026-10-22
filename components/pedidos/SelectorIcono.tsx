'use client'

import { CLAVES_ICONO, ICONOS, esClaveIcono, estiloProducto, iconoAutomatico } from '@/lib/pedidos/categorias'

// Elegir el ícono de un producto (Admin → Catálogo). '' = automático: el ícono
// sale del nombre y la categoría, y se actualiza solo si cambian.
export default function SelectorIcono({ valor, onCambiar, nombre, categoria }: {
  valor: string
  onCambiar: (clave: string) => void
  nombre: string
  categoria: string | null
}) {
  const auto = iconoAutomatico({ nombre, categoria })
  const elegido = esClaveIcono(valor) ? valor : null
  const { icono: Vista, clase } = estiloProducto({ nombre, categoria, icono: elegido })
  const IconoAuto = estiloProducto({ nombre, categoria }).icono

  const tile = (activo: boolean) =>
    `flex h-10 items-center justify-center rounded-lg border transition-colors ${
      activo ? 'border-[#e8c547] bg-[#e8c547]/10 text-[#e8c547]' : 'border-[#2a2a2a] bg-[#1a1a1a] text-[#aaa] hover:text-[#f0f0f0]'
    }`

  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${clase}`} aria-hidden>
          <Vista size={18} />
        </span>
        <p className="text-xs text-[#aaa]">
          {elegido
            ? <>Elegido a mano: <span className="text-[#f0f0f0]">{ICONOS[elegido].etiqueta}</span></>
            : <>Automático según el nombre{auto ? <>: <span className="text-[#f0f0f0]">{ICONOS[auto].etiqueta}</span></> : null}</>}
        </p>
      </div>
      <div role="radiogroup" aria-label="Ícono del producto" className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
        <button type="button" role="radio" aria-checked={!elegido} onClick={() => onCambiar('')}
          title="Automático según el nombre" className={`${tile(!elegido)} flex-col gap-0.5`}>
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
