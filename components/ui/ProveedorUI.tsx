'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, TriangleAlert, X } from 'lucide-react'
import Modal from './Modal'

type ToastType = 'success' | 'error'
interface ToastItem { id: number; type: ToastType; message: string }

interface ConfirmOptions {
  titulo?: string
  mensaje: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  /** Estilo de alerta (rojo) para acciones destructivas o irreversibles. */
  peligroso?: boolean
  onConfirmar: () => void
}

interface ProveedorUICtx {
  toast: { success: (mensaje: string) => void; error: (mensaje: string) => void }
  confirmar: (opciones: ConfirmOptions) => void
}

const Ctx = createContext<ProveedorUICtx | null>(null)

/**
 * Monta ToastStack + el modal de confirmación una sola vez, en app/layout.tsx.
 * Antes cada pantalla instanciaba su propio useToasts()/useConfirm() y montaba
 * su propio <ToastStack>/<Modal> — de acá en más se consume con useToast()/
 * useConfirmar() desde cualquier client component, sin volver a montar nada.
 */
export default function ProveedorUI({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmOpciones, setConfirmOpciones] = useState<ConfirmOptions | null>(null)
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  function cerrarConfirm() {
    setConfirmOpciones(null)
  }

  function aceptarConfirm() {
    confirmOpciones?.onConfirmar()
    cerrarConfirm()
  }

  const ctx: ProveedorUICtx = {
    toast: {
      success: (mensaje: string) => push('success', mensaje),
      error: (mensaje: string) => push('error', mensaje),
    },
    confirmar: setConfirmOpciones,
  }

  return (
    <Ctx.Provider value={ctx}>
      {children}

      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 w-auto max-w-[calc(100vw-2rem)] lg:top-auto lg:bottom-4 lg:max-w-sm z-70 flex flex-col gap-2">
          {toasts.map(t => (
            <div
              key={t.id}
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-border bg-surface text-text px-4 py-3 shadow-modal"
            >
              <span className={`shrink-0 mt-0.5 ${t.type === 'success' ? 'text-success' : 'text-brand-red'}`}>
                {t.type === 'success' ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}
              </span>
              <p className="text-sm flex-1">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Cerrar notificación" className="text-faint hover:text-text shrink-0">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!confirmOpciones}
        onClose={cerrarConfirm}
        title={confirmOpciones?.titulo ?? 'Confirmar'}
        accent={confirmOpciones?.peligroso ? 'red' : 'gold'}
      >
        <p className="text-sm text-muted">{confirmOpciones?.mensaje}</p>
        <div className="flex gap-2 pt-4">
          <button onClick={cerrarConfirm} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted hover:text-text transition-colors">
            {confirmOpciones?.textoCancelar ?? 'Cancelar'}
          </button>
          <button
            onClick={aceptarConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              confirmOpciones?.peligroso ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-accent text-black hover:opacity-90'
            }`}
          >
            {confirmOpciones?.textoConfirmar ?? 'Confirmar'}
          </button>
        </div>
      </Modal>
    </Ctx.Provider>
  )
}

function useProveedorUI(): ProveedorUICtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast()/useConfirmar() necesitan <ProveedorUI> montado en app/layout.tsx')
  return ctx
}

export function useToast() {
  return useProveedorUI().toast
}

export function useConfirmar() {
  return useProveedorUI().confirmar
}
