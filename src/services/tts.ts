/**
 * Servicio TTS (ElevenLabs). Convierte la narración de cada slide en audio mp3
 * + subtítulos (cues) usando el endpoint `with-timestamps`, que devuelve los
 * tiempos a nivel de carácter de los que derivamos los cues.
 *
 * Usa `fetch` nativo (Node ≥ 18) con un bucle de retry/backoff propio — el SDK de
 * Anthropic en `claude.ts` no aplica aquí. El criterio de "error transitorio"
 * (429/5xx) es el mismo que `isTransientApiError` en `routes/generate.ts`.
 */

const API_BASE = 'https://api.elevenlabs.io'

const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_64' // 64 kbps: equilibrio voz/peso del HTML embebido

// Límite de caracteres por petición. Conservador: eleven_multilingual_v2 admite
// ~10 000; dejamos margen. Una narración por slide rara vez se acerca a esto.
// Si una narración lo supera → la slide queda MUDA + log (NO se concatena audio a
// mano; ver V3 del plan: "troceo = parar y escalar").
const MAX_CHARS = 9000

// Concurrencia del pool. Free tier de ElevenLabs ≈ 2 peticiones simultáneas.
const MAX_CONCURRENCY = 2

const MAX_RETRIES = 3

// ── Tipos públicos ────────────────────────────────────────────────────────────

/** Un subtítulo: tramo de texto con su ventana temporal en el audio de la slide. */
export interface Cue {
  start: number
  end: number
  text: string
}

export interface SlideAudio {
  /** mp3 en base64, SIN el prefijo `data:`. */
  audioBase64: string
  /** Siempre 'audio/mpeg' para mp3. */
  mime: string
  /** Duración del audio en segundos (del último timestamp). */
  durationSec: number
  /** Subtítulos derivados del alignment de ElevenLabs. */
  cues: Cue[]
}

/** Alineado por índice con `data.slides`. `null` = slide sin narración o sin audio. */
export type DeckAudio = (SlideAudio | null)[]

export interface SynthesizeOptions {
  voiceId?: string
  modelId?: string
  outputFormat?: string
}

/**
 * Identidad de la configuración de voz con la que se sintetizó un audio. Si cambia,
 * la caché por slide del deck-store deja de servir (hay que re-sintetizar todo).
 * Resuelve los defaults del entorno para que "voz por defecto" y su id explícito
 * cuenten como la MISMA voz (si no, cambiar de panel invalidaría la caché en falso).
 */
export function voiceCacheKey(opts: SynthesizeOptions = {}): string {
  const voice = opts.voiceId || process.env.ELEVENLABS_VOICE_ID || ''
  const model = opts.modelId || DEFAULT_MODEL
  const format = opts.outputFormat || DEFAULT_OUTPUT_FORMAT
  return `${voice}|${model}|${format}`
}

// ── Tipos internos de la respuesta de ElevenLabs ───────────────────────────────

interface Alignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

interface TimestampResponse {
  audio_base64: string
  alignment: Alignment | null
  normalized_alignment?: Alignment | null
}

// ── Construcción de subtítulos (función pura, testeable sin red) ────────────────

/** Cierra un cue al final de frase (. ! ? …) o al superar ~120 caracteres. */
const CUE_MAX_CHARS = 120

export function buildCues(alignment: Alignment | null | undefined): Cue[] {
  if (!alignment) return []
  const chars = alignment.characters ?? []
  const starts = alignment.character_start_times_seconds ?? []
  const ends = alignment.character_end_times_seconds ?? []
  const n = Math.min(chars.length, starts.length, ends.length)

  const cues: Cue[] = []
  let bufStart = -1 // índice del primer carácter NO-espacio del cue actual
  let buf = ''

  const flush = (lastIdx: number) => {
    const text = buf.trim()
    if (text && bufStart >= 0) {
      cues.push({ start: starts[bufStart]!, end: ends[lastIdx]!, text })
    }
    buf = ''
    bufStart = -1
  }

  for (let i = 0; i < n; i++) {
    const ch = chars[i]!
    if (bufStart === -1 && ch.trim() !== '') bufStart = i
    buf += ch

    const next = i + 1 < n ? chars[i + 1]! : ''
    const isSentenceEnd = /[.!?…]/.test(ch) && (next === '' || /\s/.test(next))
    const tooLong = buf.trim().length >= CUE_MAX_CHARS && /\s/.test(ch)

    if (bufStart >= 0 && (isSentenceEnd || tooLong)) flush(i)
  }
  if (buf.trim()) flush(n - 1)

  // Garantía: orden por start y sin solapados (defensivo ante alignments irregulares).
  cues.sort((a, b) => a.start - b.start)
  for (let i = 1; i < cues.length; i++) {
    if (cues[i]!.start < cues[i - 1]!.end) {
      cues[i]!.start = cues[i - 1]!.end
    }
  }

  return cues
}

// ── Cliente HTTP con retry/backoff ─────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500)
  } catch {
    return '<sin cuerpo>'
  }
}

/** Backoff exponencial + jitter; no duerme tras el último intento. */
async function backoff(attempt: number): Promise<void> {
  if (attempt >= MAX_RETRIES - 1) return
  const base = 500 * 2 ** attempt // 500ms, 1000ms, …
  const jitter = Math.random() * 250
  await sleep(base + jitter)
}

/**
 * `fetch` con reintentos. Reintenta en 429/5xx y errores de red; lanza de
 * inmediato (sin reintentar) en 4xx no-429 (clave inválida, body mal formado…).
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (err) {
      lastErr = err // error de red → transitorio
      await backoff(attempt)
      continue
    }
    if (res.ok) return res

    const body = await safeBody(res)
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`ElevenLabs ${res.status}: ${body}`)
      await backoff(attempt)
      continue
    }
    // 4xx no-429: no es transitorio, no reintentar.
    throw new Error(`ElevenLabs ${res.status}: ${body}`)
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`ElevenLabs: fallo tras ${MAX_RETRIES} intentos`)
}

// ── Síntesis ────────────────────────────────────────────────────────────────────

async function synthesizeOne(
  text: string,
  apiKey: string,
  voiceId: string,
  modelId: string,
  outputFormat: string,
): Promise<SlideAudio> {
  // output_format va como query param (no en el body) en la API de ElevenLabs.
  const url =
    `${API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps` +
    `?output_format=${encodeURIComponent(outputFormat)}`

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: modelId }),
  })

  const json = (await res.json()) as TimestampResponse
  const cues = buildCues(json.alignment)
  const ends = json.alignment?.character_end_times_seconds ?? []
  const durationSec = ends.length ? ends[ends.length - 1]! : 0

  // Clamp del último end a la duración (defensivo).
  for (const c of cues) if (c.end > durationSec) c.end = durationSec

  return { audioBase64: json.audio_base64, mime: 'audio/mpeg', durationSec, cues }
}

/**
 * Sintetiza la narración de cada slide. Devuelve un array alineado por índice
 * con `narrations`: `null` para slides sin narración, que fallan tras reintentos
 * o cuya narración excede el límite de caracteres (slide muda, nunca tumba el deck).
 */
export async function synthesizeDeck(
  narrations: (string | undefined)[],
  opts: SynthesizeOptions = {},
): Promise<DeckAudio> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('Falta ELEVENLABS_API_KEY en el entorno.')
  const voiceId = opts.voiceId || process.env.ELEVENLABS_VOICE_ID
  if (!voiceId) throw new Error('Falta ELEVENLABS_VOICE_ID (env u opts).')
  const modelId = opts.modelId || DEFAULT_MODEL
  const outputFormat = opts.outputFormat || DEFAULT_OUTPUT_FORMAT

  const results: DeckAudio = new Array(narrations.length).fill(null)

  // Solo slides con narración no vacía.
  const tasks: number[] = []
  narrations.forEach((t, i) => {
    if (t && t.trim()) tasks.push(i)
  })

  // Pool con concurrencia limitada; preserva el orden escribiendo por índice.
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < tasks.length) {
      const idx = tasks[cursor++]!
      const text = narrations[idx]!.trim()

      if (text.length > MAX_CHARS) {
        console.warn(
          `[tts] slide ${idx}: narración de ${text.length} caracteres supera el límite ` +
            `de ${MAX_CHARS} → slide MUDA. (Troceo = parar y escalar; no se concatena audio a mano.)`,
        )
        continue // results[idx] queda null
      }

      try {
        results[idx] = await synthesizeOne(text, apiKey, voiceId, modelId, outputFormat)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[tts] slide ${idx}: fallo TTS tras reintentos → slide muda. ${msg}`)
        // results[idx] queda null
      }
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, tasks.length) }, worker)
  await Promise.all(workers)

  return results
}
