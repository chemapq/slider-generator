import { z } from 'zod'

/**
 * Salida estructurada que devuelve Claude: el CONTENIDO de la presentación.
 * El estilo lo aporta el tema (themes/*.json → css). El renderer sustituye los
 * slots de imagen/avatar DESPUÉS de recibir la respuesta de Claude.
 *
 * ── TOKENS disponibles en cada tema (usar siempre var(…), nunca hex hardcodeado) ──
 *   --primary        acento de marca
 *   --primary-600    variante más oscura
 *   --primary-300    variante más clara (texto sobre fondo oscuro)
 *   --primary-soft   fondo muy suave (columnas intro/outro)
 *   --ink            texto principal
 *   --ink-soft       texto destacado
 *   --muted          texto secundario
 *   --muted-2        etiquetas tenues
 *   --card           fondo tarjeta clara
 *   --black          fondo/tarjeta oscura
 *   --bg             fondo de slide blanco
 *   --grad           degradado de marca
 *   --grad-soft      degradado suave
 *   --shadow-sm / --shadow / --shadow-lg   sombras
 *   --radius (26px) / --radius-sm (16px)   redondeos
 *
 * ── COMPONENTES (clases disponibles en el HTML de cada slide) ──
 *   Utilidades:
 *     .pad            → padding 64px 72px
 *     .col            → flex column
 *   Tipografía:
 *     h1 h2 h3 p .lead b/strong .vio .kicker/.eyebrow .stat
 *   Marca/cabecera:
 *     .brandbar .brand .brand.light .num
 *   Chips/botones:
 *     .tag .pip  .btn .circ
 *   Tarjetas:
 *     .card  .card.dark  .card.violet  .card .ico  .card .num-badge
 *   Imágenes:
 *     .imgbox  .imgbox img[data-img]  .ph-badge  .media[data-img]
 *   Avatar-tutor (solo en intro/outro):
 *     .tutor  .tutor .ring  .tutor .ring.r2  .tutor .photo  .tutor .photo img[data-avatar]
 *     .tutor .live  .tutor .live .blink
 *   Decoración:
 *     .blob
 *
 * ── slideClass canónico ──
 *   "cover"           portada (sin brandbar)
 *   "intro"           bienvenida con .tutor (sin brandbar)
 *   ""  (vacío)       slide de contenido (con .brandbar)
 *   "section-divider" divisor (fondo negro; sin brandbar, o con .brand.light)
 *   "outro"           conclusión con .tutor
 *   "closing"         cierre final (fondo degradado; sin brandbar o con .brand.light)
 */
const Slide = z.object({
  // Clase especial del <section>. Ver valores canónicos arriba.
  slideClass: z.string().optional(),
  // HTML interno del <section>. Puede incluir style="…" inline e iconos SVG.
  // Los slots data-img / data-avatar los rellena el renderer (renderSlides).
  html: z.string(),
  notes: z.string().optional(),
})

export const SlidesSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  slides: z.array(Slide),
})

export type Slides = z.infer<typeof SlidesSchema>
