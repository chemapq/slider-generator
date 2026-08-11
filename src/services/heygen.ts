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

import { hasVoiceAvatars } from './voice-catalog.js'

const API_BASE = 'https://api.heygen.com'
const MAX_RETRIES = 3
const POLL_INTERVAL_MS = 5000
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1000
const MAX_VIDEO_BYTES = 24 * 1024 * 1024 // ~24 MB de mp4 (≈32 MB ya en base64)
const MP3_BYTES_PER_SEC = 8000 // mp3_44100_64 (tts.ts) ≈ 64 kbps CBR

/**
 * Motor de render. HeyGen cae en `avatar_iv` si no se declara, que cuesta $4/min y solo
 * lo admiten algunos looks (de ahí los "does not support Avatar IV video generation" con
 * avatares del catálogo). `avatar_iii` cuesta $1/min y lo soporta casi todo.
 */
const DEFAULT_ENGINE = 'avatar_iii'

/** Motor efectivo. Cada look declara los que admite en `supported_api_engines`. */
export function heygenEngine(): string {
  return process.env.HEYGEN_ENGINE || DEFAULT_ENGINE
}

export interface SlideVideo {
  /** mp4 en base64, SIN prefijo data:. */
  videoBase64: string
  mime: 'video/mp4'
  durationSec: number
}

/**
 * Configurado = hay clave y hay AL MENOS una cara disponible, ya sea el presentador por
 * defecto (`HEYGEN_AVATAR_ID`) o el look que declare alguna voz del catálogo.
 */
export function isHeygenConfigured(): boolean {
  if (!process.env.HEYGEN_API_KEY) return false
  return Boolean(process.env.HEYGEN_AVATAR_ID) || hasVoiceAvatars()
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
      // `engine` es un objeto discriminado por `type`, no una cadena: mandarlo plano da
      // 400 "Input should be a valid dictionary or object to extract fields from".
      engine: { type: heygenEngine() },
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

export interface AvatarLook {
  id: string
  name: string
  /** `studio_avatar` | `digital_twin` | `photo_avatar`. */
  avatarType: string
  gender: string
  /** `completed` es el único estado utilizable (solo lo reportan los avatares propios). */
  status: string
  /** Motores que admite: `avatar_iii` | `avatar_iv` | `avatar_v`. */
  supportedEngines: string[]
  previewImageUrl: string
}

/**
 * Ficha de un look de avatar. Es la forma BARATA de saber si un `avatarId` va a funcionar:
 * `supportedEngines` y `status` se consultan sin generar vídeo ni gastar créditos.
 * Nunca lanza: devuelve `null` si el look no existe o la API falla.
 */
export async function fetchAvatarLook(lookId: string): Promise<AvatarLook | null> {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetchWithRetry(`${API_BASE}/v3/avatars/looks/${encodeURIComponent(lookId)}`, {
      headers: { 'x-api-key': apiKey },
    })
    const json = (await res.json()) as {
      data?: {
        id?: string
        name?: string
        avatar_type?: string
        gender?: string
        status?: string
        supported_api_engines?: string[]
        preview_image_url?: string
      }
    }
    const d = json.data
    if (!d?.id) return null
    return {
      id: d.id,
      name: d.name ?? '',
      avatarType: d.avatar_type ?? '',
      gender: d.gender ?? '',
      status: d.status ?? '',
      supportedEngines: d.supported_api_engines ?? [],
      previewImageUrl: d.preview_image_url ?? '',
    }
  } catch (err) {
    console.warn(`[heygen] no se pudo leer el look ${lookId}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

/**
 * Retrato del presentador como data URI, para que la foto estática (poster del vídeo y
 * slide de cierre) sea LA MISMA CARA que habla en la intro.
 *
 * `preview_image_url` viene firmada y caduca, así que se descarga en el momento y se
 * embebe, igual que hacemos con las fotos de Unsplash. Nunca lanza.
 */
export async function fetchAvatarPortrait(lookId: string): Promise<string | null> {
  const look = await fetchAvatarLook(lookId)
  if (!look?.previewImageUrl) return null

  try {
    const res = await fetchWithRetry(look.previewImageUrl, {})
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[heygen] no se pudo descargar el retrato de "${look.name}": ${msg}`)
    return null
  }
}

interface UserBilling {
  billingType: 'wallet' | 'subscription' | 'usage_based' | null
  walletBalance?: number
  walletCurrency?: string
  premiumCreditsRemaining?: number
  addOnCreditsRemaining?: number
  spendingCurrentUsd?: number
}

/** Consulta el saldo/créditos de la cuenta. No lanza: si falla, se omite el log de gasto. */
async function fetchUserBilling(apiKey: string): Promise<UserBilling | null> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/v3/users/me`, {
      headers: { 'x-api-key': apiKey },
    })
    const json = (await res.json()) as {
      data?: {
        billing_type?: 'wallet' | 'subscription' | 'usage_based'
        wallet?: { remaining_balance?: number; currency?: string }
        subscription?: {
          credits?: { premium_credits?: { remaining?: number }; add_on_credits?: { remaining?: number } }
        }
        usage_based?: { spending_current_usd?: number }
      }
    }
    const data = json.data
    if (!data) return null
    return {
      billingType: data.billing_type ?? null,
      walletBalance: data.wallet?.remaining_balance,
      walletCurrency: data.wallet?.currency,
      premiumCreditsRemaining: data.subscription?.credits?.premium_credits?.remaining,
      addOnCreditsRemaining: data.subscription?.credits?.add_on_credits?.remaining,
      spendingCurrentUsd: data.usage_based?.spending_current_usd,
    }
  } catch (err) {
    console.warn(`[heygen] no se pudo consultar el saldo: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

/** Compara el saldo antes/después del vídeo y loguea lo gastado, según el modelo de facturación. */
function logCreditsSpent(before: UserBilling | null, after: UserBilling | null): void {
  if (!before || !after || before.billingType !== after.billingType) return
  switch (after.billingType) {
    case 'wallet': {
      if (before.walletBalance == null || after.walletBalance == null) return
      const spent = before.walletBalance - after.walletBalance
      const currency = after.walletCurrency ?? ''
      console.log(
        `[heygen] gasto del vídeo de avatar: ${spent.toFixed(2)} ${currency} (saldo restante: ${after.walletBalance.toFixed(2)} ${currency}).`,
      )
      return
    }
    case 'subscription': {
      const beforeTotal = (before.premiumCreditsRemaining ?? 0) + (before.addOnCreditsRemaining ?? 0)
      const afterTotal = (after.premiumCreditsRemaining ?? 0) + (after.addOnCreditsRemaining ?? 0)
      console.log(
        `[heygen] gasto del vídeo de avatar: ${(beforeTotal - afterTotal).toFixed(2)} créditos (restantes: ${afterTotal.toFixed(2)}).`,
      )
      return
    }
    case 'usage_based': {
      if (before.spendingCurrentUsd == null || after.spendingCurrentUsd == null) return
      console.log(
        `[heygen] gasto del vídeo de avatar: $${(after.spendingCurrentUsd - before.spendingCurrentUsd).toFixed(2)} (acumulado del periodo: $${after.spendingCurrentUsd.toFixed(2)}).`,
      )
      return
    }
  }
}

async function downloadVideo(videoUrl: string): Promise<Buffer> {
  const res = await fetchWithRetry(videoUrl, {})
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_VIDEO_BYTES) {
    throw new Error(`HeyGen: vídeo de ${Math.round(buf.length / 1024 / 1024)} MB supera el límite.`)
  }
  return buf
}

export interface AvatarVideoOptions {
  /** Look con el que grabar. Sin él, el presentador por defecto (`HEYGEN_AVATAR_ID`). */
  avatarId?: string
  mimeIsMp3?: boolean
}

/**
 * Genera el vídeo de avatar para la INTRO a partir del mp3 de esa slide. Nunca lanza
 * por un fallo del propio HeyGen (créditos, timeout, red…): devuelve `null` y loguea.
 * Solo lanza si falta configuración (para que el llamador decida no intentarlo).
 */
export async function generateIntroAvatarVideo(
  audioBase64: string,
  { avatarId: avatarIdOpt, mimeIsMp3 = true }: AvatarVideoOptions = {},
): Promise<SlideVideo | null> {
  const apiKey = process.env.HEYGEN_API_KEY
  const avatarId = avatarIdOpt || process.env.HEYGEN_AVATAR_ID
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
    const billingBefore = await fetchUserBilling(apiKey)
    const assetId = await uploadAudioAsset(apiKey, Buffer.from(trimmed, 'base64'))
    const videoId = await createVideo(apiKey, avatarId, assetId)
    const { videoUrl, durationSec } = await pollVideo(apiKey, videoId, pollTimeoutMs)
    const mp4 = await downloadVideo(videoUrl)
    const billingAfter = await fetchUserBilling(apiKey)
    logCreditsSpent(billingBefore, billingAfter)
    console.log(
      `[heygen] vídeo de intro generado: avatar=${avatarId} engine=${heygenEngine()} ` +
        `${durationSec}s, ${Math.round(mp4.length / 1024)} KB.`,
    )
    return { videoBase64: mp4.toString('base64'), mime: 'video/mp4', durationSec }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[heygen] fallo generando el avatar en vídeo → se usa la foto estática. ${msg}`)
    return null
  }
}
