import { z } from 'zod'

/**
 * Salida estructurada que devuelve Claude: el CONTENIDO de la presentación.
 * El estilo NO va aquí: lo aporta el tema (themes/*.json -> CSS). Claude genera
 * el HTML interno de cada slide usando el vocabulario de componentes del tema
 * (.split, .stack, .grid-cards, .card, .card--purple, .card--dark, .media,
 * .pill, .tag, .lead, .muted, .eyebrow, h1/h3...).
 */
const Slide = z.object({
  // Clase del <section> (p. ej. "title-slide" para la portada). Opcional.
  slideClass: z.string().optional(),
  // HTML interno del <section>, usando solo las clases del tema.
  html: z.string(),
  // Notas del ponente (opcional).
  notes: z.string().optional(),
})

export const SlidesSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  slides: z.array(Slide),
})

export type Slides = z.infer<typeof SlidesSchema>
