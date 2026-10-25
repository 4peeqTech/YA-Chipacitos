import Image from 'next/image'

// Loaders de la app (elegidos el 25-10). Los estilos y animaciones están en
// app/globals.css (.logo-rebote, .puntos, .cargando-aparece).

/** Carga de una sección: el logo rebota con su sombra. Aparece a los 200 ms. */
export function CargandoPagina({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div role="status" aria-live="polite" className="cargando-aparece flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-3">
      {/* La barra de arriba acompaña toda la carga (la dirección ya cambió al tocar). */}
      <span aria-hidden className="barra-nav" />
      <Image src="/chipacitos-logo.png" alt="" width={64} height={64} priority className="logo-rebote rounded-2xl shadow-lg" />
      <span aria-hidden className="logo-sombra -mt-1 h-2 w-12 rounded-[50%] bg-text/20" />
      <span className="text-xs text-muted">{texto}</span>
    </div>
  )
}

/** Tres puntos que saltan, del color del texto. Para botones ("Guardando") y listas. */
export function Puntos({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`puntos inline-flex items-center gap-[.2em] ${className}`}>
      <i /><i /><i />
    </span>
  )
}
