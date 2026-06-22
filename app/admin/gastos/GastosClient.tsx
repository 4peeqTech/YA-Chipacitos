'use client'

import { useState } from 'react'

interface Gasto {
  id: string
  descripcion: string
  cantidad: number
  categoria: string
  fecha: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
}

export default function GastosClient() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    descripcion: '',
    cantidad: 0,
    categoria: 'general',
    fecha: new Date().toISOString().split('T')[0],
  })

  const categorias = ['general', 'operativo', 'marketing', 'tecnología', 'infraestructura']

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nuevoGasto: Gasto = {
      id: Date.now().toString(),
      ...formData,
      cantidad: parseFloat(formData.cantidad.toString()),
      estado: 'pendiente',
    }
    setGastos([nuevoGasto, ...gastos])
    setFormData({
      descripcion: '',
      cantidad: 0,
      categoria: 'general',
      fecha: new Date().toISOString().split('T')[0],
    })
    setShowForm(false)
  }

  const totalGastos = gastos.reduce((sum, g) => sum + g.cantidad, 0)
  const gastosAprobados = gastos.filter(g => g.estado === 'aprobado').reduce((sum, g) => sum + g.cantidad, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#f0f0f0]">Gestión de Gastos</h1>
          <p className="text-[#888] mt-1">Registro y control de gastos operativos</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#e8c547] hover:opacity-90 text-black font-semibold py-2 px-4 rounded-xl transition-all"
        >
          + Nuevo Gasto
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-sm">Total Gastos</p>
          <p className="text-2xl font-bold text-[#f0f0f0] mt-1">${totalGastos.toFixed(2)}</p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-sm">Aprobados</p>
          <p className="text-2xl font-bold text-[#e8c547] mt-1">${gastosAprobados.toFixed(2)}</p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-sm">Pendientes</p>
          <p className="text-2xl font-bold text-[#f0f0f0] mt-1">{gastos.filter(g => g.estado === 'pendiente').length}</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6">
          <h2 className="text-lg font-bold text-[#f0f0f0] mb-4">Nuevo Gasto</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#e8c547] mb-2">Descripción</label>
                <input
                  type="text"
                  required
                  value={formData.descripcion}
                  onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#e8c547]"
                  placeholder="Ej: Compra de insumos"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#e8c547] mb-2">Cantidad</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.cantidad}
                  onChange={(e) => setFormData({...formData, cantidad: parseFloat(e.target.value) || 0})}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#e8c547]"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#e8c547] mb-2">Categoría</label>
                <select
                  value={formData.categoria}
                  onChange={(e) => setFormData({...formData, categoria: e.target.value})}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#e8c547]"
                >
                  {categorias.map(cat => (
                    <option key={cat} value={cat} className="bg-[#1a1a1a]">{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#e8c547] mb-2">Fecha</label>
                <input
                  type="date"
                  required
                  value={formData.fecha}
                  onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#e8c547]"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-[#e8c547] hover:opacity-90 text-black font-semibold py-2 rounded-lg transition-all"
              >
                Guardar Gasto
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-[#2a2a2a] hover:bg-[#333333] text-[#f0f0f0] font-semibold py-2 rounded-lg transition-all"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Gastos List */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {gastos.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[#888]">No hay gastos registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-[#e8c547]">Descripción</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-[#e8c547]">Cantidad</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-[#e8c547]">Categoría</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-[#e8c547]">Fecha</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-[#e8c547]">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {gastos.map(gasto => (
                  <tr key={gasto.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-6 py-3 text-sm text-[#f0f0f0]">{gasto.descripcion}</td>
                    <td className="px-6 py-3 text-sm text-[#f0f0f0] font-medium">${gasto.cantidad.toFixed(2)}</td>
                    <td className="px-6 py-3 text-sm text-[#888]">{gasto.categoria}</td>
                    <td className="px-6 py-3 text-sm text-[#888]">{new Date(gasto.fecha).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        gasto.estado === 'aprobado' ? 'bg-green-900 text-green-200' :
                        gasto.estado === 'rechazado' ? 'bg-red-900 text-red-200' :
                        'bg-yellow-900 text-yellow-200'
                      }`}>
                        {gasto.estado.charAt(0).toUpperCase() + gasto.estado.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
