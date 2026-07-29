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
/**
 * Catálogo de efectos de entrada PERMITIDOS (allowlist). El deck solo sabe interpretar
 * estos nombres; cualquier otro valor se ignora en runtime. El LLM NO escribe código:
 * emite un `anim` (datos) que el intérprete de confianza de deck.ts traduce a llamadas
 * GSAP con parámetros validados. Esta enum es el límite de seguridad.
 *
 *   fadeIn/Up/Down/Left/Right  aparición con desplazamiento suave
 *   zoomIn                     entra ligeramente escalando
 *   pop                        aparece con rebote (ideal para chips/badges/iconos)
 *   blurIn                     entra desenfocado y enfoca
 *   drawLine                   traza un <path>/línea SVG (dibujado progresivo)
 */
export const ANIM_EFFECTS = [
  'fadeIn',
  'fadeUp',
  'fadeDown',
  'fadeLeft',
  'fadeRight',
  'zoomIn',
  'pop',
  'blurIn',
  'drawLine',
] as const

/** Un paso de la coreografía de entrada del slide. */
const AnimStep = z.object({
  // Selector CSS resuelto DENTRO del <section> del slide (querySelectorAll).
  // Ej: ".title", "h1", ".card", ".card .ico". Selector inválido → el paso se salta.
  target: z.string(),
  // Efecto del catálogo permitido (ANIM_EFFECTS).
  effect: z.enum(ANIM_EFFECTS),
  // Retardo antes de empezar, en segundos. Clamp en runtime a [0, 6]. Por defecto 0.
  delay: z.number().optional(),
  // Duración en segundos. Clamp en runtime a [0.1, 4]. Por defecto 0.6.
  duration: z.number().optional(),
  // Escalonado entre los elementos que casan `target`, en segundos. Clamp [0, 1]. Por defecto 0.08.
  stagger: z.number().optional(),
})

const Slide = z.object({
  // Clase especial del <section>. Ver valores canónicos arriba.
  slideClass: z.string().optional(),
  // HTML interno del <section>. Puede incluir style="…" inline e iconos SVG.
  // Los slots data-img / data-avatar los rellena el renderer (renderSlides).
  html: z.string(),
  // Coreografía de ENTRADA del contenido (se re-dispara cada vez que el slide se activa).
  // Opcional: sin `anim`, el deck cae a la cascada genérica de siempre. El movimiento
  // ENTRE slides (push horizontal) lo gobierna el deck, no el LLM.
  anim: z.array(AnimStep).optional(),
  notes: z.string().optional(),
  // Tramo del texto ÍNTEGRO y literal del PDF que corresponde a esta slide,
  // con limpieza ligera (sin nº de página / encabezados repetidos / cortes de palabra).
  //
  // Invariante: la concatenación en orden de todas las narrations = texto íntegro del PDF.
  // No se resume ni se inventa contenido; si un fragmento no encaja en una slide concreta,
  // se asigna a la slide de contenido más próxima en el orden del guion.
  //
  // Diferencia con `notes`: notes son para el presentador y NO se locutan; narration SÍ se
  // locuta y es texto plano (sin HTML ni Markdown). Puede omitirse en slides decorativas
  // (p. ej. section-divider sin texto propio), pero el texto que iría ahí NO se pierde:
  // se empuja a la slide de contenido más cercana.
  narration: z.string().optional(),
})

export const SlidesSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  slides: z.array(Slide),
})

export type Slides = z.infer<typeof SlidesSchema>
