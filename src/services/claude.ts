import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { SlidesSchema, type Slides } from '../config/schema.js'
import type { Theme } from '../config/theme-schema.js'

const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 64000

const client = new Anthropic()

/**
 * Vocabulario de componentes COMPARTIDO por todos los temas. Los temas solo
 * cambian el aspecto (CSS) de estas clases; el contenido las usa siempre igual.
 */
const COMPONENT_GUIDE = `
Cada slide es un <section>. Devuelve en "html" SOLO el HTML interno del <section>
(sin la etiqueta <section>) y, si la portada lo necesita, indica la clase del
section en "slideClass" (p. ej. "title-slide").

Componentes disponibles (usa SOLO estas clases):
- <h1>            título de slide o de sección (grande, color de marca).
- <h3>            título de tarjeta o subapartado.
- <p>             texto normal.
- .lead           párrafo destacado (intro/subtítulo).
- .muted          texto secundario / pie / dato pequeño.
- .eyebrow        etiqueta corta en mayúsculas sobre un título.
- .split          rejilla de 2 columnas (p. ej. imagen+texto, o texto+tarjetas).
                  Sus hijos directos son las 2 columnas.
- .stack          columna vertical con separación entre elementos.
- .grid-cards     rejilla de tarjetas (2 columnas).
- .card           tarjeta (suele llevar <h3> + <p>). Variantes para resaltar:
                  .card--purple (acento) y .card--dark (oscura, texto claro).
- .media          marcador de imagen (degradado). Variante .media--dark.
                  Úsalo para dar ritmo visual: NO tenemos las imágenes del PDF.
- .pill           botón de llamada a la acción: <a class="pill" href="#">Texto →</a>.
- .tag            etiqueta pequeña.

Ejemplo de portada (slideClass "title-slide"):
<div class="split">
  <div class="media"></div>
  <div class="stack">
    <h1>Título</h1>
    <p class="lead">Subtítulo en una frase.</p>
    <span class="tag">Etiqueta opcional</span>
  </div>
</div>

Ejemplo de slide con tarjetas:
<div class="split">
  <div class="media"></div>
  <div class="grid-cards">
    <div class="card"><h3>Apartado</h3><p>Texto breve.</p></div>
    <div class="card card--purple"><h3>Destacado</h3><p>Texto breve.</p></div>
  </div>
</div>
`.trim()

function buildSystemPrompt(theme: Theme): string {
  const p = theme.palette
  return `Eres un diseñador de presentaciones. A partir de un PDF, generas una
presentación de slides clara y bien estructurada, en el MISMO IDIOMA del PDF.

Diseño: se aplicará el tema "${theme.label ?? theme.name}". No generes CSS; usa el
vocabulario de componentes de abajo. Para que el resultado luzca como el tema,
aprovecha tarjetas (.card, .card--purple, .card--dark), rejillas (.grid-cards),
splits con .media y botones .pill cuando aporten. Paleta del tema (orientativa):
fondo ${p.background}, texto ${p.text}, acento ${p.primary}.

Reglas de contenido:
- Deriva TODO el contenido del PDF; no inventes datos ni cifras.
- La primera slide es una portada (slideClass "title-slide") con <h1> y un .lead.
- Texto conciso, apto para slide (frases cortas, no párrafos largos).
- Organiza comparativas, listas y características en tarjetas/rejillas.
- Notas del ponente opcionales en "notes".
- No incluyas <section> ni <aside>; solo el HTML interno en "html".

${COMPONENT_GUIDE}`
}

/**
 * Llama a Claude con el PDF (base64) y un tema, y devuelve el contenido de las
 * slides validado (Slides). El estilo lo aplica luego el renderer con el CSS del tema.
 */
export async function generateSlides(pdfBase64: string, theme: Theme): Promise<Slides> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: buildSystemPrompt(theme), cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          { type: 'text', text: 'Genera las slides de esta presentación a partir del PDF.' },
        ],
      },
    ],
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
