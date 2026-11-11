'use client'

import { useMemo } from 'react'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import { buscarCuentas, type CuentaPlan } from '@/lib/gastos/plan'

/** Una línea de "qué significa": Rubro · Servicios: lo que entra. */
function Significado({ titulo, nombre, texto }: { titulo: string; nombre: string | null; texto?: string | null }) {
  if (!nombre) return null
  return (
    <div>
      <dt className="inline font-semibold text-text">{titulo} · {nombre}{texto ? ': ' : ''}</dt>
      {texto && <dd className="inline">{texto}</dd>}
    </div>
  )
}

/**
 * La cuenta del plan de un gasto: un buscador (por nombre, código o "qué se
 * incluye") agrupado por rubro, con lo que no es gasto al final. Cada opción
 * dice qué entra en ella; abajo, qué significan el rubro, la categoría y la
 * cuenta elegidos, como guía para clasificar.
 */
export default function CampoCuenta({
  cuentas,
  value,
  onChange,
  actual,
  permitirVacio = false,
  invalido = false,
  disabled = false,
  nota,
}: {
  /** Una línea más abajo (por ejemplo, que la puso una equivalencia de Fudo). */
  nota?: string | null
  /** Las que se eligen en Gastos (consultarCuentasGastos). */
  cuentas: CuentaPlan[]
  value: string
  onChange: (codigo: string) => void
  /** La que ya tenía el gasto, por si dejó de usarse en Gastos. */
  actual?: { codigo: string; nombre: string } | null
  /** Un gasto de Fudo puede quedar sin clasificar. */
  permitirVacio?: boolean
  invalido?: boolean
  disabled?: boolean
}) {
  const opciones = useMemo<OpcionSelect[]>(() => {
    // Primero los gastos; lo que no es gasto (activo, pasivo, socio) al final.
    const enOrden = [...cuentas.filter(c => c.usoGastos === 'gasto'), ...cuentas.filter(c => c.usoGastos !== 'gasto')]
    const lista = enOrden.map(c => ({
      value: c.codigo,
      label: c.nombre,
      detalle: [c.codigo, c.incluye ?? c.categoriaGasto].filter(Boolean).join(' · '),
      grupo: c.usoGastos === 'otro_pago' ? `No es gasto · ${c.rubroGasto ?? ''}` : (c.rubroGasto ?? 'Otras'),
    }))
    if (actual?.codigo && !cuentas.some(c => c.codigo === actual.codigo)) {
      lista.unshift({ value: actual.codigo, label: actual.nombre, detalle: `${actual.codigo} · ya no se usa en Gastos`, grupo: 'La que tenía' })
    }
    return lista
  }, [cuentas, actual])

  const porCodigo = useMemo(() => new Map(cuentas.map(c => [c.codigo, c])), [cuentas])
  const filtrar = useMemo(() => {
    const porValor = new Map(opciones.map(o => [o.value, o]))
    return (_: OpcionSelect[], q: string) =>
      buscarCuentas(cuentas, q).map(c => porValor.get(c.codigo)).filter((o): o is OpcionSelect => o != null)
  }, [cuentas, opciones])

  const elegida = porCodigo.get(value)

  return (
    <div className="space-y-1.5">
      <SelectBuscador
        value={value}
        onChange={onChange}
        opciones={opciones}
        filtrar={filtrar}
        opcionVacia={permitirVacio}
        placeholderVacio={permitirVacio ? 'Sin clasificar' : 'Elegí la cuenta…'}
        ariaLabel="Cuenta del gasto"
        invalido={invalido}
        disabled={disabled}
        altoLista="max-h-72"
      />
      {elegida && (
        <dl className="space-y-1 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted" aria-label="Qué significa esta clasificación">
          {elegida.usoGastos === 'otro_pago' && (
            <div className="font-semibold text-text">No es gasto: se carga, pero no suma en lo gastado.</div>
          )}
          <Significado titulo="Rubro" nombre={elegida.rubroGasto} texto={elegida.ayudaRubro} />
          <Significado titulo="Categoría" nombre={elegida.categoriaGasto} texto={elegida.ayudaCategoria} />
          <Significado titulo="Cuenta" nombre={`${elegida.codigo} ${elegida.nombre}`} texto={elegida.incluye} />
        </dl>
      )}
      {nota && <p className="text-xs text-muted">{nota}</p>}
    </div>
  )
}
