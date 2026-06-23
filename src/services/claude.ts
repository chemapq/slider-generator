import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { SlidesSchema, type Slides } from '../config/schema.js'
import type { Theme } from '../config/theme-schema.js'
import type { ReferenceImageBlock } from './references.js'

const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 64000

// maxRetries por defecto del SDK es 2; lo subimos para aguantar mejor los
// 429/5xx/overloaded transitorios (reintenta con backoff exponencial + jitter).
const client = new Anthropic({ maxRetries: 5 })

export interface ImageManifestEntry {
  id: string
  orientation: 'h' | 'v'
}

export interface GenerateOptions {
  pdfBase64: string
  theme: Theme
  imageManifest?: ImageManifestEntry[]
  hasAvatar?: boolean
  referenceImages?: ReferenceImageBlock[]
}

function buildImageRules(
  manifest: ImageManifestEntry[],
  hasAvatar: boolean,
  freeMode: boolean,
): string {
  const lines: string[] = []

  if (manifest.length) {
    const h = manifest.filter((m) => m.orientation === 'h').map((m) => m.id)
    const v = manifest.filter((m) => m.orientation === 'v').map((m) => m.id)
    lines.push('Imágenes placeholder disponibles:')
    if (h.length) lines.push(`  Horizontales (anchas): ${h.join(', ')}`)
    if (v.length) lines.push(`  Verticales (altas, para columnas): ${v.join(', ')}`)
    if (freeMode) {
      lines.push(
        '  Para incrustar una, pon el atributo data-img="ID" en un <img> (el renderer le inyecta el src).',
        '  Maquétala como pidan las referencias. Respeta la orientación (horizontales anchas, verticales',
        '  en columnas estrechas). No repitas la misma img en exceso; deja slides sin imagen si no encaja.',
      )
    } else {
      lines.push(
        '  Úsalas en .imgbox > <img data-img="ID" alt="">. Respeta la orientación: horizontales en',
        '  columnas anchas, verticales en columnas estrechas. No repitas la misma img en exceso.',
        '  Deja slides sin imagen cuando no encaje (usa solo texto/tarjetas).',
      )
    }
  } else {
    lines.push('No hay imágenes placeholder: usa solo texto y tarjetas (sin imágenes).')
  }

  if (hasAvatar) {
    if (freeMode) {
      lines.push(
        'Avatar-tutor disponible: pon el atributo data-avatar en un <img> (el renderer le inyecta el src),',
        '  SOLO en la slide de bienvenida (intro) y la de cierre (outro). En ninguna otra. Estructúralo',
        '  como pidan las referencias (puedes usar el componente .tutor si encaja).',
      )
    } else {
      lines.push(
        'Avatar-tutor disponible: inclúyelo con la estructura .tutor (ver más abajo)',
        '  SOLO en las slides con slideClass "intro" y "outro". En ninguna otra.',
      )
    }
  } else {
    lines.push('No hay avatar-tutor: no uses la clase .tutor ni el atributo data-avatar en ninguna slide.')
  }

  return lines.join('\n')
}

// ── Sección de layout en modo ESTRICTO (sin referencias): recetas calcadas de la demo ──
const STRICT_LAYOUT = `## Estructura y slideClass canónicos

### 1. \`cover\` — Portada (sin brandbar)
Split ~47/53:
- Columna izquierda (47%): \`background:var(--grad)\`, imagen enmarcada en \`border:2px dashed rgba(255,255,255,.5); border-radius:34px\` con badges flotantes (\`position:absolute\`) + blobs.
- Columna derecha (53%): \`padding:0 80px\`, kicker, h1 (~50px), .lead, .btn + .tag, logo al pie (\`position:absolute;bottom:46px\`).

### 2. \`intro\` — Bienvenida con tutor (sin brandbar o con brandbar simple)
Split ~42/58:
- Columna izquierda (42%): \`background:var(--primary-soft)\`, .tutor (300px) centrado, label "Voz en off".
- Columna derecha (58%): .tag, h2, .lead ×2.

### 3. \`""\` (vacío) — Slides de contenido con brandbar
Variedad obligatoria de layouts. No repetir el mismo en slides consecutivas:
- **Agenda** (3 subapartados): 3 .card en grid 1fr 1fr 1fr, con .num-badge (1.1/1.2/1.3), .ico y alternando claro/violet/dark.
- **Concepto con imagen**: split (contenido 55% + .imgbox 45%), .tag, h2, .lead, métricas, .card informativo.
- **Comparativa 3 disciplinas**: 3 .card en grid con .ico y variantes de color.
- **Lista larga** (ej: 5 etapas): columna de filas con borde izquierdo de color + número en caja + título + descripción.
- **Proceso/flujo de pasos**: flex row de cards pequeñas + "→" entre ellas, última en .violet.
- **Casos / estadísticas**: 2 .card en grid, cada una con .stat + descripción.
- **Cita / resumen**: split (imagen en columna izquierda 40% + cita con comilla gigante en derecha).
- **Conceptos / roles en grid**: 3-col o 2-col de .card con .ico, mezcla de claro/dark/violet.

### 4. \`section-divider\` — Divisor (fondo negro lo pone el tema)
Split 62/38 (el 38% es decorativo a la derecha):
- brandbar con \`brand.light\`
- Columna izquierda (62%): kicker (\`color:var(--primary-300)\`), h1 (~52px, #fff), p (muted), tags ghost.
- Decoración derecha: número de sección gigante (\`position:absolute;right:-30px;font-size:420px;font-weight:900;color:rgba(255,255,255,.06)\`).
- .blob (\`background:rgba(108,76,241,.35);right:120px;bottom:-120px;filter:blur(40px)\`).

### 5. \`outro\` — Conclusión con tutor
Split ~58/42:
- Columna izquierda (58%): brandbar, .tag, h2, .lead, lista de 2-3 puntos con \`<span style="…var(--grad)…">\` + texto.
- Columna derecha (42%): \`background:var(--primary-soft)\`, .tutor (270px), label "Voz en off".

### 6. \`closing\` — Cierre final (fondo degradado lo pone el tema; sin brandbar)
Ancho 100%, centrado (align-items:center, justify-content:center, text-align:center):
- .blob ×2 decorativos
- .tag ghost (\`background:rgba(255,255,255,.16);color:#fff\`)
- h1 grande (#fff, ~50px), palabra clave en \`<span style="color:#FBE9A6">\`
- Logo al pie (\`div 26px grad + span font-weight:800\`)`

const STRICT_DENSITY = `## Reglas de densidad y calidad
- Incluir .brandbar en TODAS las slides de contenido (tipo "") y section-divider.
- Añadir un icono (.ico + SVG) en casi cada tarjeta de las slides de agenda/comparativas.
- Usar .num-badge en tarjetas numeradas (agenda, pasos).
- Añadir .blob decorativo en cover, section-divider y closing.
- Incluir .ph-badge dentro de cada .imgbox.
- Variar el color de tarjetas: no poner todas .card (sin variante) en el mismo slide.
- El .tutor SOLO en intro y outro (y solo si hay avatar).
- Un divisor (section-divider) antes de cada bloque de sección importante del guion.
- Número de sección gigante (01, 02, 03…) en CADA section-divider.`

// ── Sección de layout en modo LIBRE (con referencias): se parece a ellas ──
const FREE_LAYOUT = `## Prioridad #1: PARÉCETE A LAS REFERENCIAS

Se han adjuntado imágenes de referencia de estilo. Tu objetivo principal es que CADA slide se
parezca a ellas. Estúdialas antes de componer y copia:
- su lenguaje de layout y su composición (rejillas, splits, posición de los elementos),
- los márgenes y el aire (densidad / cantidad de espacio en blanco),
- la jerarquía y los tamaños tipográficos,
- el uso del color y la PALETA que observes en ellas.

Reglas de este modo:
- El catálogo de componentes y los tokens de arriba son una PALETA OPCIONAL de apoyo, NO recetas
  obligatorias. Úsalos solo cuando encajen con lo que ves en las referencias. NO estás obligado a
  usar .brandbar, .card, .tutor ni ningún layout "canónico" si las referencias piden otra cosa.
- COLOR: si las referencias usan una paleta distinta a los tokens del tema, usa esos colores
  directamente con estilos inline. Reserva los tokens (var(--…)) para radios, sombras y espaciados,
  y como respaldo cuando una referencia no especifique un color.
- LAYOUT: compón libremente con flex/grid e inline styles. Cada slide mide 1280×720. Para un fondo
  a medida, envuelve el contenido de la slide en un contenedor que ocupe todo el espacio:
  \`<div style="width:100%;height:100%;display:flex;…;background:…">…</div>\`.
- slideClass: sigue siendo útil. "cover"/"intro"/"section-divider"/"outro"/"closing" aplican fondos
  del tema; si prefieres pintar tu propio fondo inline, usa "" y compón a tu gusto. Mantén una
  variedad sana: portada, contenido, divisores de sección y cierre.`

const FREE_DENSITY = `## Reglas de calidad
- ~17–19 slides: aproximadamente 1 idea central del guion por slide. No amontones.
- Varía el layout entre slides consecutivas; evita que todas se vean iguales.
- Cuida el detalle: alineaciones, aire, jerarquía y consistencia entre slides, como en las referencias.
- El avatar (data-avatar) solo en la bienvenida y el cierre, y solo si hay avatar disponible.`

function buildSystemPrompt(
  theme: Theme,
  manifest: ImageManifestEntry[],
  hasAvatar: boolean,
  freeMode: boolean,
): string {
  const p = theme.palette

  const intro = freeMode
    ? `Eres un diseñador senior de presentaciones corporativas. A partir de un PDF (guion con el texto literal de las slides) y de unas IMÁGENES DE REFERENCIA de estilo, construyes un deck HTML 16:9 a medida, en el MISMO IDIOMA que el PDF. Tu diseño se inspira DIRECTAMENTE en las referencias adjuntas.`
    : `Eres un diseñador senior de presentaciones corporativas. A partir de un PDF (guion con el texto literal de las slides), construyes un deck HTML 16:9 a medida, denso y pulido, en el MISMO IDIOMA que el PDF.`

  const componentsHeader = freeMode
    ? '## Componentes CSS disponibles (paleta OPCIONAL — úsalos solo si encajan con las referencias)'
    : '## Componentes CSS disponibles'

  return `${intro}

## Reglas generales
- Extrae el texto LITERALMENTE del PDF; no inventes datos, cifras ni citas.
- Devuelve en "html" SOLO el HTML interno del <section> (sin la etiqueta <section>).
- La clase especial del <section> va en "slideClass" (ver valores canónicos abajo).
- Genera ~17–19 slides: aproximadamente 1 idea central del guion por slide.
- Texto conciso y apto para slide: frases cortas. Para listas largas usa una slide de lista completa.

## Tokens disponibles (usa var(…) para anclar colores/sombras/radios)
\`\`\`
--primary        ${p.primary}   acento de marca
--primary-600                   variante oscura del acento
--primary-300                   variante clara (texto sobre fondo oscuro)
--primary-soft                  fondo muy suave de marca (columnas intro/outro)
--ink                           texto principal
--ink-soft                      texto destacado
--muted                         texto secundario (gris)
--muted-2                       etiquetas muy tenues
--card                          fondo de tarjeta clara
--black       ${p.dark ?? '#0C0B10'}    fondo/tarjeta negra
--bg          ${p.background}   fondo de slide blanco
--grad                          degradado principal de marca
--grad-soft                     degradado suave
--shadow-sm / --shadow / --shadow-lg   sombras
--radius (26px) / --radius-sm (16px)   redondeos
\`\`\`

${componentsHeader}

### Utilidades
- \`.pad\` → padding 64px 72px
- \`.col\` → flex column
- \`.vio\` → \`<span class="vio">texto</span>\` para marcar con color de marca

### Tipografía
- \`h1\` — titular principal (~50–56px según slide)
- \`h2\` — titular secundario (~34–42px)
- \`h3\` — titular de tarjeta (~18–22px)
- \`p\` — cuerpo (muted, line-height 1.55)
- \`.lead\` — párrafo destacado (18px, ink-soft)
- \`b\` / \`strong\` — texto enfatizado (color ink)
- \`.kicker\` / \`.eyebrow\` — etiqueta MAYÚSCULAS con tracking (13px, muted-2)
- \`.stat\` — cifra estadística grande (900 weight)

### Brandbar
\`\`\`html
<div class="brandbar">
  <div class="brand"><span class="dot"></span>NOMBRE DEL CURSO</div>
  <span class="num">SECCIÓN · Subtítulo</span>
</div>
\`\`\`
Para fondos oscuros: \`<div class="brand light">\` y \`<span class="num" style="color:rgba(255,255,255,.5)">\`

### Tags / botones
\`\`\`html
<span class="tag"><span class="pip"></span>Texto</span>  <!-- pastilla de marca -->
<span class="btn">Texto <span class="circ"><svg…chevron…></span></span>  <!-- CTA negro -->
\`\`\`
Tags en fondo oscuro: añadir \`style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)"\`

### Tarjetas con icono y número
\`\`\`html
<div class="card" style="padding:34px 32px">
  <span class="num-badge">1.1</span>
  <div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"…>…</svg></div>
  <h3 style="font-size:20px;color:var(--ink)">Título</h3>
  <p style="margin-top:12px;font-size:14px">Descripción.</p>
</div>
\`\`\`
Variantes: \`.card.dark\` (stroke="#fff" en ico), \`.card.violet\` (stroke="#fff" en ico)
Usar \`stroke="var(--primary)"\` en .card clara, \`stroke="#fff"\` en .card.dark y .card.violet.

### Imágenes placeholder
\`\`\`html
<div class="imgbox" style="width:100%;height:100%;box-shadow:var(--shadow)">
  <img data-img="ID" alt="">
  <span class="ph-badge">Imagen · placeholder</span>
</div>
\`\`\`
El renderer inyecta el src a partir del data-img. Fallback sin img: \`<div class="media"></div>\`

### Avatar-tutor (SOLO en "intro" y "outro")
\`\`\`html
<div class="tutor" style="width:300px;height:300px">
  <span class="ring"></span><span class="ring r2"></span>
  <div class="photo" style="width:300px;height:300px">
    <img data-avatar alt="Tutora">
  </div>
  <span class="live"><span class="blink"></span>TEXTO DEL BADGE</span>
</div>
\`\`\`
El renderer inyecta el src del img. Para "outro" usar width/height ~270px.

### Decoración
\`\`\`html
<div class="blob" style="width:Xpx;height:Xpx;background:rgba(108,76,241,.35);POSICIÓN;filter:blur(40px)"></div>
\`\`\`
Usar en portadas, divisores y cierre.

## LIBERTAD DE COMPOSICIÓN

**Debes y puedes usar \`style="…"\` inline para:**
- Definir anchos de columnas: \`style="width:47%;height:100%"\`
- Fondos de columnas: \`style="background:var(--grad)"\`, \`style="background:var(--primary-soft)"\`
- Grids específicos: \`style="display:grid;grid-template-columns:1fr 1fr;gap:22px"\`
- Tamaños tipográficos: \`style="font-size:53px"\`
- Posicionado decorativo: \`style="position:absolute;right:-30px;…"\`

**Iconos SVG inline:** inclúyelos directamente dentro de \`.ico\` y \`.btn .circ\` (o donde haga falta).
Usa SVGs de línea simples (\`fill="none"\`, \`stroke="currentColor"\` o color/token, \`viewBox="0 0 24 24"\`).

${freeMode ? FREE_LAYOUT : STRICT_LAYOUT}

## Reglas de imágenes
${buildImageRules(manifest, hasAvatar, freeMode)}

${freeMode ? FREE_DENSITY : STRICT_DENSITY}`.trim()
}

export async function generateSlides(opts: GenerateOptions): Promise<Slides> {
  const { pdfBase64, theme, imageManifest = [], hasAvatar = false, referenceImages = [] } = opts
  const freeMode = referenceImages.length > 0

  const userContent: Anthropic.MessageParam['content'] = [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    },
  ]

  if (referenceImages.length) {
    userContent.push({
      type: 'text',
      text: `Estas ${referenceImages.length} imágenes son REFERENCIAS DE ESTILO (no contenido). Imita su layout, composición, paleta, tipografía y densidad lo más fielmente posible en CADA slide. No copies su texto: el contenido sale del PDF.`,
    })
    userContent.push(...referenceImages)
  }

  userContent.push({
    type: 'text',
    text: 'Genera las slides de esta presentación a partir del PDF, siguiendo todas las reglas del sistema.',
  })

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(theme, imageManifest, hasAvatar, freeMode),
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
