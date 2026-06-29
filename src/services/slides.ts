import type { Slides } from '../config/schema.js'
import type { Theme } from '../config/theme-schema.js'
import { renderDeck } from '../templates/deck.js'
import type { DeckAudio } from './tts.js'

export interface DeckImages {
  /** id de imagen placeholder ("h1", "v2"…) → data URI. */
  placeholders: Map<string, string>
  /** Avatar-tutor como data URI (si se subió). */
  avatar?: string
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Rellena los slots que dejó Claude:
 *
 * 1. `<img data-avatar …>` → inyecta `src` (avatar-tutor dentro de `.tutor .photo`).
 *    Sin avatar → quita el <img> para no mostrar icono roto.
 *
 * 2. `<img data-img="ID" …>` → inyecta `src` con el data URI del placeholder.
 *    (Patrón preferido: `.imgbox > <img data-img="ID">`)
 *
 * 3. `data-img="ID"` en elementos NON-img (ej: `.media`) → inyecta
 *    `style="background-image:url(…)"` para mostrar la imagen como fondo.
 *    Id desconocido → deja el degradado de fallback (nunca se rompe).
 */
function fillSlots(html: string, images: DeckImages): string {
  // 1. Avatar: <img … data-avatar …>
  html = html.replace(/<img\b([^>]*)\bdata-avatar\b([^>]*)>/gi, (_match, before, after) => {
    if (!images.avatar) return ''
    const attrs = before + after
    if (/\bsrc\s*=\s*"/i.test(attrs)) {
      return `<img${before}${after}>`.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="${images.avatar}"`)
    }
    return `<img${before} src="${images.avatar}"${after}>`
  })

  // 2. <img data-img="ID"> → inject src, strip data-img from the img tag
  html = html.replace(
    /<img\b([^>]*?)data-img\s*=\s*"([^"]+)"([^>]*?)>/gi,
    (_match, before, id, after) => {
      const uri = images.placeholders.get(id)
      if (!uri) return _match
      return `<img${before}src="${uri}"${after}>`
    },
  )

  // 3. Remaining data-img="ID" on non-img elements → background-image
  html = html.replace(/\bdata-img\s*=\s*"([^"]+)"/gi, (whole, id: string) => {
    const uri = images.placeholders.get(id)
    if (!uri) return whole
    return `${whole} style="background-image:url('${uri}');background-size:cover;background-position:center"`
  })

  return html
}

export function renderSlides(
  data: Slides,
  theme: Theme,
  images?: DeckImages,
  audio?: DeckAudio,
  opts?: { subtitles?: boolean },
): string {
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

  const audioScript = buildAudioScript(audio, opts)
  return renderDeck({ title: data.title, css: theme.css, slides: sections, audioScript })
}

/**
 * Construye el <script> con window.__DECK_AUDIO__ y window.__DECK_OPTS__.
 * Devuelve undefined cuando no hay audio → deck sin motor de voz.
 *
 * Escapa `</` → `<\/` para evitar que cadenas en el JSON cierren el <script>.
 */
function buildAudioScript(
  audio: DeckAudio | undefined,
  opts?: { subtitles?: boolean },
): string | undefined {
  if (!audio) return undefined

  const audioData = audio.map((a) =>
    a === null ? null : { src: `data:${a.mime};base64,${a.audioBase64}`, cues: a.cues },
  )

  // Escapar </ para que el parser HTML no cierre el <script> prematuramente.
  const audioJson = JSON.stringify(audioData).replace(/<\//g, '<\\/')
  const optsJson = JSON.stringify({ subtitles: opts?.subtitles !== false })

  return `<script>window.__DECK_AUDIO__=${audioJson};window.__DECK_OPTS__=${optsJson};</script>`
}
