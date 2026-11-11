'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { IconAlertTriangle, IconArrowLeft, IconTags } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { Puntos } from '@/components/ui/Cargando'
import { useToast } from '@/components/ui/ProveedorUI'
import { formatearMonedaExacta } from '@/lib/formato'
import type { Database } from '@/lib/database.types'
import type { CuentaPlan } from '@/lib/gastos/plan'
import { guardarEquivalenciaFudo } from '../acciones'
import CampoCuenta from '../CampoCuenta'

type Etiqueta = Database['public']['Functions']['gastos_fudo_etiquetas']['Returns'][number]

const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function Fila({ e, cuentas }: { e: Etiqueta; cuentas: CuentaPlan[] }) {
  const toast = useToast()
  const [guardando, startTransition] = useTransition()
  // Optimista: el select muestra la elegida mientras se guarda.
  const [cuenta, setCuenta] = useState(e.cuenta ?? '')
  const sinClasificar = Number(e.sin_clasificar)
  const aMano = Number(e.a_mano)
  const locales = (e.locales ?? []).map(l => l.replace(/^YA! /, '')).join(', ')

  function elegir(nueva: string) {
    if (nueva === cuenta) return
    const antes = cuenta
    setCuenta(nueva)
    startTransition(async () => {
      const r = await guardarEquivalenciaFudo({ texto: e.texto ?? '', cuenta: nueva })
      if (!r.ok) { setCuenta(antes); toast.error(r.error); return }
      const nombre = cuentas.find(c => c.codigo === nueva)?.nombre ?? nueva
      toast.success(nueva
        ? `Listo: ${plural(r.data, 'gasto pasa', 'gastos pasan')} a ${nombre}. Los que vengan de Fudo, también.`
        : `Sin equivalencia: ${plural(r.data, 'gasto vuelve', 'gastos vuelven')} a sin clasificar.`)
    })
  }

  return (
    <li className="grid gap-3 px-4 py-4 md:grid-cols-2 md:items-start">
      <div className="min-w-0 space-y-1">
        <p className="break-words font-medium text-text">{e.texto ?? 'Sin categoría ni proveedor en Fudo'}</p>
        <p className="text-xs text-muted">
          {plural(Number(e.gastos), 'gasto', 'gastos')} · <span className="tabular-nums">{formatearMonedaExacta(Number(e.monto ?? 0))}</span>
          {locales && <> · {locales}</>}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {sinClasificar > 0 && <span className="font-semibold text-warning">{plural(sinClasificar, 'sin cuenta', 'sin cuenta')}</span>}
          {aMano > 0 && <span className="text-muted">{plural(aMano, 'clasificado a mano', 'clasificados a mano')}: no se tocan</span>}
        </p>
      </div>
      {e.etiqueta ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CampoCuenta
              cuentas={cuentas}
              value={cuenta}
              onChange={elegir}
              actual={e.cuenta ? { codigo: e.cuenta, nombre: e.cuenta_nombre ?? e.cuenta } : null}
              permitirVacio
              disabled={guardando}
            />
          </div>
          {guardando && <span className="mt-3"><Puntos /></span>}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Fudo no dice qué son: clasificalos uno por uno desde{' '}
          <Link href="/admin/gastos?periodo=todo&origen=fudo&cuenta=sin" className="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4">Gastos</Link>.
        </p>
      )}
    </li>
  )
}

export default function ClasificarClient({ etiquetas, cuentas, error }: { etiquetas: Etiqueta[]; cuentas: CuentaPlan[]; error: boolean }) {
  const sinClasificar = etiquetas.reduce((s, e) => s + Number(e.sin_clasificar), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        icono={IconTags}
        titulo="Clasificar gastos de Fudo"
        descripcion="Elegí a qué cuenta va cada cosa que los locales cargan en Fudo. Vale para los gastos que ya están y para los que vengan. Lo que clasificaste a mano no se toca."
        acciones={<Link href="/admin/gastos" className={botonSecundario}><IconArrowLeft size={16} aria-hidden /> Gastos</Link>}
      />

      {error ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          No pudimos traer los gastos de Fudo. Recargá la página; si sigue pasando, avisanos.
        </p>
      ) : etiquetas.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <EmptyState icono={IconTags} titulo="Todavía no hay gastos de Fudo" descripcion="Aparecen acá cuando se traen de los locales desde Gastos." />
        </div>
      ) : (
        <section className="space-y-2" aria-label="Lo que dice Fudo">
          <p className="text-sm text-muted">
            {sinClasificar === 0 ? 'Todos los gastos de Fudo tienen cuenta.' : `${plural(sinClasificar, 'gasto de Fudo sin cuenta', 'gastos de Fudo sin cuenta')}.`}
            {' '}Lo que dice Fudo es la categoría del gasto, o el proveedor si no tiene categoría.
          </p>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {etiquetas.map(e => <Fila key={e.etiqueta ?? '—'} e={e} cuentas={cuentas} />)}
          </ul>
        </section>
      )}
    </div>
  )
}
