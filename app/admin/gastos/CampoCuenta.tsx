'use client'

import { useMemo } from 'react'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import { buscarCuentas, type CuentaPlan } from '@/lib/gastos/plan'

/**
 * La cuenta del plan de un gasto: un buscador (por nombre, código o "qué se
 * incluye") agrupado por rubro, con lo que no es gasto al final. Abajo, qué
 * entra en la cuenta elegida.
 */
export default function CampoCuenta({
  cuentas,
  value,
  onChange,
  actual,
  permitirVacio = false,
  invalido = false,
  disabled = false,
}: {
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
      detalle: `${c.codigo} · ${c.categoriaGasto ?? ''}`,
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
      />
      {elegida && (
        <p className="text-xs text-muted">
          <span className="font-mono tabular-nums">{elegida.codigo}</span> · {elegida.rubroGasto} › {elegida.categoriaGasto}
          {elegida.usoGastos === 'otro_pago' && <span className="font-semibold text-text"> · No es gasto: no suma en lo gastado</span>}
          {elegida.incluye && <span className="mt-0.5 block">{elegida.incluye}</span>}
        </p>
      )}
    </div>
  )
}
