import type { Slides } from '../config/schema.js'
import type { Theme } from '../config/theme-schema.js'
import { renderDeck } from '../templates/deck.js'

/** Imágenes resueltas (data URIs) que el renderer inyecta en los slots. */
export interface DeckImages {
  /** id de imagen placeholder ("h1", "v2"…) → data URI. */
  placeholders: Map<string, string>
  /** Avatar-tutor como data URI (si se subió). */
  avatar?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

/**
 * Sustituye los slots que dejó Claude por las imágenes reales:
 * - `<img class="avatar" ... data-avatar>` → su `src` apunta al avatar (o se
 *   elimina el <img> si no hay avatar).
 * - `data-img="<id>"` en un `.media` → se le añade un `background-image` con el
 *   data URI. Si el id no existe, se deja el degradado (fallback).
 */
function fillSlots(html: string, images: DeckImages): string {
  // Avatar: cualquier <img …data-avatar…>
  html = html.replace(/<img\b[^>]*\bdata-avatar\b[^>]*>/gi, (tag) => {
    if (!images.avatar) return '' // sin avatar → quitar el <img> (evita icono roto)
    if (/\bsrc\s*=\s*"/i.test(tag)) {
      return tag.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="${images.avatar}"`)
    }
    return tag.replace(/<img\b/i, `<img src="${images.avatar}"`)
  })

  // Placeholders: data-img="<id>" → inyectar background-image
  html = html.replace(/\bdata-img\s*=\s*"([^"]+)"/gi, (whole, id: string) => {
    const uri = images.placeholders.get(id)
    if (!uri) return whole // id desconocido → degradado fallback
    return `${whole} style="background-image:url('${uri}');background-size:cover;background-position:center"`
  })

  return html
}

/**
 * Convierte el contenido (Slides) + un tema + las imágenes en un deck HTML
 * autocontenido. El `html` de cada slide viene del modelo y se inserta tal cual
 * (HTML intencional con las clases del tema); solo se escapan clase y notas.
 */
export function renderSlides(data: Slides, theme: Theme, images?: DeckImages): string {
  const imgs: DeckImages = images ?? { placeholders: new Map() }

  const sections = data.slides
    .map((slide) => {
      const cls = `slide${slide.slideClass ? ` ${escapeAttr(slide.slideClass)}` : ''}`
      const body = fillSlots(slide.html, imgs)
      const notes = slide.notes
        ? `\n      <aside class="notes">${escapeHtml(slide.notes)}</aside>`
        : ''
      return `    <section class="${cls}">\n${body}${notes}\n    </section>`
    })
    .join('\n')

  return renderDeck({ title: data.title, css: theme.css, slides: sections })
}
