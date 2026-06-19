import { z } from 'zod'

/**
 * Salida estructurada que devuelve Claude: el CONTENIDO de la presentación.
 * El estilo lo aporta el tema (themes/*.json → css). El renderer sustituye los
 * slots de imagen/avatar DESPUÉS de recibir la respuesta de Claude.
 *
 * Vocabulario de componentes (clases usables en `html`):
 *   h1, h3            — titulares de slide / tarjeta
 *   .lead             — subtítulo destacado
 *   .muted            — texto secundario / pie
 *   .eyebrow          — etiqueta corta en mayúsculas sobre un título
 *   .split            — rejilla 2 columnas (hijos directos = las 2 columnas)
 *   .stack            — columna vertical con separación entre elementos
 *   .grid-cards       — rejilla de tarjetas (2 col)
 *   .card             — tarjeta; variantes: .card--purple, .card--dark
 *   .media            — marcador de imagen (degradado fallback). Añadir data-img="<id>"
 *                       para que el renderer inyecte la imagen placeholder (p. ej.
 *                       data-img="h1" para la primera horizontal, "v2" para la 2ª vertical).
 *                       Variante: .media--dark (degradado oscuro).
 *   .avatar           — foto del tutor circular con anillo "en directo". Usar con
 *                       data-avatar (sin valor). Solo en slides con slideClass "title-slide"
 *                       o "outro".
 *   .pill             — botón CTA: <a class="pill" href="#">Texto →</a>
 *   .tag              — etiqueta pequeña inline
 *
 * Valores de slideClass especiales:
 *   "title-slide"     — portada (primera slide, avatar si hay)
 *   "section-divider" — divisor de sección con número grande
 *   "outro"           — conclusión/cierre (avatar si hay)
 */
const Slide = z.object({
  // "title-slide" | "section-divider" | "outro" | string libre | undefined
  slideClass: z.string().optional(),
  // HTML interno del <section> usando el vocabulario de arriba. Los slots
  // data-img / data-avatar los rellena el renderer (renderSlides), no Claude.
  html: z.string(),
  notes: z.string().optional(),
})

export const SlidesSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  slides: z.array(Slide),
})

export type Slides = z.infer<typeof SlidesSchema>
