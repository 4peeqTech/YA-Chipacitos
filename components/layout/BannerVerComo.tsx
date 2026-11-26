import { IconEye } from '@tabler/icons-react'
import { cargarAcceso } from '@/lib/permisos/servidor'
import SalirVerComo from './SalirVerComo'
import AvisoSoloLectura from './AvisoSoloLectura'

// "Ver como" (épica roles y permisos, T7): arriba de todo, en todas las áreas, y un
// borde fijo alrededor de la pantalla que se sigue viendo al bajar. Va por encima de
// los modales: Salir tiene que andar siempre.
export default async function BannerVerComo() {
  const { acceso } = await cargarAcceso()
  if (!acceso?.quienMira) return null
  return (
    <>
      {/* En desktop el menú lateral es fijo: baja lo que mide el banner (Sidebar usa --alto-banner). */}
      <style>{'@media (min-width: 1024px) { :root { --alto-banner: 3rem } }'}</style>
      <div role="status" className="relative z-[1100] bg-accent2 text-black px-4 py-2 lg:py-0 lg:h-12 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <IconEye size={18} className="shrink-0" aria-hidden />
        <p className="flex-1 min-w-0">
          Viendo como <strong>{acceso.nombre}</strong> · solo lectura
          <span className="hidden sm:inline"> · lo que intentes guardar no se guarda</span>
        </p>
        <SalirVerComo />
      </div>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] border-4 border-accent2" />
      <AvisoSoloLectura nombre={acceso.nombre} />
    </>
  )
}
