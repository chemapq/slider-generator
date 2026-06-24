import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { ThemeSchema, type Theme } from '../config/theme-schema.js'
import type { ReferenceImageBlock } from './references.js'

const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 20000

const SYSTEM = `Eres un experto en diseño de presentaciones corporativas. A partir de imágenes de slides de referencia, extraes el sistema de diseño con MÁXIMA FIDELIDAD y lo conviertes en un tema JSON + CSS para un deck HTML propio (NO reveal.js). El CSS usa selectores sobre .slide (p. ej. ".slide h1 { ... }"), nunca ".reveal". Reproduces exactamente la paleta, las tipografías, los radios, las sombras y los espaciados que observas en las imágenes.`

function buildUserText(count: number): string {
  return `Analiza estas ${count} imágenes de slides de referencia y extrae el tema COMPLETO.

Tu CSS lo aplicará un deck cuyo HTML usa el siguiente vocabulario de componentes. Debes estilizar TODOS estos selectores:

VARIABLES DE TOKENS (en :root):
--primary, --primary-600, --primary-300, --primary-100, --primary-soft
--ink, --ink-soft, --muted, --muted-2
--card, --card-2, --black, --bg
--grad (degradado principal), --grad-soft (degradado suave)
--blob (color de los blobs decorativos: glow de marca semitransparente)
--shadow-sm, --shadow, --shadow-lg
--radius (redondeo grande), --radius-sm (redondeo medio)
--avatar-ring (color del anillo del tutor)

CHROME DEL DECK (NO toques estos; los gestiona templates/deck.ts):
- body, html, #stage, .slide (posición/opacidad/transform), #progress, #nav, #dots, .hint

SLIDE BASE:
- .slide → solo background: var(--bg). NO display/flex/position/opacity/transform: los gestiona el deck.
- .pad → padding 64px 72px
- .col → display flex column

TIPOGRAFÍA (observa bien tamaños y pesos de las imágenes):
- h1 → titular principal (font-weight 900, letter-spacing ajustado, line-height)
- h2 → titular secundario (font-weight 800)
- h3 → titular de tarjeta (font-weight 800)
- p → texto cuerpo (color var(--muted), line-height 1.55)
- .lead → párrafo destacado (~18px, font-weight 500, color var(--ink-soft))
- b, strong → texto enfatizado (color var(--ink), font-weight 700)
- .vio → span en color de marca: color var(--primary)
- .kicker / .eyebrow → etiqueta MAYÚSCULAS con tracking (13px, 700, uppercase, var(--muted-2))
- .stat → cifra grande (font-weight 900, color var(--ink))

BRANDBAR:
- .brandbar → barra absolute top:30px left/right:72px, flex space-between, z-index:5
- .brand → flex, gap, font-weight 800, font-size 16px, color var(--ink)
- .brand .dot → caja 26×26px redondeada con background var(--grad)
- .brand .dot::after → punto interno blanco (inset:7px, border-radius:50%, opacity .92)
- .brand.light y .brand.light .num → color: #fff
- .num → font-size 13px, font-weight 700, color var(--muted-2)

TAGS / BOTONES:
- .tag → pastilla con padding, border-radius:999px, background var(--primary-soft), color var(--primary-600), border 1px, font-size 13px, font-weight 700, width:max-content
- .tag .pip → punto pequeño circular de color var(--primary) dentro del .tag
- .btn → CTA negro (background var(--black), border-radius:999px, padding, flex, gap, font-weight 700)
- .btn .circ → círculo blanco 34×34px con SVG de icono dentro

TARJETAS (observa bien: esquinas MUY redondeadas, sombras suaves):
- .card → background var(--card), border-radius var(--radius), padding, position:relative, overflow:hidden
- .card.dark → background var(--black), color #fff; hijos h3/p en blanco
- .card.violet → background var(--grad), color #fff; hijos h3/p en blanco
- .card .ico → caja 46×46px border-radius 13px, background #fff, flex center, margin-bottom, box-shadow
- .card.dark .ico, .card.violet .ico → background rgba(255,255,255,.14), box-shadow none
- .card .ico svg → width/height 23×23px
- .card .num-badge → número absolute top-right, ~46px, font-weight 900, color rgba(primary,.12)
- .card.dark .num-badge → color rgba(255,255,255,.10)
- .card.violet .num-badge → color rgba(255,255,255,.16)

IMÁGENES:
- .imgbox → border-radius var(--radius), overflow hidden, background var(--grad-soft), position relative
- .imgbox img → width/height 100%, object-fit cover, display block
- .ph-badge → badge absoluto bottom-left con texto "Imagen · placeholder", fondo oscuro semitransparente, blur
- .media → fallback: border-radius var(--radius), background var(--grad-soft), min-height 320px, flex 1
- .media.dark → variante con degradado oscuro

AVATAR-TUTOR (incluye los keyframes de animación):
- .tutor → position relative, flex none
- .tutor .ring → absolute inset:-14px, border-radius 50%, borde 2px solid var(--primary-300), opacity .55, animation: pulse 2.6s ease-out infinite
- .tutor .ring.r2 → animation-delay: 1.3s
- @keyframes pulse → de scale(.92) con opacity .6 hasta scale(1.18) con opacity 0
- .tutor .photo → border-radius 50%, overflow hidden, background var(--grad), box-shadow var(--shadow-lg), position relative, z-index 2
- .tutor .photo img → object-fit cover, object-position 50% 18%
- .tutor .live → badge absolute bottom-center (z-index 3), background var(--black), color #fff, border-radius 999px, flex, gap, box-shadow
- .tutor .live .blink → punto verde #4ADE80, animation: blink 1.4s infinite
- @keyframes blink → entre opacity 1 y .25

DECORACIÓN:
- .blob → position absolute, border-radius 50%, filter blur(2px), z-index 0

SLIDECLASS ESPECIALES (solo cambios de fondo + texto; los demás estilos son del contenido):
- .slide.section-divider → background var(--black)
- .slide.closing → background var(--grad)

NO GENERES estilos para: el chrome (body/#stage/fixed overlays), tamaño/anillo del avatar, .section-num gigante (los gestiona el deck).

Los @import de Google Fonts van al INICIO del CSS. Rellena también "palette", "typography" (headingFont, bodyFont, fontLinks) y "avatarRing" dentro de "palette".`
}

/** Datos de identidad del tema que NO se derivan de las imágenes. */
export interface ThemeBase {
  name: string
  label?: string
  description?: string
  source?: string[]
}

/**
 * Envía las imágenes de referencia a Claude y deriva un tema COMPLETO
 * (paleta + tipografía + CSS) con el vocabulario de componentes del deck.
 * Devuelve un tema validado, mezclando la identidad (`base`) con lo derivado.
 */
export async function deriveThemeFromImages(
  refImages: ReferenceImageBlock[],
  base: ThemeBase,
): Promise<Theme> {
  if (!refImages.length) {
    throw new Error('Se necesitan imágenes de referencia para derivar un tema.')
  }

  // maxRetries elevado: reintenta 429/5xx/overloaded transitorios con backoff.
  const client = new Anthropic({ maxRetries: 5 })

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [...refImages, { type: 'text', text: buildUserText(refImages.length) }],
      },
    ],
    output_config: {
      format: zodOutputFormat(ThemeSchema),
    },
  })

  const final = await stream.finalMessage()

  if (final.stop_reason === 'refusal') throw new Error('Claude rechazó la petición.')
  if (final.stop_reason === 'max_tokens') throw new Error('Respuesta truncada (max_tokens).')
  if (!final.parsed_output) throw new Error('No se obtuvo un tema válido de Claude.')

  const generated = final.parsed_output as Theme

  return ThemeSchema.parse({
    ...base,
    palette: generated.palette,
    typography: generated.typography,
    css: generated.css,
  })
}

/**
 * Devuelve los selectores del vocabulario del deck que el CSS generado NO menciona.
 * Vacío = el CSS cubre todos los componentes.
 */
export function findMissingSelectors(css: string): string[] {
  const required = [
    '.brandbar', '.kicker', '.num',
    '.tag', '.pip', '.btn', '.circ',
    '.card', '.card.dark', '.card.violet', '.ico', '.num-badge',
    '.imgbox', '.ph-badge', '.media',
    '.tutor', '.ring', '.live', '.blink',
    'pulse', 'blink',
    '.blob', '.stat',
    'section-divider', 'closing',
  ]
  return required.filter((sel) => !css.includes(sel))
}
