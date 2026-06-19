import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { SlidesSchema, type Slides } from '../config/schema.js'
import type { Theme } from '../config/theme-schema.js'
import type { ReferenceImageBlock } from './references.js'

const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 64000

const client = new Anthropic()

/** Una imagen placeholder disponible para repartir por las slides. */
export interface ImageManifestEntry {
  id: string // "h1", "v2", … (el prefijo indica orientación)
  orientation: 'h' | 'v'
}

export interface GenerateOptions {
  pdfBase64: string
  theme: Theme
  /** Imágenes placeholder disponibles (vacío si no se subió ninguna). */
  imageManifest?: ImageManifestEntry[]
  /** Hay un avatar-tutor disponible para intro y conclusión. */
  hasAvatar?: boolean
  /** Imágenes de referencia de estilo adjuntas para reforzar ESTA generación. */
  referenceImages?: ReferenceImageBlock[]
}

/**
 * Vocabulario de componentes COMPARTIDO. El tema solo cambia su aspecto (CSS);
 * el contenido las usa siempre igual. Los slots data-img / data-avatar los
 * rellena el renderer después (no debe ponerse el src/imagen aquí).
 */
const COMPONENT_GUIDE = `
Cada slide es un <section>. Devuelve en "html" SOLO el HTML interno del <section>
(sin la etiqueta <section>). La clase del <section> va en "slideClass".

Componentes (usa SOLO estas clases):
- <h1>            título de slide o de sección (grande, color de marca).
- <h2>            título secundario / de divisor de sección.
- <h3>            título de tarjeta o subapartado.
- <p>             texto normal.
- .lead           párrafo destacado (intro/subtítulo, frase potente).
- .muted          texto secundario / pie / dato pequeño.
- .eyebrow        etiqueta corta en MAYÚSCULAS sobre un título.
- .split          rejilla de 2 columnas. Sus 2 hijos directos = las 2 columnas.
- .stack          columna vertical con separación entre elementos.
- .grid-cards     rejilla de tarjetas (2 columnas).
- .card           tarjeta (<h3> + <p>). Variantes: .card--purple, .card--dark.
- .media          marcador de imagen. Para insertar una imagen placeholder real,
                  añade data-img="<id>": <div class="media" data-img="h1"></div>.
                  Sin data-img queda un degradado. Variante .media--dark.
- .pill           CTA: <a class="pill" href="#">Texto →</a>.
- .tag            etiqueta/caja pequeña.
- .avatar         avatar-tutor circular: <img class="avatar" src="" alt="Tutor" data-avatar>.
                  Deja src="" — lo rellena el renderer. SOLO en intro y conclusión.

slideClass especiales:
- "title-slide"     portada / bienvenida (la primera slide).
- "section-divider" divisor de sección. Pon dentro <span class="section-num">01</span>
                    (número grande) + <h2> con el nombre de la sección.
- "outro"           conclusión / cierre (la última slide).
`.trim()

function buildImageRules(manifest: ImageManifestEntry[], hasAvatar: boolean): string {
  const lines: string[] = []

  if (manifest.length) {
    const h = manifest.filter((m) => m.orientation === 'h').map((m) => m.id)
    const v = manifest.filter((m) => m.orientation === 'v').map((m) => m.id)
    lines.push('Imágenes placeholder disponibles (repártelas por las slides con data-img="<id>"):')
    if (h.length) lines.push(`- Horizontales (anchas, para .media a lo ancho): ${h.join(', ')}.`)
    if (v.length) lines.push(`- Verticales (altas, para columnas/.media alto): ${v.join(', ')}.`)
    lines.push(
      'Respeta la orientación al asignarlas, no repitas la misma en exceso, y deja en ' +
        'degradado (.media sin data-img) las slides donde no encaje una foto.',
    )
  } else {
    lines.push('No hay imágenes placeholder: usa .media (degradado) para dar ritmo visual.')
  }

  if (hasAvatar) {
    lines.push(
      'Avatar-tutor disponible: inclúyelo con <img class="avatar" src="" alt="Tutor" data-avatar> ' +
        'SOLO en la slide de bienvenida (title-slide) y en la de conclusión (outro).',
    )
  } else {
    lines.push('No hay avatar-tutor: no uses la clase .avatar.')
  }

  return lines.join('\n')
}

function buildSystemPrompt(theme: Theme, manifest: ImageManifestEntry[], hasAvatar: boolean): string {
  const p = theme.palette
  return `Eres un diseñador de presentaciones corporativas. A partir de un PDF (un guion),
generas una presentación de slides clara, creativa y bien estructurada, en el MISMO IDIOMA del PDF.

Diseño: se aplicará el tema "${theme.label ?? theme.name}". No generes CSS; usa el vocabulario de
componentes de abajo. Paleta del tema (orientativa): fondo ${p.background}, texto ${p.text},
acento ${p.primary}. Aprovecha tarjetas, rejillas, splits con .media y botones .pill para que
luzca como el tema.

Estructura esperada (adáptala al contenido del PDF):
- Portada (title-slide) con <h1> y un .lead${hasAvatar ? ' y el avatar-tutor' : ''}.
- Bienvenida y/o agenda de los apartados.
- Un divisor (section-divider) antes de cada sección importante.
- Contenido distribuido en tarjetas/rejillas/splits; layouts VARIADOS y creativos, sin repetir
  siempre el mismo, pero manteniendo coherencia visual corporativa.
- Conclusión / cierre (outro)${hasAvatar ? ' con el avatar-tutor' : ''}.

Reglas de contenido:
- Extrae el texto LITERALMENTE del PDF; no inventes datos ni cifras.
- Texto conciso, apto para slide (frases cortas, no párrafos largos).
- Organiza comparativas, listas y características en tarjetas/rejillas.
- Notas del ponente opcionales en "notes".
- No incluyas la etiqueta <section>; solo el HTML interno en "html".

Reglas de imágenes:
${buildImageRules(manifest, hasAvatar)}

${COMPONENT_GUIDE}`
}

/**
 * Llama a Claude con el PDF + el manifiesto de imágenes (+ avatar / referencias)
 * y un tema, y devuelve el CONTENIDO de las slides validado (Slides). El estilo
 * y la sustitución de imágenes los aplica luego el renderer.
 */
export async function generateSlides(opts: GenerateOptions): Promise<Slides> {
  const { pdfBase64, theme, imageManifest = [], hasAvatar = false, referenceImages = [] } = opts

  const userContent: Anthropic.MessageParam['content'] = [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    },
  ]

  if (referenceImages.length) {
    userContent.push({
      type: 'text',
      text: `Estas ${referenceImages.length} imágenes son REFERENCIAS DE ESTILO (no contenido):
imita su paleta, tipografía y estética. No copies su texto.`,
    })
    userContent.push(...referenceImages)
  }

  userContent.push({
    type: 'text',
    text: 'Genera las slides de esta presentación a partir del PDF, siguiendo las reglas.',
  })

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(theme, imageManifest, hasAvatar),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
    output_config: {
      effort: 'high',
      format: zodOutputFormat(SlidesSchema),
    },
  })

  const final = await stream.finalMessage()

  if (final.stop_reason === 'refusal') {
    throw new Error('Claude rechazó la petición (stop_reason: refusal).')
  }
  if (final.stop_reason === 'max_tokens') {
    throw new Error('Respuesta truncada (max_tokens). Sube MAX_TOKENS o reduce el PDF.')
  }
  if (!final.parsed_output) {
    throw new Error('No se obtuvo salida estructurada válida de Claude.')
  }

  return final.parsed_output
}
