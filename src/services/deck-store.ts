/**
 * Store en memoria de contextos de deck. Permite re-sintetizar audio sin re-llamar a Claude:
 * tras generar, guardamos { slides, themeName, images } bajo un UUID; /api/audio lo recupera
 * para llamar solo a ElevenLabs.
 *
 * Cada entrada retiene las imágenes embebidas (data URIs) → MAX_DECKS deliberadamente pequeño.
 * Es un tool local monousuario: perder el store al reiniciar el server es aceptable (cache miss
 * → 404 → "vuelve a generar").
 */

import { randomUUID } from 'crypto'
import type { Slides } from '../config/schema.js'
import type { DeckImages } from './slides.js'

export interface DeckContext {
  slides: Slides
  themeName: string
  images: DeckImages
  createdAt: number
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
