import type { Slides } from '../config/schema.js'
import type { Theme } from '../config/theme-schema.js'
import { renderDeck, renderSlideStandalone } from '../templates/deck.js'
import type { DeckAudio } from './tts.js'
import type { SlideVideo } from './heygen.js'

type Slide = Slides['slides'][number]

export interface DeckImages {
  /** id de imagen placeholder ("h1", "v2"…) → data URI. */
  placeholders: Map<string, string>
  /** Avatar-tutor como data URI (subido por el usuario o retrato de Unsplash). */
  avatar?: string
  /**
   * Presente solo si el avatar es un retrato de Unsplash (no subido): la búsqueda y
   * la foto concretas, para que el editor visual pueda regenerarlo y para acreditar
   * al fotógrafo.
   */
  avatarPhoto?: { query: string; id: string; photographer: string }
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
 *    Sin avatar → quita el <img> para no mostrar icono roto. Si se pasa `introVideo`,
 *    sustituye el `<img>` por un `<video data-avatar-video>` con el mp4 embebido (el
 *    avatar habla con lip-sync en vez de mostrar la foto fija).
 *
 * 2. `<img data-img="ID" …>` → inyecta `src` con el data URI del placeholder.
 *    (Patrón preferido: `.imgbox > <img data-img="ID">`)
 *
 * 3. `data-img="ID"` en elementos NON-img (ej: `.media`) → inyecta
 *    `style="background-image:url(…)"` para mostrar la imagen como fondo.
 *    Id desconocido → deja el degradado de fallback (nunca se rompe).
 */
function fillSlots(html: string, images: DeckImages, introVideo?: SlideVideo | null): string {
  // Retrato de Unsplash: se anota la búsqueda y la foto en el <img> del avatar para
  // que el editor visual ofrezca "Regenerar foto" (data-img-query) trayendo una cara
  // distinta (data-img-id se excluye), con orientación fija portrait. Son atributos
  // inertes para fillSlots (sus regex exigen `data-img=`). title acredita al autor
  // sin pisar el alt que pone el generador.
  const avatarMeta = images.avatarPhoto
    ? ` data-img-query="${escapeAttr(images.avatarPhoto.query)}"` +
      ` data-img-id="${escapeAttr(images.avatarPhoto.id)}" data-img-orient="portrait"` +
      ` title="${escapeAttr(`Foto de ${images.avatarPhoto.photographer} en Unsplash`)}"`
    : ''

  // 1. Avatar: <img … data-avatar …>
  html = html.replace(/<img\b([^>]*)\bdata-avatar\b([^>]*)>/gi, (_match, before, after) => {
    if (introVideo) {
      return (
        `<video data-avatar-video preload="auto" playsinline` +
        `${images.avatar ? ` poster="${images.avatar}"` : ''}` +
        ` src="data:${introVideo.mime};base64,${introVideo.videoBase64}"></video>`
      )
    }
    if (!images.avatar) return ''
    const attrs = before + after
    if (/\bsrc\s*=\s*"/i.test(attrs)) {
      return `<img${before}${after}${avatarMeta}>`.replace(
        /\bsrc\s*=\s*"[^"]*"/i,
        `src="${images.avatar}"`,
      )
    }
    return `<img${before} src="${images.avatar}"${after}${avatarMeta}>`
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

/**
 * Renderiza UNA sola slide como documento autónomo 1280×720 (sin player, audio ni
 * GSAP), con las imágenes ya bajadas por fillSlots. Se usa para capturarla en headless
 * y que Claude la revise visualmente. Reutiliza el mismo tema y las mismas clases que
 * el deck real, así que refleja fielmente su fondo y legibilidad.
 */
export function renderSingleSlide(slide: Slide, theme: Theme, images?: DeckImages): string {
  const imgs: DeckImages = images ?? { placeholders: new Map() }
  const body = fillSlots(slide.html, imgs)
  return renderSlideStandalone({ css: theme.css, slideClass: slide.slideClass, body })
}

export function renderSlides(
  data: Slides,
  theme: Theme,
  images?: DeckImages,
  audio?: DeckAudio,
  opts?: { subtitles?: boolean },
  introVideo?: SlideVideo | null,
): string {
  const imgs: DeckImages = images ?? { placeholders: new Map() }

  // El vídeo de avatar (si lo hay) va SOLO en la primera slide con el slot `data-avatar`
  // (la intro), por contrato del prompt. El resto (p.ej. el cierre) conserva la foto.
  const introIndex = introVideo ? data.slides.findIndex((s) => /\bdata-avatar\b/.test(s.html)) : -1

  const sections = data.slides
    .map((slide, i) => {
      const cls = `slide${slide.slideClass ? ` ${escapeAttr(slide.slideClass)}` : ''}`
      const body = fillSlots(slide.html, imgs, i === introIndex ? introVideo : undefined)
      const notes = slide.notes
        ? `\n      <aside class="notes">${escapeHtml(slide.notes)}</aside>`
        : ''
      // Spec de animación como DATOS en un atributo (nunca código). El intérprete de
      // deck.ts lo lee con getAttribute + JSON.parse. escapeAttr protege las comillas
      // del JSON dentro del atributo con comillas dobles.
      const anim =
        slide.anim && slide.anim.length
          ? ` data-anim="${escapeAttr(JSON.stringify(slide.anim))}"`
          : ''
      return `    <section class="${cls}"${anim}>\n${body}${notes}\n    </section>`
    })
    .join('\n')

  const audioScript = buildAudioScript(audio, opts, introIndex)
  return renderDeck({ title: data.title, css: theme.css, slides: sections, audioScript })
}

/**
 * Construye el <script> con window.__DECK_AUDIO__ y window.__DECK_OPTS__.
 * Devuelve undefined cuando no hay audio → deck sin motor de voz.
 *
 * `videoSlideIndex` (si ≥ 0): esa slide reproduce el audio DENTRO del `<video>` de su
 * avatar, así que su entrada de `__DECK_AUDIO__` lleva `src:null` (los `cues` sí se
 * conservan, para los subtítulos) — invariante: nunca doble audio en la misma slide.
 *
 * Escapa `</` → `<\/` para evitar que cadenas en el JSON cierren el <script>.
 */
function buildAudioScript(
  audio: DeckAudio | undefined,
  opts?: { subtitles?: boolean },
  videoSlideIndex = -1,
): string | undefined {
  if (!audio) return undefined

  const audioData = audio.map((a, i) => {
    if (a === null) return null
    if (i === videoSlideIndex) return { src: null, cues: a.cues }
    return { src: `data:${a.mime};base64,${a.audioBase64}`, cues: a.cues }
  })

  // Escapar </ para que el parser HTML no cierre el <script> prematuramente.
  const audioJson = JSON.stringify(audioData).replace(/<\//g, '<\\/')
  const optsJson = JSON.stringify({ subtitles: opts?.subtitles !== false })

  return `<script>window.__DECK_AUDIO__=${audioJson};window.__DECK_OPTS__=${optsJson};</script>`
}
