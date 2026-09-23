import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Construction } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import BloqueManual from '@/components/manual/BloqueManual'
import IndiceAnclas from '@/components/manual/IndiceAnclas'
import Novedades from '@/components/manual/Novedades'
import ReportarProblema from '@/components/manual/ReportarProblema'
import { formatearFecha } from '@/lib/formato'
import { buscarSeccion, puedeVer } from '@/lib/manual'
import { obtenerLector } from '../lector'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const seccion = buscarSeccion(slug)
  return { title: `${seccion?.titulo ?? 'Manual'} | Manual | YA! Chipacitos` }
}

export default async function SeccionManualPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { lector, email, nombre } = await obtenerLector()
  const seccion = buscarSeccion(slug)
  // Sección inexistente o de otro rol: al índice, que muestra solo lo que le toca.
  if (!seccion || !puedeVer(seccion, lector)) redirect('/ayuda')

  const apartados = seccion.apartados.map(a => ({ ancla: a.ancla, titulo: a.titulo }))

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/ayuda"
          className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted transition-colors hover:text-text"
        >
          <ChevronLeft size={16} /> Manual
        </Link>
        <PageHeader icono={seccion.icono} titulo={seccion.titulo} descripcion={seccion.resumen} />
        <p className="mt-2 text-xs text-faint">
          Actualizado el <time dateTime={seccion.actualizado}>{formatearFecha(seccion.actualizado, 'larga')}</time>
        </p>
      </div>

      {seccion.pendiente && (
        <div role="note" className="flex gap-3 rounded-xl border border-info/30 bg-info-bg px-4 py-3 text-sm">
          <Construction size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />
          <p className="text-text"><span className="font-semibold">{seccion.proximamente ? 'Próximamente.' : 'Pendiente de actualizar.'}</span> {seccion.pendiente}</p>
        </div>
      )}

      {seccion.novedades && <Novedades novedades={seccion.novedades} />}

      <div className={`grid grid-cols-1 items-start gap-6 lg:gap-10 ${apartados.length > 1 ? 'lg:grid-cols-[200px_1fr]' : ''}`}>
        {apartados.length > 1 && (
          <aside className="lg:self-stretch">
            <IndiceAnclas apartados={apartados} />
          </aside>
        )}

        <article className="min-w-0 max-w-[68ch] space-y-10">
          {seccion.apartados.map(a => (
            <section key={a.ancla} id={a.ancla} className="scroll-mt-20">
              <h2 className="mb-3 text-lg font-semibold text-text text-balance">{a.titulo}</h2>
              <div className="space-y-4 text-sm leading-relaxed text-text/85 sm:text-[15px]">
                {a.bloques.map((b, i) => (
                  <BloqueManual key={i} bloque={b} modulosPermitidos={lector.modulos} />
                ))}
              </div>
            </section>
          ))}

          <ReportarProblema usuarioEmail={email} usuarioNombre={nombre} />
        </article>
      </div>
    </div>
  )
}
