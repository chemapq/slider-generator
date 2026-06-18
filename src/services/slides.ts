import type { Slides } from '../config/schema.js'
import type { Theme } from '../config/theme-schema.js'
import { renderDeck } from '../templates/reveal.js'

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
 * Convierte el contenido (Slides) + un tema en un HTML reveal.js autocontenible.
 * El `html` de cada slide viene del modelo y se inserta tal cual (es HTML
 * intencional con las clases del tema); solo se escapan título, clase y notas.
 */
export function renderSlides(data: Slides, theme: Theme): string {
  const sections = data.slides
    .map((slide) => {
      const cls = slide.slideClass ? ` class="${escapeAttr(slide.slideClass)}"` : ''
      const notes = slide.notes
        ? `\n  <aside class="notes">${escapeHtml(slide.notes)}</aside>`
        : ''
      return `<section${cls}>\n${slide.html}${notes}\n</section>`
    })
    .join('\n\n')

  return renderDeck({ title: data.title, css: theme.css, slides: sections })
}
