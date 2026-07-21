'use client'

import { useEffect, useRef, useState } from 'react'

interface GrabadorTextoProps {
  onTranscripcion: (texto: string) => void
}

// Botón de micrófono chico para dictar texto libre en un campo (click para
// empezar, click para cortar y transcribir). A diferencia del grabador de
// TareasClient (mantener presionado, arrastrar para cancelar), acá no hace
// falta ese gesto: es solo texto para un campo, no la creación de una tarea.
export default function GrabadorTexto({ onTranscripcion }: GrabadorTextoProps) {
  const [grabando, setGrabando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  async function iniciar() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        await transcribir(blob)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setGrabando(true)
    } catch {
      setError('No se pudo acceder al micrófono')
    }
  }

  function detener() {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    setGrabando(false)
    setProcesando(true)
  }

  async function transcribir(blob: Blob) {
    try {
      const form = new FormData()
      form.append('audio', blob, 'audio.webm')
      const res = await fetch('/api/tareas/transcribir', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo transcribir')
      onTranscripcion(data.transcripcion)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo transcribir')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={grabando ? detener : iniciar}
        disabled={procesando}
        title={grabando ? 'Detener grabación' : 'Dictar por voz'}
        className={`w-6 h-6 rounded-full border-none cursor-pointer flex items-center justify-center text-[13px] shrink-0 leading-none ${
          grabando ? 'bg-[#e84210] text-white' : procesando ? 'bg-[#2a2a2a] text-[#666] cursor-not-allowed' : 'bg-[#1a1a1a] text-[#e8c547] hover:bg-[#2a2a2a]'
        }`}
      >
        {procesando ? '⏳' : grabando ? '⏹' : '🎙'}
      </button>
      {grabando && <span className="text-[10px] text-[#e84210] font-semibold">Grabando…</span>}
      {procesando && <span className="text-[10px] text-[#888]">Transcribiendo…</span>}
      {error && <span className="text-[10px] text-[#e84210]">{error}</span>}
    </span>
  )
}
