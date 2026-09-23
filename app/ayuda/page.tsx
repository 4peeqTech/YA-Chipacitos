import Link from 'next/link'
import { BookOpen, ChevronRight, Sparkles } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ReportarProblema from '@/components/manual/ReportarProblema'
import TextoRico from '@/components/manual/TextoRico'
import { formatearFecha } from '@/lib/formato'
import { AREAS, indiceDeBusqueda, novedadesRecientes, seccionesVisibles } from '@/lib/manual'
import { obtenerLector } from './lector'
import BuscadorManual from './BuscadorManual'

export default async function AyudaPage() {
  const { lector, email, nombre } = await obtenerLector()
  const secciones = seccionesVisibles(lector)
  const novedades = novedadesRecientes(secciones)
  const reportarBoton = <ReportarProblema variante="enlace" usuarioEmail={email} usuarioNombre={nombre} />

  return (
    <div className="space-y-6">
      <PageHeader icono={BookOpen} titulo="Manual" descripcion="Cómo usar YA! Chipacitos, paso a paso." />

      <BuscadorManual
        indice={indiceDeBusqueda(secciones)}
        pieSinResultados={<ReportarProblema variante="boton" usuarioEmail={email} usuarioNombre={nombre} />}
      >
        {novedades.length > 0 && (
          <section className="rounded-2xl border border-accent/30 bg-accent-bg px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
              <Sparkles size={16} className="text-accent" /> Novedades recientes
            </h2>
            <ul className="mt-3 space-y-2.5">
              {novedades.map((n, i) => (
                <li key={i}>
                  <Link href={`/ayuda/${n.slug}`} className="group flex flex-col gap-0.5 text-sm sm:flex-row sm:gap-3">
                    <time dateTime={n.fecha} className="shrink-0 text-xs tabular-nums text-muted sm:w-24 sm:pt-0.5">{formatearFecha(n.fecha)}</time>
                    <span>
                      <span className="font-medium text-text group-hover:text-accent">{n.seccion}:</span>{' '}
                      <TextoRico texto={n.texto} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {AREAS.map(area => {
          const delArea = secciones.filter(s => s.area === area.key)
          if (delArea.length === 0) return null
          return (
            <section key={area.key}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{area.titulo}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {delArea.map(s => {
                  const Icono = s.icono
                  return (
                    <li key={s.slug}>
                      <Link href={`/ayuda/${s.slug}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface2">
                        <Icono size={20} className="shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-text">
                            {s.titulo}
                            {s.proximamente && (
                              <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-semibold text-muted">Próximamente</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">{s.resumen}</p>
                        </div>
                        <ChevronRight size={16} className="shrink-0 text-faint" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        <div className="border-t border-border pt-2">{reportarBoton}</div>
      </BuscadorManual>
    </div>
  )
}
