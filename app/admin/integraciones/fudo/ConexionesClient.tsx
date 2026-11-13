'use client'

import { useState, useTransition } from 'react'
import { IconAlertTriangle, IconLock, IconPlug, IconPlugConnected, IconPlus } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { Puntos } from '@/components/ui/Cargando'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFechaHora } from '@/lib/formato'
import type { Database } from '@/lib/database.types'
import { agregarLocal, desconectarFudo, guardarConexionFudo } from './acciones'

type Local = Database['public']['Functions']['fudo_conexiones_estado']['Returns'][number]

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'
const botonTexto = 'presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface2 hover:text-text disabled:opacity-50'

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`

type Estado = { texto: string; tono: 'ok' | 'warn' | 'mute' }

/** Qué mostrar de un local: si usa Fudo, si sus claves andan y qué falló la última vez. */
function estadoDe(l: Local): Estado {
  if (!l.tiene_fudo) return { texto: 'No usa Fudo', tono: 'mute' }
  const error = l.ultimo_error ?? ''
  if (/401|403|auth failed|rechaz/i.test(error)) return { texto: 'Claves rechazadas', tono: 'warn' }
  if (/429|esperar/i.test(error)) return { texto: 'Esperando a Fudo', tono: 'mute' }
  if (/credenciales/i.test(error) && !l.con_claves) return { texto: 'Faltan las claves', tono: 'warn' }
  if (error) return { texto: 'No respondió', tono: 'warn' }
  return { texto: 'Conectado', tono: 'ok' }
}

const CLASE_TONO: Record<Estado['tono'], string> = {
  ok: 'bg-green-bg text-success',
  warn: 'bg-warning-bg text-warning',
  mute: 'bg-surface2 text-muted',
}

function ModalClaves({ local, cambiar, onCerrar }: { local: string; cambiar: boolean; onCerrar: () => void }) {
  const toast = useToast()
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, startTransition] = useTransition()
  const completo = apiKey.trim() !== '' && apiSecret.trim() !== ''

  function guardar() {
    if (!completo) { setError('Cargá el API Key y el API Secret.'); return }
    setError(null)
    startTransition(async () => {
      const r = await guardarConexionFudo({ local, apiKey, apiSecret })
      if (!r.ok) { setError(r.error); return }
      toast.success(r.data.probada === null
        ? 'Claves guardadas. Fudo pidió esperar: se prueban en la próxima actualización.'
        : r.data.gastos != null
          ? `Conectado: se trajeron ${plural(r.data.gastos, 'gasto', 'gastos')} de ${local}.`
          : `Conectado: ${local} ya trae sus datos de Fudo.`)
      onCerrar()
    })
  }

  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); guardar() }}>
      <p className="text-sm text-muted">
        En Fudo, entrá con el usuario administrador del local y abrí tu usuario: ahí están <b className="text-text">API Key</b> y <b className="text-text">API Secret</b>. Copialos completos.
        {cambiar && ' Las claves nuevas reemplazan a las que había.'}
      </p>
      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning" role="alert">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
      <Field label="API Key" obligatorio>
        <input aria-label="API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" spellCheck={false}
          className={`${controlClass} min-h-11 font-mono`} />
      </Field>
      <Field label="API Secret" obligatorio ayuda={apiSecret ? `${apiSecret.trim().length} caracteres. No se vuelve a mostrar después de guardarlo.` : 'No se vuelve a mostrar después de guardarlo.'}>
        <input aria-label="API Secret" type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} autoComplete="new-password" spellCheck={false}
          className={`${controlClass} min-h-11 font-mono`} />
      </Field>
      <p className="flex items-start gap-2 rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">
        <IconPlugConnected size={16} className="mt-0.5 shrink-0" aria-hidden />
        Al guardar, el sistema prueba las claves con Fudo. Si las rechaza, no se guardan.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCerrar} className={botonSecundario}>Cancelar</button>
        <button type="submit" disabled={guardando || !completo} className={botonPrimario}>
          {guardando ? <><Puntos /> Probando</> : <><IconPlugConnected size={16} aria-hidden /> Probar y guardar</>}
        </button>
      </div>
    </form>
  )
}

function ModalLocal({ onAgregado, onCerrar }: { onAgregado: (nombre: string, conFudo: boolean) => void; onCerrar: () => void }) {
  const toast = useToast()
  const [nombre, setNombre] = useState('')
  const [caja, setCaja] = useState('')
  const [conFudo, setConFudo] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, startTransition] = useTransition()

  function agregar() {
    if (!nombre.trim() || !caja.trim()) { setError('Poné el nombre y la caja del local.'); return }
    setError(null)
    startTransition(async () => {
      const r = await agregarLocal({ nombre, caja })
      if (!r.ok) { setError(r.error); return }
      toast.success(`Listo: ${r.data} ya está en la lista de locales.`)
      onAgregado(r.data, conFudo)
    })
  }

  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); agregar() }}>
      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning" role="alert">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
      <Field label="Nombre" obligatorio ayuda="Como aparece en Gastos, Compras y los reportes. Queda en mayúsculas, como los demás.">
        <input aria-label="Nombre del local" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80}
          placeholder="Por ejemplo: YA! SAN LORENZO" className={`${controlClass} min-h-11`} />
      </Field>
      <Field label="Caja" obligatorio ayuda="De dónde sale la plata de lo que el local paga en efectivo.">
        <input aria-label="Caja del local" value={caja} onChange={e => setCaja(e.target.value)} maxLength={80}
          placeholder="Por ejemplo: San Lorenzo" className={`${controlClass} min-h-11`} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm text-text">
        <input type="checkbox" checked={conFudo} onChange={e => setConFudo(e.target.checked)} className="h-5 w-5" />
        Usa Fudo: después de agregarlo, cargás sus claves
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCerrar} className={botonSecundario}>Cancelar</button>
        <button type="submit" disabled={guardando} className={botonPrimario}>
          {guardando ? <><Puntos /> Agregando</> : <><IconPlus size={16} aria-hidden /> Agregar</>}
        </button>
      </div>
    </form>
  )
}

type Abierto = { tipo: 'claves'; local: string; cambiar: boolean } | { tipo: 'local' } | null

export default function ConexionesClient({ locales, error }: { locales: Local[]; error: boolean }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [abierto, setAbierto] = useState<Abierto>(null)
  const [, startTransition] = useTransition()

  function desconectar(l: Local) {
    confirmar({
      titulo: 'Desconectar Fudo',
      mensaje: `${l.sucursal} deja de traer sus datos de Fudo y se borran sus claves. Los gastos que ya se trajeron quedan.`,
      textoConfirmar: 'Desconectar',
      peligroso: true,
      onConfirmar: () => startTransition(async () => {
        const r = await desconectarFudo(l.sucursal)
        if (!r.ok) { toast.error(r.error); return }
        toast.success(`${l.sucursal} ya no usa Fudo.`)
      }),
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icono={IconPlugConnected}
        titulo="Conexión Fudo"
        descripcion="Qué locales tienen Fudo y sus claves de la API. Con eso el sistema trae sus gastos, ventas y caja."
        acciones={
          <>
            <AyudaLink seccion="admin" ancla="conexion-fudo" />
            <button type="button" onClick={() => setAbierto({ tipo: 'local' })} className={botonSecundario}>
              <IconPlus size={16} aria-hidden /> Agregar local
            </button>
          </>
        }
      />

      <p className="flex items-start gap-2 rounded-xl bg-info-bg px-4 py-3 text-sm text-text">
        <IconLock size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />
        Las claves se guardan cifradas. Después de cargarlas no se vuelven a mostrar: si cambian en Fudo, se reemplazan acá.
      </p>

      {error ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          No pudimos traer los locales. Recargá la página; si sigue pasando, avisanos.
        </p>
      ) : locales.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <EmptyState icono={IconPlugConnected} titulo="Todavía no hay locales" descripcion="Agregá uno con Agregar local." />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {locales.map(l => {
            const estado = estadoDe(l)
            const gastos = Number(l.gastos ?? 0)
            return (
              <li key={l.sucursal} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56 space-y-0.5">
                  <p className={`font-medium ${l.tiene_fudo ? 'text-text' : 'text-muted'}`}>{l.sucursal}</p>
                  <p className="text-xs text-muted">
                    {l.tiene_fudo
                      ? l.ultimo_ok
                        ? <>Último dato: {formatearFechaHora(l.ultimo_ok)} · {gastos ? plural(gastos, 'gasto', 'gastos') : 'sin gastos en Fudo'}</>
                        : 'Todavía no trajo datos'
                      : `Caja: ${l.caja ?? '—'}`}
                    {l.tiene_fudo && !l.con_claves && ' · claves de respaldo (Vercel)'}
                  </p>
                  {l.ultimo_error && estado.tono === 'warn' && (
                    <p className="text-xs text-warning">{l.ultimo_error}</p>
                  )}
                </div>
                <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${CLASE_TONO[estado.tono]}`}>{estado.texto}</span>
                <div className="flex flex-wrap items-center gap-1">
                  {l.tiene_fudo ? (
                    <>
                      <button type="button" onClick={() => setAbierto({ tipo: 'claves', local: l.sucursal, cambiar: true })} className={botonSecundario}>
                        {l.con_claves ? 'Cambiar claves' : 'Cargar claves'}
                      </button>
                      <button type="button" onClick={() => desconectar(l)} className={botonTexto}>Desconectar</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setAbierto({ tipo: 'claves', local: l.sucursal, cambiar: false })} className={botonPrimario}>
                      <IconPlug size={16} aria-hidden /> Conectar Fudo
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={abierto != null}
        onClose={() => setAbierto(null)}
        title={abierto?.tipo === 'claves' ? `${abierto.cambiar ? 'Cambiar las claves' : 'Conectar Fudo'} · ${abierto.local}` : 'Agregar local'}
      >
        {abierto?.tipo === 'claves' && (
          <ModalClaves key={abierto.local} local={abierto.local} cambiar={abierto.cambiar} onCerrar={() => setAbierto(null)} />
        )}
        {abierto?.tipo === 'local' && (
          <ModalLocal
            onCerrar={() => setAbierto(null)}
            onAgregado={(nombre, conFudo) => setAbierto(conFudo ? { tipo: 'claves', local: nombre, cambiar: false } : null)}
          />
        )}
      </Modal>
    </div>
  )
}
