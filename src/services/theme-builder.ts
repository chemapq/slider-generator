import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { ThemeSchema, type Theme } from '../config/theme-schema.js'
import type { ReferenceImageBlock } from './references.js'
import { sanitizeMotionSvg } from './sanitize-svg.js'

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

Los @import de Google Fonts van al INICIO del CSS. Rellena también "palette", "typography" (headingFont, bodyFont, fontLinks) y "avatarRing" dentro de "palette".

${MOTION_PROMPT}`
}

/**
 * Sección del prompt para la FIRMA DE MOVIMIENTO (campo `motion`). Va aparte porque es la
 * única parte del prompt cuya salida pasa por un sanitizador: lo que Claude escriba en
 * `motion.svg` se filtra con `sanitizeMotionSvg` (allowlist) antes de tocar el HTML, así que
 * aquí se le cuentan las reglas para que su SVG no muera en el filtro.
 */
const MOTION_PROMPT = `── FIRMA DE MOVIMIENTO (campo "motion") ──

El deck monta una capa decorativa POR ENCIMA de las slides (#mo) que se mueve sola de forma
sutil y reacciona a cada cambio de slide, más una cortina de transición (#mo-tx). Elige la
firma que corresponda a las referencias:

OPCIÓN A — un preset del catálogo (elígela SIEMPRE que no tengas una idea visual clara):
  "motion": { "overlay": "grid", "transition": "sweep", "slideTransition": "push", "intensity": 0.45 }
  overlay: none | frame | grid | aurora | constellation | arcs | wave
    frame  2 filetes + brackets de esquina + destellos (neutro, encaja con todo)
    grid   rejilla técnica de 80×80 + línea de escaneo   → suizo, corporativo, datos
    aurora 3 cintas anchas desenfocadas en "screen"      → SOLO fondos oscuros
    constellation  nodos y enlaces finos                 → tecnología, IA
    arcs   arcos concéntricos girando muy lento          → editorial, elegante
    wave   ondas en el borde inferior                    → cálido, amable
  transition (cortina): none | sweep | wipe | iris | stripes
  slideTransition: push (lateral) | fade | scale | rise (vertical)
  intensity: 0..1   speed: 0.5..2   flow: true|false (orbes de glow persistentes)

OPCIÓN B — firma propia en "motion.svg" (solo si las referencias piden un gesto concreto que
el catálogo no da). Reglas OBLIGATORIAS; si no las cumples, el SVG se descarta entero y el
tema cae al preset por defecto:
  · Un único <svg viewBox="0 0 1280 720"> (el escenario es siempre 1280×720).
  · Etiquetas permitidas: svg g defs path circle ellipse rect line polyline polygon pattern
    linearGradient radialGradient stop mask clipPath symbol use filter feGaussianBlur feOffset
    feBlend feColorMatrix feFlood feComposite feMerge feMergeNode. NADA MÁS.
    PROHIBIDOS: script style foreignObject image text animate animateTransform set a iframe,
    todo atributo on*, todo atributo style, xlink:href y cualquier href que no sea "#…".
  · Máximo 16 KB y 60 nodos.
  · Todo id y toda class con prefijo "mo-" (las clases sin prefijo se descartan).
  · COLOR por token, nunca hex: usa "currentColor" (el deck pone
    color: var(--primary-300) en #mo) o var(--primary), var(--grad)… así la firma encaja
    con la paleta.
  · Marca los nodos con el VOCABULARIO para que el deck sepa animarlos en cada cambio de
    slide: .mo-travel (VIAJE, ver abajo) · .mo-draw (re-trazado de líneas/arcos) ·
    .mo-pop (puntos y destellos) · .mo-shift (cintas, bandas, ondas) · .mo-spin (arcos y
    anillos) · .mo-fade (rejillas y tramas) · .mo-scan (línea de escaneo que cruza).
  · .mo-travel es la marca PRINCIPAL y la que hace que la firma acompañe al deck. Las otras
    son reacciones: se disparan al cambiar de slide y devuelven la pieza a su sitio, así que
    con solo esas la capa da un respingo y se queda quieta. .mo-travel da a un grupo una
    posición por índice de slide (determinista y reversible), o sea que en la slide 6 la
    composición está en otro sitio que en la 1 y el recorrido es lo que se ve.
    Se pone en <g> ENVOLTORIOS, dos o tres por firma, cada uno con su cúmulo de piezas
    dentro. Como escribe transform, el MISMO nodo no puede llevar además .mo-shift o
    .mo-spin ni un @keyframes que anime transform (pónselos a los hijos).
  · CUÁNTOS nodos: entre 6 y 12 piezas pintadas, repartidas en 2-3 grupos .mo-travel más
    algún detalle suelto. MENOS es mejor: lo que da vida es el recorrido, no la cantidad.
    Con la composición cargada el viaje se lee como un desfile y estorba; con media docena
    de piezas, como una deriva. (Hubo versiones de 25-30 nodos y el problema era ese.)
  · El viaje desplaza hasta 38 px en x y 17 px en y, así que deja ese margen: ninguna pieza
    de trazo nítido puede acabar dentro de la caja de contenido SUMÁNDOLE su viaje.
  · TAMAÑO: lo que hace visible la decoración es la superficie que pinta, no el contraste. Un
    punto de 3 px suelto puede tener contraste de sobra y seguir siendo invisible porque ocupa
    una millonésima de la pantalla. Usa formas de 60-300 px (arcos, anillos, galones, ondas).
  · GROSOR, con techo: 2,5-6 px en el trazo protagonista, 1-2 px en los detalles. NUNCA por
    encima de 6. La presencia se consigue con CANTIDAD y FINURA —muchas piezas finas bien
    colocadas—, no con masa: una línea de 1,5 px repetida se lee como oficio, una barra de
    20 px se lee como un manchón o un error de render.
  · DÓNDE: la caja de contenido de una slide es x 72-1208, y 64-656 (.pad es 64px 72px), y la
    .brandbar ocupa toda la franja superior (top:30px, left/right:72px) con z-index 5, o sea
    POR ENCIMA de la capa: lo que pongas ahí queda detrás del logo y se lee como suciedad
    alrededor de la marca. Pon las piezas con presencia en los bordes izquierdo (x ≤ 68) y
    derecho (x ≥ 1212), en la banda inferior (y ≥ 660) y en las esquinas, con los centros de
    los anillos FUERA del lienzo (p. ej. cx="1306" cy="-36" r="176") para que se vean grandes
    sin invadir el texto.
  · El deck ya monta en esas bandas un kit de decoración con 10 composiciones posibles (marcas
    de imprenta, órbitas, filetes editoriales, cotas técnicas, palas de diafragma, escalonados,
    curvas orgánicas, trazas de circuito, galones, tramas de puntos), y sortea una por deck. Tu
    SVG aporta el gesto CENTRAL del tema —lo que lo distingue—, no hace falta que repitas piezas
    de esquina, y NO declares "decor": déjalo sortear o todos los decks del tema se parecerán.
  · NUNCA uses <rect> con borde alineado a los ejes como pieza decorativa. Un cuadrado con
    borde es el glifo de placeholder (imagen rota, casilla vacía) y varios apilados a
    intervalos iguales se leen como casillas, no como diseño. Si quieres un marcador, gíralo
    45° (un <polygon> en rombo) o usa una cruz de registro, un arco o una marca de regla.
  · El MOVIMIENTO AMBIENTE (deriva, respiración, rotación lenta) se escribe en el CSS del
    tema con selectores "#mo .mo-…" y @keyframes propios, usando las variables --mo-i
    (intensidad) y --mo-speed: p. ej.
      #mo .mo-ribbon { opacity: calc(var(--mo-i, .6) * .18); }
      #mo .mo-drift  { animation: mo-drift calc(22s * var(--mo-speed, 1)) ease-in-out infinite alternate; }
    IMPORTANTE: una animación CSS gana a los estilos inline, así que NO animes por CSS la
    misma propiedad (transform u opacity) del mismo nodo que lleva una clase mo-*: pon el
    ambiente en un <g> envoltorio y la marca mo-* en el nodo de dentro.

REGLAS DE INTENSIDAD (las dos opciones):
  · Fondo CLARO (palette.background claro): intensity ≤ 0.5 y NUNCA mix-blend-mode: screen
    — sobre blanco los glows se ven sucios en vez de luminosos.
  · La capa no puede competir con el contenido, pero el tope depende del TIPO de tinta:
    rellenos de ÁREA (cintas, ondas, velos, tramas) ≤ 0.18 de opacidad efectiva, porque
    cubren media pantalla y se leerían como un tinte sobre la foto. Los trazos de 1-1.5 px y
    los puntos de 2-3 px pueden llegar a 0.45: cubren poquísima superficie, no ensucian nada
    y son justo lo que hace visible la reacción al cambiar de slide.`

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
    // La firma de movimiento se sanea AQUÍ, al derivar, y no solo al cargar el tema: así el
    // JSON queda guardado ya limpio y los warnings se ven en el momento de crearlo.
    ...(generated.motion ? { motion: sanitizeDerivedMotion(generated.motion, base.name) } : {}),
  })
}

/**
 * Pasa por el sanitizador el SVG que haya escrito Claude. Fail-closed: si no sobrevive, se
 * borra `svg` y el tema cae a su `overlay` (o al preset por defecto), con el aviso en consola
 * — el que ejecuta el builder tiene que ver que su firma no ha pasado el filtro.
 */
function sanitizeDerivedMotion(
  motion: NonNullable<Theme['motion']>,
  themeName: string,
): NonNullable<Theme['motion']> {
  if (!motion.svg) return motion
  const { svg, warnings } = sanitizeMotionSvg(motion.svg)
  for (const w of warnings) console.warn(`⚠ [motion] ${themeName}: ${w}`)
  if (!svg) {
    console.warn(`⚠ [motion] ${themeName}: la firma propia se descarta; se usará un preset.`)
    const { svg: _dropped, ...rest } = motion
    return rest
  }
  return { ...motion, svg }
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
