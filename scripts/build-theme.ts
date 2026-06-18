/**
 * Builder de temas por defecto.
 *
 * Crea/actualiza un tema JSON (tokens + CSS) a partir del diseño observado en
 * las imágenes de referencia, y genera un preview HTML para compararlo a ojo.
 *
 * Uso:  npx tsx scripts/build-theme.ts
 */
import { mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ThemeSchema, type Theme } from '../src/config/theme-schema.js'
import { renderDeck } from '../src/templates/reveal.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── CSS del tema "Timely AI" ────────────────────────────────────────────────
const css = `
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
}

.reveal { font-family: 'Inter', system-ui, sans-serif; color: var(--text); font-size: 20px; }
.reveal .slides { text-align: left; }
.reveal .slides section {
  width: 100%; height: 100%;
  padding: 56px 64px;
  box-sizing: border-box;
  background: var(--bg);
  display: flex; flex-direction: column; justify-content: center;
}

.reveal h1, .reveal h2, .reveal h3 {
  font-family: 'Plus Jakarta Sans', sans-serif;
  letter-spacing: -0.02em; line-height: 1.12; margin: 0 0 16px;
}
.reveal h1 { color: var(--primary); font-weight: 800; font-size: 40px; }
.reveal h2 { color: var(--primary); font-weight: 700; font-size: 28px; }
.reveal h3 { color: var(--text); font-weight: 700; font-size: 19px; margin-bottom: 8px; }
.reveal p { font-size: 16px; line-height: 1.5; margin: 0 0 12px; }
.reveal .lead { font-size: 18px; font-weight: 600; color: var(--text); }
.reveal .muted { color: var(--muted); font-size: 14px; line-height: 1.45; }
.reveal .eyebrow { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }

/* layouts */
.reveal .split { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.reveal section.title-slide .split { height: 100%; }
.reveal .stack { display: flex; flex-direction: column; gap: 16px; }
.reveal .grid-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }

/* media (placeholder de imagen) */
.reveal .media {
  border-radius: var(--radius);
  background: linear-gradient(135deg, #c4b5fd, #7c5cfc);
  width: 100%; min-height: 320px; flex: 1;
}
.reveal .media--dark { background: linear-gradient(135deg, #2a2440, #0a0a0a); }

/* tarjetas */
.reveal .card { background: var(--card); border-radius: var(--radius); padding: 22px 24px; }
.reveal .card h3 { margin: 0 0 6px; }
.reveal .card p { font-size: 13px; color: var(--muted); margin: 0; }
.reveal .card--purple { background: var(--primary); }
.reveal .card--purple h3, .reveal .card--purple p { color: #fff; }
.reveal .card--dark { background: var(--dark); }
.reveal .card--dark h3, .reveal .card--dark p { color: #fff; }

/* botón pill */
.reveal .pill {
  display: inline-flex; align-items: center; gap: 10px; align-self: flex-start;
  background: var(--dark); color: #fff;
  padding: 14px 26px; border-radius: 999px;
  font-weight: 600; font-size: 14px; text-decoration: none;
}

/* etiqueta */
.reveal .tag {
  display: inline-block; align-self: flex-start;
  background: var(--card); color: var(--muted);
  padding: 12px 18px; border-radius: 10px; font-size: 13px;
}
`.trim()

const theme: Theme = {
  name: 'timely-ai',
  label: 'Timely AI',
  description:
    'Deck SaaS moderno: fondo blanco, morado de marca, tarjetas redondeadas (gris/morada/negra), titulares en Plus Jakarta Sans y botones pill negros.',
  source: ['slide01.png', 'slide02.png', 'slide03.png'],
  palette: {
    background: '#ffffff',
    text: '#18181b',
    muted: '#71717a',
    primary: '#6d3ce6',
    card: '#f3f3f5',
    dark: '#0a0a0a',
  },
  typography: {
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap',
    ],
  },
  css,
}

// ── slides de muestra (reproducen las 3 referencias) ─────────────────────────
const sampleSlides = `
<section class="title-slide">
  <div class="split">
    <div class="media"></div>
    <div class="stack">
      <h1>Timely AI: Intelligent Calendar Design</h1>
      <p class="lead">We don't just schedule your day — we design it.</p>
      <a class="pill" href="#">Learn More &nbsp;→</a>
      <span class="tag">From Passive Recording to Proactive Design</span>
    </div>
  </div>
</section>

<section>
  <div class="split">
    <div class="stack">
      <div class="media media--dark"></div>
      <p class="muted">The average knowledge worker spends 4.3 hours weekly on scheduling overhead, costing billions in lost productivity.</p>
    </div>
    <div class="stack">
      <div class="card"><h3>Outdated Systems</h3><p>With 62 meetings a month, professionals waste significant time in unproductive sessions.</p></div>
      <div class="card card--purple"><h3>Productivity Drain</h3><p>Existing calendar tools are passive recorders, unable to optimize time or protect deep work.</p></div>
      <div class="card"><h3>Inefficient Meetings</h3><p>Schedule-driven context switching results in a $588 billion annual productivity loss in the US.</p></div>
    </div>
  </div>
</section>

<section>
  <h1>Timely AI: Your Intelligent Time Partner</h1>
  <div class="split">
    <div class="media"></div>
    <div class="grid-cards">
      <div class="card"><h3>How</h3><p>A proactive AI agent that designs your schedule, not just records it.</p></div>
      <div class="card"><h3>Product</h3><p>The proactive calendar assistant that finds optimal times automatically.</p></div>
      <div class="card card--purple"><h3>The Promise</h3><p>Schedules, prioritizes and optimizes your day autonomously.</p></div>
      <div class="card card--dark"><h3>Mission</h3><p>The AI operating system for human time, working for you around the clock.</p></div>
    </div>
  </div>
</section>
`.trim()

// ── escribir artefactos ──────────────────────────────────────────────────────
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
    slides: sampleSlides,
  }),
  'utf8',
)

console.log(`✓ themes/${validated.name}.json`)
console.log('✓ preview.generated.html')
