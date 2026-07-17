const GROQ_API = 'https://api.groq.com/openai/v1'

export async function transcribirAudio(audioBlob: Blob): Promise<string> {
  const form = new FormData()
  form.append('file', audioBlob, 'audio.webm')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', 'es')
  form.append('response_format', 'json')

  const res = await fetch(`${GROQ_API}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper error: ${err}`)
  }

  const { text } = await res.json()
  return (text || '').trim()
}
