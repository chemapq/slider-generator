/**
 * Builder de temas.
 *
 * Modos:
 *   npx tsx scripts/build-theme.ts                 → manual (sin API)
 *   npx tsx scripts/build-theme.ts --from-images   → descifra references/ con Claude (necesita ANTHROPIC_API_KEY)
 *
 * En ambos modos escribe themes/<name>.json y preview.generated.html.
 */
import 'dotenv/config'
import { mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ThemeSchema, type Theme } from '../src/config/theme-schema.js'
import { renderDeck } from '../src/templates/deck.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── CSS del tema "Timely AI" (selectores sobre .slide, NO sobre .reveal) ─────
const TIMELY_AI_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

:root {
  --bg: #ffffff;
  --text: #18181b;
  --muted: #71717a;
  --primary: #6d3ce6;
  --primary-soft: #ede9fe;
  --card: #f3f3f5;
  --dark: #0a0a0a;
  --radius: 18px;
  --avatar-ring: #6d3ce6;
}

.slide {
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--text);
  font-size: 20px;
  background: var(--bg);
  text-align: left;
  padding: 56px 64px;
}

.slide h1, .slide h2, .slide h3 {
  font-family: 'Plus Jakarta Sans', sans-serif;
  letter-spacing: -0.02em;
  line-height: 1.12;
  margin: 0 0 16px;
}
.slide h1 { color: var(--primary); font-weight: 800; font-size: 40px; }
.slide h2 { color: var(--primary); font-weight: 700; font-size: 28px; }
.slide h3 { color: var(--text); font-weight: 700; font-size: 19px; margin-bottom: 8px; }
.slide p { font-size: 16px; line-height: 1.5; margin: 0 0 12px; }
.slide .lead { font-size: 18px; font-weight: 600; color: var(--text); }
.slide .muted { color: var(--muted); font-size: 14px; line-height: 1.45; }
.slide .eyebrow { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }

/* layouts */
.slide .split { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; height: 100%; }
.slide .stack { display: flex; flex-direction: column; gap: 16px; }
.slide .grid-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }

/* media (placeholder de imagen; el renderer inyecta background-image via data-img) */
.slide .media {
  border-radius: var(--radius);
  background: linear-gradient(135deg, #c4b5fd, #7c5cfc);
  width: 100%;
  min-height: 320px;
  flex: 1;
  background-size: cover;
  background-position: center;
}
.slide .media--dark { background: linear-gradient(135deg, #2a2440, #0a0a0a); }

/* tarjetas */
.slide .card { background: var(--card); border-radius: var(--radius); padding: 22px 24px; }
.slide .card h3 { margin: 0 0 6px; }
.slide .card p { font-size: 13px; color: var(--muted); margin: 0; }
.slide .card--purple { background: var(--primary); }
.slide .card--purple h3, .slide .card--purple p { color: #fff; }
.slide .card--dark { background: var(--dark); }
.slide .card--dark h3, .slide .card--dark p { color: #fff; }

/* botón pill */
.slide .pill {
  display: inline-flex; align-items: center; gap: 10px; align-self: flex-start;
  background: var(--dark); color: #fff;
  padding: 14px 26px; border-radius: 999px;
  font-weight: 600; font-size: 14px; text-decoration: none;
}

/* etiqueta */
.slide .tag {
  display: inline-block; align-self: flex-start;
  background: var(--card); color: var(--muted);
  padding: 12px 18px; border-radius: 10px; font-size: 13px;
}

/* slideClass: section-divider */
.slide.section-divider {
  background: var(--primary);
  flex-direction: row;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 32px;
  padding: 48px 64px;
}
.slide.section-divider .section-num {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 140px;
  font-weight: 800;
  line-height: 1;
  color: rgba(255,255,255,0.12);
  letter-spacing: -0.04em;
  flex-shrink: 0;
}
.slide.section-divider .stack { justify-content: flex-end; }
.slide.section-divider h2 { color: #fff; font-size: 32px; margin-bottom: 6px; }
.slide.section-divider .muted { color: rgba(255,255,255,0.6); font-size: 15px; }

/* slideClass: outro (conclusión con avatar) */
.slide.outro {
  background: var(--dark);
  align-items: center;
  justify-content: center;
  gap: 40px;
  flex-direction: row;
}
.slide.outro .stack { align-items: flex-start; }
.slide.outro h1 { color: #fff; }
.slide.outro .lead { color: rgba(255,255,255,0.72); }
.slide.outro .tag { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.55); }
`.trim()

const TIMELY_AI_THEME: Theme = {
  name: 'timely-ai',
  label: 'Timely AI',
  description:
    'Deck SaaS moderno: fondo blanco, morado de marca, tarjetas redondeadas, titulares en Plus Jakarta Sans.',
  source: ['slide01.png', 'slide02.png', 'slide03.png'],
  palette: {
    background: '#ffffff',
    text: '#18181b',
    muted: '#71717a',
    primary: '#6d3ce6',
    card: '#f3f3f5',
    dark: '#0a0a0a',
    avatarRing: '#6d3ce6',
  },
  typography: {
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap',
    ],
  },
  css: TIMELY_AI_CSS,
}

// ── Slides de muestra (verifican todas las slideClass y componentes) ───────────
const SAMPLE_SLIDES = `
  <section class="slide title-slide">
    <div class="split">
      <div class="media"></div>
      <div class="stack">
        <span class="eyebrow">Fundamentos · Tema 1</span>
        <h1>Growth Marketing y Revenue Ops</h1>
        <p class="lead">Aprende a combinar estrategia, datos y automatización para escalar cualquier negocio.</p>
        <a class="pill" href="#">Empezar →</a>
      </div>
    </div>
  </section>

  <section class="slide">
    <div class="split">
      <div class="stack">
        <span class="eyebrow">01 — El contexto</span>
        <h1>¿Por qué Growth?</h1>
        <p class="lead">Las empresas que crecen más rápido no son las que gastan más en publicidad.</p>
        <p class="muted">Son las que entienden el ciclo completo del cliente y optimizan cada etapa.</p>
      </div>
      <div class="grid-cards">
        <div class="card"><h3>Marketing digital</h3><p>Genera demanda y visibilidad de marca.</p></div>
        <div class="card card--purple"><h3>Growth</h3><p>Experimenta para acelerar la adquisición y retención.</p></div>
        <div class="card card--dark"><h3>RevOps</h3><p>Alinea ventas, marketing y éxito del cliente.</p></div>
        <div class="card"><h3>Datos</h3><p>Mide todo; decide con evidencia, no con intuición.</p></div>
      </div>
    </div>
  </section>

  <section class="slide section-divider">
    <span class="section-num">01</span>
    <div class="stack">
      <h2>Fundamentos</h2>
      <p class="muted">Marketing digital · Growth · RevOps</p>
    </div>
  </section>

  <section class="slide">
    <span class="eyebrow">Modelo AARRR</span>
    <h1>El funnel pirata</h1>
    <div class="grid-cards">
      <div class="card"><h3>Acquisition</h3><p>¿Cómo nos encuentran los usuarios?</p></div>
      <div class="card card--purple"><h3>Activation</h3><p>¿Tienen una buena primera experiencia?</p></div>
      <div class="card"><h3>Retention</h3><p>¿Vuelven?</p></div>
      <div class="card card--dark"><h3>Revenue</h3><p>¿Pagan? ¿Cuánto?</p></div>
    </div>
  </section>

  <section class="slide outro">
    <img class="avatar" src="" alt="Tutora" data-avatar>
    <div class="stack">
      <h1>En resumen</h1>
      <p class="lead">Growth no es un hack; es un sistema de experimentación continua.</p>
      <span class="tag">¡Nos vemos en el siguiente tema!</span>
    </div>
  </section>
`.trim()

// ── Helpers ────────────────────────────────────────────────────────────────────

async function writeArtifacts(theme: Theme): Promise<void> {
  const validated = ThemeSchema.parse(theme)
  await mkdir(join(ROOT, 'themes'), { recursive: true })
  await writeFile(
    join(ROOT, 'themes', `${validated.name}.json`),
    JSON.stringify(validated, null, 2),
    'utf8',
  )
  await writeFile(
    join(ROOT, 'preview.generated.html'),
    renderDeck({
      title: `Preview — ${validated.label ?? validated.name}`,
      css: validated.css,
      slides: SAMPLE_SLIDES,
    }),
    'utf8',
  )
  console.log(`✓ themes/${validated.name}.json`)
  console.log('✓ preview.generated.html')
}

// ── Modo manual ───────────────────────────────────────────────────────────────

async function buildManual(): Promise<void> {
  console.log('Modo manual: usando definición codificada de timely-ai.')
  await writeArtifacts(TIMELY_AI_THEME)
}

// ── Modo descifrar (necesita ANTHROPIC_API_KEY) ───────────────────────────────

async function buildFromImages(): Promise<void> {
  console.log('Modo descifrar: enviando referencias a Claude…')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
  const { loadReferenceImages } = await import('../src/services/references.js')

  const refImages = await loadReferenceImages()
  if (!refImages.length) {
    throw new Error('No hay imágenes en references/. Añade al menos una imagen de referencia.')
  }

  const client = new Anthropic()

  const SYSTEM = `Eres un experto en diseño de presentaciones corporativas. A partir de \
imágenes de slides de referencia, extraes el sistema de diseño con FIDELIDAD y lo conviertes en \
un tema JSON + CSS para un deck HTML propio (NO reveal.js). El CSS usa selectores sobre .slide \
(p. ej. ".slide h1 { ... }"), nunca ".reveal". Reproduces exactamente la paleta, las tipografías, \
los radios, las sombras y los espaciados que observas en las imágenes.`

  const USER_TEXT = `Analiza estas ${refImages.length} imágenes de slides de referencia y extrae \
el tema COMPLETO. Tu CSS lo aplicará un deck cuyo HTML usa este vocabulario de componentes; debes \
estilizar TODOS estos selectores (si falta alguno, las slides se romperán):

VARIABLES (en :root): --bg, --text, --muted, --primary, --primary-soft, --card, --dark, --radius, --avatar-ring.

BASE:
- .slide → font-family (cuerpo), color, background:var(--bg), padding:56px 64px, line-height. \
NO pongas display/flex/justify-content en .slide: el deck ya centra verticalmente.
- h1, h2, h3 → familia de titulares, pesos, tamaños y color observados (h1 suele ser el morado de marca).
- p, .lead (subtítulo destacado grande), .muted (texto secundario gris), \
.eyebrow (etiqueta MAYÚSCULAS pequeña con tracking, suele ir en color de marca).

LAYOUTS:
- .split → display:grid; grid-template-columns:1fr 1fr; gap; align-items:center; height:100%.
- .stack → display:flex; flex-direction:column; gap.
- .grid-cards → display:grid; grid-template-columns:1fr 1fr; gap.

TARJETAS (mira bien las imágenes: fondos claros gris muy sutiles, esquinas MUY redondeadas, sombra suave):
- .card → background:var(--card); border-radius:var(--radius); padding; (sombra si la ves).
- .card--purple → fondo morado de marca, texto e hijos (h3,p,.muted) en blanco.
- .card--dark → fondo negro, texto e hijos en blanco.

IMÁGENES:
- .media → marcador de imagen: degradado de marca como fallback, background-size:cover; \
background-position:center; border-radius:var(--radius); min-height:320px.
- .media--dark → variante con degradado oscuro.

OTROS:
- .pill → botón tipo píldora negra con texto blanco, redondeo total (border-radius:999px), inline-flex.
- .tag → etiqueta/caja clara con texto tenue, esquinas redondeadas.

SLIDES ESPECIALES (por slideClass; define solo COLOR/CONTEXTO, el tamaño es estructural):
- .slide.section-divider → fondo de marca (morado) y color de texto en blanco (su número \
gigante .section-num hereda este color con baja opacidad: NO definas .section-num).
- .slide.outro → fondo oscuro/negro, h1 en morado claro (--primary-soft), demás texto en blanco.

NO TOQUES (los gestiona el deck): el tamaño/anillo del avatar (img.avatar) ni .section-num; \
solo aporta su COLOR vía --avatar-ring y el color de texto de las slides que los contienen.

Los @import de Google Fonts van al INICIO del CSS. Rellena también "palette", \
"typography" (headingFont, bodyFont, fontLinks) y "avatarRing" dentro de "palette".`

  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          ...refImages,
          { type: 'text', text: USER_TEXT },
        ],
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

  // Preservar los metadatos del tema manual; Claude solo aporta palette, typography y css.
  const generated = final.parsed_output as Theme
  const merged: Theme = {
    ...TIMELY_AI_THEME,
    palette: generated.palette,
    typography: generated.typography,
    css: generated.css,
  }

  checkCssCompleteness(merged.css)
  await writeArtifacts(merged)
}

/** Avisa si el CSS generado omite algún selector que las slides usan. */
function checkCssCompleteness(css: string): void {
  const required = [
    '.lead', '.muted', '.eyebrow',
    '.split', '.stack', '.grid-cards',
    '.card', '.card--purple', '.card--dark',
    '.media', '.media--dark', '.pill', '.tag',
    'section-divider', 'outro',
  ]
  const missing = required.filter((sel) => !css.includes(sel))
  if (missing.length) {
    console.warn(`⚠ El CSS generado no menciona: ${missing.join(', ')}`)
    console.warn('  Revisa el preview; quizá convenga regenerar o ajustar a mano.')
  } else {
    console.log('✓ El CSS cubre todos los componentes del vocabulario.')
  }
}

// ── Punto de entrada ───────────────────────────────────────────────────────────

const useClaudeMode = process.argv.includes('--from-images')

if (useClaudeMode) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY no está configurada en .env.')
    console.error('Para el modo manual (sin API): npx tsx scripts/build-theme.ts')
    process.exit(1)
  }
  await buildFromImages()
} else {
  await buildManual()
}
