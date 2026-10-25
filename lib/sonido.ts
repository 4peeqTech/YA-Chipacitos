// Sonido de aviso de pedido nuevo (mayorista, depósito).
//
// Safari (Mac, iPhone y la app instalada) no deja reproducir audio que no haya
// "despertado" un toque del usuario: el AudioContext se crea suspendido y
// resume() fuera de un gesto no hace nada. Antes el contexto se creaba recién al
// llegar el pedido (sin gesto), y en Safari nunca sonaba. Ahora se despierta con
// el primer toque o tecla en la pantalla, reproduciendo un instante de silencio.
//
// Límite de Apple: con la app cerrada o en segundo plano no hay sonido de la
// página; ahí avisa la notificación push.

let ctx: AudioContext | null = null
let preparado = false

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  return ctx
}

function despertar() {
  const c = contexto()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  // Un buffer mudo dentro del gesto termina de habilitar el audio en iOS.
  try {
    const src = c.createBufferSource()
    src.buffer = c.createBuffer(1, 1, 22050)
    src.connect(c.destination)
    src.start(0)
  } catch {}
  if (c.state === 'running') quitarEscuchas()
}

const EVENTOS = ['pointerdown', 'touchend', 'keydown'] as const

function quitarEscuchas() {
  for (const e of EVENTOS) window.removeEventListener(e, despertar, true)
}

/** Deja el sonido listo para cuando llegue un pedido. Llamar al montar la pantalla. */
export function prepararSonido() {
  if (preparado || typeof window === 'undefined') return
  preparado = true
  for (const e of EVENTOS) window.addEventListener(e, despertar, true)
}

/** Dos tonos cortos (880 → 660 Hz). Si el audio todavía no se despertó, no suena. */
export function sonarAviso() {
  try {
    const c = contexto()
    if (!c) return
    if (c.state === 'suspended') c.resume().catch(() => {})
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, c.currentTime)
    osc.frequency.setValueAtTime(660, c.currentTime + 0.15)
    gain.gain.setValueAtTime(0.4, c.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + 0.5)
  } catch {}
}
