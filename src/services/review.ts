import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Slides } from '../config/schema.js'
import type { Theme } from '../config/theme-schema.js'
import { renderSingleSlide, type DeckImages } from './slides.js'
import { screenshotSlideHtml } from './render-image.js'

type Slide = Slides['slides'][number]

const MODEL = 'claude-opus-4-8'
const client = new Anthropic({ maxRetries: 4 })

export const SlideReviewSchema = z.object({
  // true = se ve bien; false = había problemas y van corregidos en fixedHtml.
  ok: z.boolean(),
  // Problemas detectados, una línea cada uno (vacío si ok).
  issues: z.array(z.string()),
  // HTML interno del <section> corregido (solo si ok=false).
  fixedHtml: z.string().optional(),
})
export type SlideReview = z.infer<typeof SlideReviewSchema>

export interface SlideReviewResult extends SlideReview {
  index: number
  /** true si hay fixedHtml distinto del original y debe aplicarse. */
  changed: boolean
  /** Captura (PNG base64) de la slide ANTES de revisar; útil para depurar/mostrar. */
  imageBase64: string
}

const SYSTEM = `Eres un revisor de calidad VISUAL de diapositivas 16:9 (1280×720). Recibes la IMAGEN
renderizada de una slide y su HTML fuente. Tu único trabajo es detectar problemas que impidan
LEER o VER bien la slide y proponer una corrección MÍNIMA.

Busca:
- Contraste/legibilidad: texto que casi no se lee sobre su fondo (oscuro sobre oscuro, claro sobre
  claro, texto sobre una imagen sin panel/overlay que lo respalde).
- Recorte/desbordamiento: contenido cortado por los bordes de 1280×720 o que se sale del área.
- Solapes: elementos montados unos sobre otros que estorban la lectura.
- Jerarquía o alineación claramente rotas.
- Imágenes teñidas: alguna imagen (<img>, .imgbox img, o .media con foto) que tenga POR ENCIMA una
  capa de color, un degradado o un panel semitransparente que la tiñe, apaga o recolorea. Las fotos
  deben verse limpias y con color fiel, sin nada encima. (Un hueco de imagen SIN foto que solo
  muestra un fondo de color de relleno cuenta como placeholder vacío: repórtalo, no inventes fotos.)

Reglas de la corrección:
- NO cambies el CONTENIDO textual: mismas palabras, cifras y orden. Solo ajustas estilo/estructura
  para que se lea y se vea bien.
- Preserva "slideClass", los slots de imagen (data-img="ID", data-img-query, data-avatar), el campo
  de animación y las clases de componentes del sistema. No incrustes imágenes ni las elimines.
- Si una imagen se ve teñida por un elemento DEL PROPIO HTML del slide (un div de overlay, un
  degradado o un panel de color colocado ENCIMA de la imagen), quítalo o hazlo transparente para
  que la foto se vea limpia. Preserva la imagen y su slot; quita solo la capa que la tiñe.
- Usa tokens del tema: sobre fondo oscuro usa var(--primary-300) o #fff para el texto; sobre fondo
  claro usa var(--ink). Evita colores hex arbitrarios (blanco/negro puntual sí).
- fixedHtml = SOLO el HTML interno del <section> (sin la etiqueta <section>), en el mismo formato
  que recibes.

Si la slide se ve bien: ok=true, issues=[] y SIN fixedHtml. Si hay problemas: ok=false, issues con
una línea por problema, y fixedHtml con el HTML corregido.`

/**
 * Revisa UNA slide visualmente: la renderiza a imagen, se la muestra a Claude junto al
 * HTML fuente y devuelve los problemas detectados + el HTML corregido (si procede).
 * Es una llamada a Claude con visión POR slide.
 */
export async function reviewSlide(
  slide: Slide,
  theme: Theme,
  images: DeckImages | undefined,
  index: number,
): Promise<SlideReviewResult> {
  const imageBase64 = await screenshotSlideHtml(renderSingleSlide(slide, theme, images))

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          {
            type: 'text',
            text: `slideClass: "${slide.slideClass ?? ''}"\n\nHTML fuente (interno del <section>):\n\n${slide.html}\n\nRevisa la imagen y responde según las reglas.`,
          },
        ],
      },
    ],
    output_config: {
      effort: 'high',
      format: zodOutputFormat(SlideReviewSchema),
    },
  })

  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') {
    throw new Error(`Revisión de la slide ${index} rechazada (stop_reason: refusal).`)
  }
  if (!final.parsed_output) {
    throw new Error(`La revisión de la slide ${index} no devolvió salida estructurada.`)
  }

  const parsed = final.parsed_output
  const changed =
    !parsed.ok && typeof parsed.fixedHtml === 'string' && parsed.fixedHtml.trim() !== slide.html.trim()

  return { ...parsed, index, changed, imageBase64 }
}

export interface DeckReviewResult {
  reviewed: number
  changed: number
  failed: number
  issues: Array<{ index: number; issues: string[] }>
}

/**
 * Revisión visual de TODO el deck (2ª llamada por slide). Renderiza cada slide, se la
 * muestra a Claude y aplica la corrección de contraste/legibilidad EN SITIO (muta
 * slide.html) cuando procede. Corre en paralelo con un tope de concurrencia. Nunca lanza:
 * el fallo de una slide se aísla y esa slide se deja sin corregir.
 *
 * Coste: una llamada a Claude con visión POR slide, más una captura headless por slide.
 */
export async function reviewDeck(
  slides: Slide[],
  theme: Theme,
  images: DeckImages | undefined,
  opts: { concurrency?: number } = {},
): Promise<DeckReviewResult> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, slides.length || 1))
  const result: DeckReviewResult = { reviewed: 0, changed: 0, failed: 0, issues: [] }
  let next = 0

  async function worker(): Promise<void> {
    for (let i = next++; i < slides.length; i = next++) {
      const slide = slides[i]!
      try {
        const r = await reviewSlide(slide, theme, images, i)
        result.reviewed += 1
        if (r.changed && r.fixedHtml) {
          slide.html = r.fixedHtml
          result.changed += 1
        }
        if (r.issues.length) result.issues.push({ index: i, issues: r.issues })
      } catch (err) {
        result.failed += 1
        console.warn(`[review] slide ${i} falló:`, err instanceof Error ? err.message : String(err))
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return result
}
