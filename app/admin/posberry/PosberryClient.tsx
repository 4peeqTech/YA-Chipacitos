'use client'

import { useState, useMemo, useCallback } from 'react'

interface Fila {
  idVenta: string
  idCliente: string
  fecha: string
  cliente: string
  direccion: string
  producto: string
  unidades: number
  monto: number
}

const PAGE_SIZE = 50

export default function PosberryClient() {
  const [filas, setFilas]         = useState<Fila[]>([])
  const [cargando, setCargando]   = useState(false)
  const [error, setError]         = useState('')
  const [cargado, setCargado]     = useState(false)

  // Filtros
  const [desde, setDesde]         = useState('')
  const [hasta, setHasta]         = useState('')
  const [busCliente, setBusCliente] = useState('')
  const [busProducto, setBusProducto] = useState('')
  const [busDireccion, setBusDireccion] = useState('')
  const [busLocal, setBusLocal]   = useState('')
  const [pagina, setPagina]       = useState(1)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      const res = await fetch(`/api/posberry-raw?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cargar')
      setFilas(json.filas || [])
      setCargado(true)
      setPagina(1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta])

  const filtradas = useMemo(() => {
    return filas.filter(f => {
      if (busCliente   && !f.cliente.toLowerCase().includes(busCliente.toLowerCase()))   return false
      if (busProducto  && !f.producto.toLowerCase().includes(busProducto.toLowerCase())) return false
      if (busDireccion && !f.direccion.toLowerCase().includes(busDireccion.toLowerCase())) return false
      if (busLocal     && !f.cliente.toLowerCase().includes(busLocal.toLowerCase()))     return false
      return true
    })
  }, [filas, busCliente, busProducto, busDireccion, busLocal])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE))
  const paginadas    = filtradas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  const totalMonto   = filtradas.reduce((s, f) => s + f.monto, 0)
  const totalUnidades = filtradas.reduce((s, f) => s + f.unidades, 0)

  // Detectar tipos de cliente para chips rápidos
  const isSucursal = (c: string) => c.startsWith('Suc.')
  const isMayorista = (c: string) => !isSucursal(c)

  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'sucursal' | 'mayorista'>('todos')

  const conTipo = useMemo(() => {
    if (tipoFiltro === 'sucursal')  return filtradas.filter(f => isSucursal(f.cliente))
    if (tipoFiltro === 'mayorista') return filtradas.filter(f => isMayorista(f.cliente))
    return filtradas
  }, [filtradas, tipoFiltro])

  const totalPaginasTipo = Math.max(1, Math.ceil(conTipo.length / PAGE_SIZE))
  const paginadasFinal   = conTipo.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  function resetFiltros() {
    setBusCliente('')
    setBusProducto('')
    setBusDireccion('')
    setBusLocal('')
    setTipoFiltro('todos')
    setPagina(1)
  }

  const hayFiltros = busCliente || busProducto || busDireccion || busLocal || tipoFiltro !== 'todos'

  return (
    <div className="space-y-4">
      {/* Panel de carga */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-[14px] p-5 space-y-4">
        <p className="text-[#888] text-sm">Seleccioná un rango de fechas y presioná Cargar para traer todos los registros de la planilla Posberry.</p>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#e8c547] font-semibold uppercase tracking-wider">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] [color-scheme:dark] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#e8c547] font-semibold uppercase tracking-wider">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] [color-scheme:dark] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547]"
            />
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="bg-[#e8c547] text-black font-['Syne'] font-bold px-5 py-2 rounded-lg text-sm hover:bg-[#f0d060] transition-colors disabled:opacity-50"
          >
            {cargando ? 'Cargando...' : 'Cargar datos'}
          </button>
          {cargado && (
            <span className="text-[#56d68a] text-xs self-end pb-2">
              {filas.length.toLocaleString('es-AR')} registros cargados
            </span>
          )}
        </div>

        {error && (
          <div className="bg-[rgba(232,66,16,.1)] border border-[rgba(232,66,16,.3)] text-[#e84210] rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
      </div>

      {cargado && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total registros', valor: filtradas.length.toLocaleString('es-AR'), color: 'border-t-[#e8c547]' },
              { label: 'Sucursales únicas', valor: new Set(filtradas.filter(f => isSucursal(f.cliente)).map(f => f.idCliente || f.cliente)).size.toLocaleString('es-AR'), color: 'border-t-[#38bdf8]' },
              { label: 'Mayoristas únicos', valor: new Set(filtradas.filter(f => isMayorista(f.cliente)).map(f => f.idCliente || f.cliente)).size.toLocaleString('es-AR'), color: 'border-t-[#f0a849]' },
              { label: 'Monto total', valor: `$${totalMonto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, color: 'border-t-[#56d68a]' },
            ].map(s => (
              <div key={s.label} className={`bg-[#111111] border border-[#2a2a2a] border-t-[3px] ${s.color} rounded-[12px] p-4`}>
                <p className="text-[#888] text-xs uppercase tracking-wider">{s.label}</p>
                <p className="text-[#f0f0f0] font-['Syne'] font-bold text-xl mt-1">{s.valor}</p>
              </div>
            ))}
          </div>

          {/* Filtros de tabla */}
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-[14px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#e8c547] font-semibold uppercase tracking-wider">Filtrar resultados</p>
              {hayFiltros && (
                <button onClick={resetFiltros} className="text-xs text-[#888] hover:text-[#f0f0f0] transition-colors">
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Chips tipo */}
            <div className="flex gap-2 flex-wrap">
              {(['todos', 'sucursal', 'mayorista'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setTipoFiltro(t); setPagina(1) }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    tipoFiltro === t
                      ? 'bg-[#e8c547] text-black'
                      : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0]'
                  }`}
                >
                  {t === 'todos' ? 'Todos' : t === 'sucursal' ? 'Sucursales' : 'Mayoristas'}
                </button>
              ))}
            </div>

            {/* Inputs búsqueda */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Cliente', val: busCliente, set: setBusCliente },
                { label: 'Producto', val: busProducto, set: setBusProducto },
                { label: 'Dirección', val: busDireccion, set: setBusDireccion },
                { label: 'Local / Sucursal', val: busLocal, set: setBusLocal },
              ].map(({ label, val, set }) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#888] uppercase tracking-wider">{label}</label>
                  <input
                    type="text"
                    value={val}
                    onChange={e => { set(e.target.value); setPagina(1) }}
                    placeholder={`Buscar ${label.toLowerCase()}...`}
                    className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#e8c547] placeholder:text-[#555]"
                  />
                </div>
              ))}
            </div>

            <p className="text-[#888] text-xs">
              Mostrando {conTipo.length.toLocaleString('es-AR')} de {filas.length.toLocaleString('es-AR')} registros
              {conTipo.length > 0 && (
                <span> · {totalUnidades.toLocaleString('es-AR')} unidades · ${totalMonto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              )}
            </p>
          </div>

          {/* Tabla */}
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-[14px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                    {['ID Venta', 'Fecha', 'Cliente', 'Dirección', 'Producto', 'Unidades', 'Monto Bruto'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[#e8c547] uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginadasFinal.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[#888]">Sin resultados para los filtros aplicados</td>
                    </tr>
                  ) : paginadasFinal.map((f, i) => (
                    <tr key={`${f.idVenta}-${i}`} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 py-2.5 text-[#888] font-mono text-xs">{f.idVenta}</td>
                      <td className="px-4 py-2.5 text-[#f0f0f0] whitespace-nowrap">{f.fecha}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isSucursal(f.cliente)
                            ? 'bg-[rgba(56,189,248,.1)] text-[#38bdf8]'
                            : 'bg-[rgba(240,168,73,.1)] text-[#f0a849]'
                        }`}>
                          {f.cliente}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#888] text-xs max-w-[180px] truncate">{f.direccion || '—'}</td>
                      <td className="px-4 py-2.5 text-[#f0f0f0] max-w-[200px] truncate">{f.producto}</td>
                      <td className="px-4 py-2.5 text-[#f0f0f0] text-right">{f.unidades}</td>
                      <td className="px-4 py-2.5 text-[#56d68a] text-right font-medium">
                        ${f.monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPaginasTipo > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#2a2a2a]">
                <span className="text-[#888] text-xs">
                  Página {pagina} de {totalPaginasTipo}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagina(p => Math.max(1, p - 1))}
                    disabled={pagina === 1}
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg text-xs disabled:opacity-30 hover:border-[#e8c547] transition-colors"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setPagina(p => Math.min(totalPaginasTipo, p + 1))}
                    disabled={pagina === totalPaginasTipo}
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg text-xs disabled:opacity-30 hover:border-[#e8c547] transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
