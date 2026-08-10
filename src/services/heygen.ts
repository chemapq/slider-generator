/**
 * Servicio HeyGen v3 (avatar en vídeo con lip-sync). Genera un vídeo hablado para la
 * INTRO del deck a partir del mismo mp3 de ElevenLabs que narra esa slide, subiéndolo
 * como asset y usándolo como audio del avatar de estudio (`HEYGEN_AVATAR_ID`).
 *
 * Mismo estilo que tts.ts: fetch nativo + retry/backoff propio, fallo aislado (nunca
 * tumba /api/generate — un error aquí solo deja la slide con la foto estática).
 *
 * Modo de pruebas (HEYGEN_TEST_MAX_SEC): el audio se recorta ANTES de subirlo, para que
 * el vídeo generado dure unos pocos segundos y no se gasten créditos de más mientras se
 * itera la integración. mp3_44100_64 es CBR (64 kbps ⇒ 8000 bytes/s): el recorte es un
 * corte de bytes aproximado, no un re-encode; suficiente para un vídeo de prueba.
 */

const API_BASE = 'https://api.heygen.com'
const MAX_RETRIES = 3
const POLL_INTERVAL_MS = 5000
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1000
const MAX_VIDEO_BYTES = 24 * 1024 * 1024 // ~24 MB de mp4 (≈32 MB ya en base64)
const MP3_BYTES_PER_SEC = 8000 // mp3_44100_64 (tts.ts) ≈ 64 kbps CBR

export interface SlideVideo {
  /** mp4 en base64, SIN prefijo data:. */
  videoBase64: string
  mime: 'video/mp4'
  durationSec: number
}

export function isHeygenConfigured(): boolean {
  return Boolean(process.env.HEYGEN_API_KEY && process.env.HEYGEN_AVATAR_ID)
}

/** Segundos a los que recortar el audio en modo pruebas; 0 = sin recorte. */
function testMaxSec(): number {
  const raw = process.env.HEYGEN_TEST_MAX_SEC
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Recorta un mp3 CBR (base64) a como mucho `maxSec` segundos, por corte de bytes.
 * Aproximado (no re-encoda), pensado solo para acotar la duración de vídeos de prueba.
 */
export function trimMp3Base64(audioBase64: string, maxSec: number): string {
  if (maxSec <= 0) return audioBase64
  const buf = Buffer.from(audioBase64, 'base64')
  const maxBytes = Math.ceil(maxSec * MP3_BYTES_PER_SEC)
  if (buf.length <= maxBytes) return audioBase64
  return buf.subarray(0, maxBytes).toString('base64')
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500)
  } catch {
    return '<sin cuerpo>'
  }
}

async function backoff(attempt: number): Promise<void> {
  if (attempt >= MAX_RETRIES - 1) return
  const base = 500 * 2 ** attempt
  const jitter = Math.random() * 250
  await sleep(base + jitter)
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (err) {
      lastErr = err
      await backoff(attempt)
      continue
    }
    if (res.ok) return res

    const body = await safeBody(res)
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'))
      if (Number.isFinite(retryAfter) && retryAfter > 0) await sleep(retryAfter * 1000)
      else await backoff(attempt)
      lastErr = new Error(`HeyGen 429: ${body}`)
      continue
    }
    if (res.status >= 500) {
      lastErr = new Error(`HeyGen ${res.status}: ${body}`)
      await backoff(attempt)
      continue
    }
    throw new Error(`HeyGen ${res.status}: ${body}`)
  }
  throw lastErr instanceof Error ? lastErr : new Error(`HeyGen: fallo tras ${MAX_RETRIES} intentos`)
}

async function uploadAudioAsset(apiKey: string, mp3: Buffer): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(mp3)], { type: 'audio/mpeg' }), 'narration.mp3')

  const res = await fetchWithRetry(`${API_BASE}/v3/assets`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: form,
  })
  const json = (await res.json()) as { data?: { asset_id?: string; id?: string }; asset_id?: string; id?: string }
  const assetId = json.data?.asset_id ?? json.data?.id ?? json.asset_id ?? json.id
  if (!assetId) throw new Error('HeyGen: subida de audio sin asset_id en la respuesta.')
  return assetId
}

async function createVideo(apiKey: string, avatarId: string, audioAssetId: string): Promise<string> {
  const res = await fetchWithRetry(`${API_BASE}/v3/videos`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'avatar',
      avatar_id: avatarId,
      audio_asset_id: audioAssetId,
      resolution: '720p',
      aspect_ratio: '1:1',
      fit: 'cover',
      output_format: 'mp4',
      title: 'avatar-intro',
    }),
  })
  const json = (await res.json()) as { data?: { video_id?: string } }
  const videoId = json.data?.video_id
  if (!videoId) throw new Error('HeyGen: creación de vídeo sin video_id en la respuesta.')
  return videoId
}

interface VideoStatus {
  data?: { status?: string; video_url?: string; duration?: number }
}

async function pollVideo(
  apiKey: string,
  videoId: string,
  timeoutMs: number,
): Promise<{ videoUrl: string; durationSec: number }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetchWithRetry(`${API_BASE}/v3/videos/${encodeURIComponent(videoId)}`, {
      headers: { 'x-api-key': apiKey },
    })
    const json = (await res.json()) as VideoStatus
    const status = json.data?.status
    if (status === 'completed') {
      const videoUrl = json.data?.video_url
      if (!videoUrl) throw new Error('HeyGen: vídeo completado sin video_url.')
      return { videoUrl, durationSec: json.data?.duration ?? 0 }
    }
    if (status === 'failed') throw new Error('HeyGen: la generación del vídeo falló.')
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`HeyGen: timeout esperando el vídeo (>${Math.round(timeoutMs / 1000)}s).`)
}

async function downloadVideo(videoUrl: string): Promise<Buffer> {
  const res = await fetchWithRetry(videoUrl, {})
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_VIDEO_BYTES) {
    throw new Error(`HeyGen: vídeo de ${Math.round(buf.length / 1024 / 1024)} MB supera el límite.`)
  }
  return buf
}

/**
 * Genera el vídeo de avatar para la INTRO a partir del mp3 de esa slide. Nunca lanza
 * por un fallo del propio HeyGen (créditos, timeout, red…): devuelve `null` y loguea.
 * Solo lanza si falta configuración (para que el llamador decida no intentarlo).
 */
export async function generateIntroAvatarVideo(audioBase64: string, mimeIsMp3 = true): Promise<SlideVideo | null> {
  const apiKey = process.env.HEYGEN_API_KEY
  const avatarId = process.env.HEYGEN_AVATAR_ID
  if (!apiKey || !avatarId) throw new Error('Falta HEYGEN_API_KEY/HEYGEN_AVATAR_ID en el entorno.')
  if (!mimeIsMp3) {
    console.warn('[heygen] audio no-mp3 recibido; se sube tal cual (HeyGen autodetecta el MIME).')
  }

  const maxSec = testMaxSec()
  const trimmed = maxSec > 0 ? trimMp3Base64(audioBase64, maxSec) : audioBase64
  if (maxSec > 0 && trimmed !== audioBase64) {
    console.log(`[heygen] modo pruebas: audio recortado a ~${maxSec}s antes de subirlo.`)
  }

  const pollTimeoutMs = Number(process.env.HEYGEN_POLL_TIMEOUT_MS) || DEFAULT_POLL_TIMEOUT_MS

  try {
    const assetId = await uploadAudioAsset(apiKey, Buffer.from(trimmed, 'base64'))
    const videoId = await createVideo(apiKey, avatarId, assetId)
    const { videoUrl, durationSec } = await pollVideo(apiKey, videoId, pollTimeoutMs)
    const mp4 = await downloadVideo(videoUrl)
    console.log(`[heygen] vídeo de intro generado: ${durationSec}s, ${Math.round(mp4.length / 1024)} KB.`)
    return { videoBase64: mp4.toString('base64'), mime: 'video/mp4', durationSec }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[heygen] fallo generando el avatar en vídeo → se usa la foto estática. ${msg}`)
    return null
  }
}
