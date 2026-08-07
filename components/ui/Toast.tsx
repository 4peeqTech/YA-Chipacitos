'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, TriangleAlert, X } from 'lucide-react'

export type ToastType = 'success' | 'error'
export interface ToastItem { id: number; type: ToastType; message: string }

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  return {
    toasts,
    dismiss,
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
  }
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const isSuccess = toast.type === 'success'
  const iconTone = isSuccess ? 'text-green-400' : 'text-red-400'

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-xl border border-border bg-surface text-text px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,.6)] transition-all duration-200 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <span className={`shrink-0 mt-0.5 ${iconTone}`}>
        {isSuccess ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}
      </span>
      <p className="text-sm flex-1">{toast.message}</p>
      <button onClick={onDismiss} aria-label="Cerrar notificación" className="text-[#888] hover:text-text shrink-0">
        <X size={16} />
      </button>
    </div>
  )
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 w-auto max-w-[calc(100vw-2rem)] lg:top-auto lg:bottom-4 lg:max-w-sm z-70 flex flex-col gap-2">
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />)}
    </div>
  )
}
