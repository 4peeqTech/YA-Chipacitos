'use client'

import { useState } from 'react'
import Modal from './Modal'

interface ConfirmOptions {
  titulo?: string
  mensaje: React.ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  /** Estilo de alerta (rojo) para acciones destructivas o irreversibles. */
  peligroso?: boolean
  onConfirmar: () => void
}

export function useConfirm() {
  const [opciones, setOpciones] = useState<ConfirmOptions | null>(null)

  function cerrar() {
    setOpciones(null)
  }

  function aceptar() {
    opciones?.onConfirmar()
    cerrar()
  }

  const dialog = (
    <Modal open={!!opciones} onClose={cerrar} title={opciones?.titulo ?? 'Confirmar'} accent={opciones?.peligroso ? 'red' : 'gold'}>
      <p className="text-sm text-[#888]">{opciones?.mensaje}</p>
      <div className="flex gap-2 pt-4">
        <button onClick={cerrar} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors">
          {opciones?.textoCancelar ?? 'Cancelar'}
        </button>
        <button
          onClick={aceptar}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            opciones?.peligroso ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-[#e8c547] text-black hover:opacity-90'
          }`}
        >
          {opciones?.textoConfirmar ?? 'Confirmar'}
        </button>
      </div>
    </Modal>
  )

  return { confirmar: setOpciones, dialog }
}
