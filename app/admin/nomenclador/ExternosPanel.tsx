'use client'

import { useMemo, useState, useTransition } from 'react'
import { IconPlugConnected, IconPlus, IconX } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import { Chip, SegmentedControl } from '@/components/ui/Chip'
import { Field, Input, Select } from '@/components/ui/Field'
import SelectBuscador from '@/components/ui/SelectBuscador'
import { useToast } from '@/components/ui/ProveedorUI'
import { SISTEMAS, SISTEMA_LABEL, normalizar, type ExternoNom, type Sistema } from '@/lib/nomenclador/tipos'
import type { DatosNomenclador } from './NomencladorClient'
import { ItemLinea, botonPrimario, botonSecundario } from './comun'
import { asignarExterno, crearExterno } from './acciones'

export default function ExternosPanel({ datos, onAbrirItem }: { datos: DatosNomenclador; onAbrirItem: (id: string) => void }) {
  const { items, externos } = datos
  const porId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const sinMapear = externos.filter(e => e.activo && !e.item_id).length

  const [busqueda, setBusqueda] = useState('')
  const [sistema, setSistema] = useState<Sistema | 'todos'>('todos')
  const [soloSinMapear, setSoloSinMapear] = useState(sinMapear > 0)
  const [abierto, setAbierto] = useState<ExternoNom | null>(null)
  const [creando, setCreando] = useState(false)

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return externos.filter(e => {
      const it = e.item_id ? porId.get(e.item_id) : undefined
      const texto = normalizar(`${e.codigo} ${e.nombre} ${it?.codigo ?? ''} ${it?.nombre ?? ''}`)
      return (sistema === 'todos' || e.sistema === sistema) &&
        (!soloSinMapear || (e.activo && !e.item_id)) &&
        (!q || q.split(/\s+/).every(p => texto.includes(p)))
    })
  }, [externos, porId, busqueda, sistema, soloSinMapear])

  const columnas: Columna<ExternoNom>[] = [
    { key: 'sistema', header: 'Sistema', ordenar: e => e.sistema, render: e => <span className="text-muted">{SISTEMA_LABEL[e.sistema]}</span> },
    { key: 'codigo', header: 'Código', ordenar: e => Number(e.codigo) || e.codigo, render: e => <span className="font-mono">{e.codigo}</span> },
    { key: 'nombre', header: 'Nombre en el sistema', className: 'min-w-56', ordenar: e => normalizar(e.nombre), render: e => <span>{e.nombre}</span> },
    {
      key: 'item', header: 'Ítem del nomenclador', className: 'min-w-56',
      ordenar: e => (e.item_id ? porId.get(e.item_id)?.codigo ?? '' : ''),
      render: e => {
        if (!e.activo) return <span className="text-muted">Descartado{e.notas && ` · ${e.notas}`}</span>
        const it = e.item_id ? porId.get(e.item_id) : undefined
        if (!it) return (
          <span className="block">
            <span className="rounded-full bg-danger-bg px-2 py-0.5 text-2xs font-semibold text-brand-red">Sin mapear</span>
            {e.notas && <span className="mt-1 block text-xs text-muted">{e.notas}</span>}
          </span>
        )
        return <ItemLinea item={it} />
      },
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por código o nombre" className="min-w-60 flex-1" />
        <SegmentedControl
          value={sistema}
          onChange={setSistema}
          opciones={[{ value: 'todos', label: 'Todos' }, ...SISTEMAS.map(s => ({ value: s, label: SISTEMA_LABEL[s] }))]}
        />
        <Chip active={soloSinMapear} onClick={() => setSoloSinMapear(v => !v)}>Sin mapear · {sinMapear}</Chip>
        <button onClick={() => setCreando(true)} className={botonSecundario}><IconPlus size={16} /> Nuevo código</button>
      </div>
      <p className="text-xs text-muted">
        Cada código de Posberry o Fudo apunta a un ítem. Varios códigos pueden ir al mismo ítem (por ejemplo, el mismo producto con descuento o en otro canal).
      </p>
      <DataTable
        filas={filtrados}
        columnas={columnas}
        filaKey={e => e.id}
        onFilaClick={setAbierto}
        filaClassName={e => (e.activo ? '' : 'opacity-60')}
        vacio={<EmptyState icono={IconPlugConnected} titulo={soloSinMapear ? 'No hay códigos sin mapear' : 'Ningún código coincide'} />}
      />
      {abierto && <AsignarModal externo={abierto} datos={datos} onCerrar={() => setAbierto(null)} onAbrirItem={onAbrirItem} />}
      {creando && <NuevoExternoModal datos={datos} onCerrar={() => setCreando(false)} />}
    </div>
  )
}

function opcionesItems(datos: DatosNomenclador) {
  return datos.items
    .filter(i => i.estado === 'activo')
    .map(i => ({ value: i.id, label: `${i.codigo} · ${i.nombre}` }))
}

function AsignarModal({ externo, datos, onCerrar, onAbrirItem }: {
  externo: ExternoNom; datos: DatosNomenclador; onCerrar: () => void; onAbrirItem: (id: string) => void
}) {
  const toast = useToast()
  const [pendiente, startTransition] = useTransition()
  const [destino, setDestino] = useState(externo.item_id ?? '')
  const actual = externo.item_id ? datos.items.find(i => i.id === externo.item_id) : undefined

  function guardar(itemId: string | null) {
    startTransition(async () => {
      const r = await asignarExterno({ externoId: externo.id, itemId })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(itemId ? 'Código asignado' : 'Código quitado: queda sin mapear')
      onCerrar()
    })
  }

  return (
    <Modal open onClose={onCerrar} size="lg" title={`${SISTEMA_LABEL[externo.sistema]} ${externo.codigo}`}>
      <div className="space-y-4">
        <p className="text-sm">{externo.nombre}</p>
        {externo.notas && <p className="rounded-lg bg-surface2 p-3 text-sm text-muted">{externo.notas}</p>}
        {actual && (
          <button onClick={() => { onCerrar(); onAbrirItem(actual.id) }} className="flex w-full items-center rounded-xl border border-border px-3 py-2 text-left text-sm hover:border-accent">
            <ItemLinea item={actual} />
            <span className="ml-auto text-xs text-muted">Abrir ficha</span>
          </button>
        )}
        <Field label="Ítem del nomenclador">
          <SelectBuscador value={destino} onChange={setDestino} placeholderVacio="Buscar ítem…" opciones={opcionesItems(datos)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row">
          {externo.item_id && (
            <button onClick={() => guardar(null)} disabled={pendiente} className={botonSecundario}>
              <IconX size={16} /> Quitar asignación
            </button>
          )}
          <button onClick={() => guardar(destino || null)} disabled={pendiente || !destino || destino === externo.item_id} className={`${botonPrimario} sm:ml-auto`}>
            Asignar
          </button>
        </div>
      </div>
    </Modal>
  )
}

function NuevoExternoModal({ datos, onCerrar }: { datos: DatosNomenclador; onCerrar: () => void }) {
  const toast = useToast()
  const [pendiente, startTransition] = useTransition()
  const [form, setForm] = useState({ sistema: 'posberry' as Sistema, codigo: '', nombre: '', itemId: '' })

  function crear() {
    startTransition(async () => {
      const r = await crearExterno({ ...form, itemId: form.itemId || null })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Código creado')
      onCerrar()
    })
  }

  return (
    <Modal open onClose={onCerrar} size="lg" title="Nuevo código externo">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sistema" obligatorio>
            <Select value={form.sistema} onChange={e => setForm(f => ({ ...f, sistema: e.target.value as Sistema }))}>
              {SISTEMAS.map(s => <option key={s} value={s}>{SISTEMA_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="Código" obligatorio>
            <Input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} maxLength={40} />
          </Field>
          <Field label="Nombre en el sistema">
            <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} maxLength={200} />
          </Field>
        </div>
        <Field label="Ítem del nomenclador" ayuda="Se puede dejar sin mapear y asignarlo después.">
          <SelectBuscador value={form.itemId} onChange={v => setForm(f => ({ ...f, itemId: v }))} placeholderVacio="Sin mapear" opciones={opcionesItems(datos)} />
        </Field>
        <div className="flex justify-end border-t border-border pt-4">
          <button onClick={crear} disabled={pendiente} className={botonPrimario}>Crear código</button>
        </div>
      </div>
    </Modal>
  )
}
