'use client'

import { useState } from 'react'
import { Package, Ruler, Utensils, Undo2, Users } from 'lucide-react'
import TablaMaestra from '@/components/ui/TablaMaestra'

const TABS = [
  { key: 'sabores', label: 'Sabores', Icon: Utensils },
  { key: 'presentaciones', label: 'Presentaciones', Icon: Package },
  { key: 'tamanios', label: 'Tamaños', Icon: Ruler },
  { key: 'devolucion-motivos', label: 'Motivos de devolución', Icon: Undo2 },
  { key: 'operarios', label: 'Operarios', Icon: Users },
] as const

type TabKey = typeof TABS[number]['key']

export default function FabricaParametrosClient() {
  const [tab, setTab] = useState<TabKey>('sabores')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Fábrica</h1>
        <p className="text-[#888] text-sm mt-0.5">Sabores, presentaciones y tamaños usados en producción</p>
      </div>

      <div className="flex gap-1 border-b border-[#2a2a2a]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-[#e8c547] text-[#f0f0f0]' : 'border-transparent text-[#888] hover:text-[#f0f0f0]'
            }`}
          >
            <t.Icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'sabores' && (
        <TablaMaestra titulo="Sabores" singular="sabor" descripcion="Sabores producidos por fábrica" apiPath="/api/fabrica-sabores" />
      )}
      {tab === 'presentaciones' && (
        <TablaMaestra
          titulo="Presentaciones"
          singular="presentación"
          descripcion="Presentaciones de producto embolsado, con su peso en kg"
          apiPath="/api/fabrica-presentaciones"
          camposExtra={[{ key: 'peso_kg', label: 'kg', tipo: 'numero', step: '0.01', obligatorio: true }]}
          resumenFila={p => <span className="text-[#888]"> · {String(p.peso_kg)} kg</span>}
        />
      )}
      {tab === 'tamanios' && (
        <TablaMaestra titulo="Tamaños" singular="tamaño" descripcion="Tamaños de producto embolsado" apiPath="/api/fabrica-tamanios" />
      )}
      {tab === 'devolucion-motivos' && (
        <TablaMaestra
          titulo="Motivos de devolución"
          singular="motivo"
          descripcion="Motivos disponibles al cargar una devolución en fábrica"
          apiPath="/api/fabrica-devolucion-motivos"
          camposExtra={[
            {
              key: 'requiere_detalle', tipo: 'checkbox', invertido: true,
              label: 'No pide detalle del producto',
              ayuda: 'Se registra solo el motivo, sin sabor, tamaño ni presentación.',
            },
            {
              key: 'requiere_cantidad', tipo: 'checkbox',
              label: 'Igual pedir la cantidad (kg)', dependeDe: 'requiere_detalle',
            },
            {
              key: 'destino_default', tipo: 'select', label: 'Destino', dependeDe: 'requiere_detalle',
              opciones: [{ valor: 'reinsercion', label: 'Reinserción' }, { valor: 'perdida', label: 'Pérdida' }],
            },
          ]}
          resumenFila={m => !m.requiere_detalle ? (
            <span className="text-[#888]">
              {' '}· Sin detalle{m.requiere_cantidad ? ' · kg' : ''} · {m.destino_default === 'perdida' ? 'Pérdida' : 'Reinserción'}
            </span>
          ) : null}
        />
      )}
      {tab === 'operarios' && (
        <TablaMaestra
          titulo="Operarios"
          singular="operario"
          descripcion="Personal a cargo del supervisor de fábrica, para atribuir cada carga"
          apiPath="/api/fabrica-operarios"
        />
      )}
    </div>
  )
}
