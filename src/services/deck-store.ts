/**
 * Store en memoria de contextos de deck. Permite re-sintetizar audio sin re-llamar a Claude:
 * tras generar, guardamos { slides, themeName, images } bajo un UUID; /api/audio lo recupera
 * para llamar solo a ElevenLabs.
 *
 * También retiene el ÚLTIMO audio sintetizado (`audio` + con qué narración y voz se hizo):
 * al regenerar solo se vuelve a pagar a ElevenLabs por las slides cuya narración cambió.
 *
 * Cada entrada retiene las imágenes y el audio embebidos (data URIs / mp3 base64) →
 * MAX_DECKS deliberadamente pequeño. Es un tool local monousuario: perder el store al
 * reiniciar el server es aceptable (cache miss → 404 → "vuelve a generar").
 */

import { randomUUID } from 'crypto'
import type { Slides } from '../config/schema.js'
import type { DeckImages } from './slides.js'
import type { DeckAudio } from './tts.js'

export interface DeckContext {
  slides: Slides
  themeName: string
  images: DeckImages
  createdAt: number
  /** Último audio sintetizado, alineado por índice con `slides.slides`. */
  audio?: DeckAudio
  /** Voz+modelo+formato con los que se sintetizó `audio` (ver `voiceCacheKey`). */
  audioKey?: string
  /** Narración normalizada que produjo cada entrada de `audio`. */
  audioNarrations?: string[]
}

/** Narración lista para comparar: la caché de audio ignora espacios de borde. */
export function normNarration(n: string | undefined | null): string {
  return (n ?? '').trim()
}

const MAX_DECKS = 20
const TTL_MS = 2 * 60 * 60 * 1000 // 2 h

const store = new Map<string, DeckContext>()

export function putDeck(ctx: Omit<DeckContext, 'createdAt'>): string {
  const id = randomUUID()
  store.set(id, { ...ctx, createdAt: Date.now() })
  // Desalojo FIFO: Map preserva orden de inserción.
  while (store.size > MAX_DECKS) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
  return id
}

export function getDeck(id: string): DeckContext | undefined {
  const ctx = store.get(id)
  if (!ctx) return undefined
  if (Date.now() - ctx.createdAt > TTL_MS) {
    store.delete(id)
    return undefined
  }
  return ctx
}

/**
 * Sobrescribe el html de cada slide del deck (p.ej. tras editar en el editor visual).
 * No toca slideClass, notes ni narration. Respeta TTL vía getDeck.
 */
export function updateDeckSlides(id: string, htmls: string[]): boolean {
  const ctx = getDeck(id)
  if (!ctx) return false
  ctx.slides.slides.forEach((s, i) => {
    if (typeof htmls[i] === 'string') s.html = htmls[i]
  })
  return true
}

/**
 * Sobrescribe la narración (guion de voz) de cada slide, tras editarla en el panel
 * "Guion". Cadena vacía → `undefined` (slide sin narrar → muda al regenerar audio).
 * No toca el html ni la caché de audio: la comparación con `audioNarrations` es la que
 * decide después qué slides hay que re-sintetizar.
 */
export function updateDeckNarrations(id: string, narrations: string[]): boolean {
  const ctx = getDeck(id)
  if (!ctx) return false
  ctx.slides.slides.forEach((s, i) => {
    const raw = narrations[i]
    if (typeof raw !== 'string') return
    s.narration = normNarration(raw) || undefined
  })
  return true
}

/** Guarda el audio recién sintetizado como base de la próxima regeneración parcial. */
export function setDeckAudio(
  id: string,
  audio: DeckAudio,
  audioKey: string,
  audioNarrations: string[],
): void {
  const ctx = getDeck(id)
  if (!ctx) return
  ctx.audio = audio
  ctx.audioKey = audioKey
  ctx.audioNarrations = audioNarrations
}
