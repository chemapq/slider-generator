/**
 * Builder de temas adicionales (modernos, sin API).
 *
 *   npx tsx scripts/build-new-themes.ts
 *
 * Escribe themes/<name>.json para cada tema y, además, un preview navegable por
 * tema en previews/<name>.html (+ previews/index.html como galería). El CSS se
 * escribe aquí como plantilla legible y se serializa a JSON (escape automático),
 * igual que scripts/build-theme.ts.
 *
 * Cada tema define el MISMO vocabulario de tokens + componentes que timely-ai
 * (ver src/services/theme-builder.ts → findMissingSelectors), variando paleta,
 * tipografía, radios, sombras y degradados para tener identidades distintas.
 */
import { mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ThemeSchema, type Theme } from '../src/config/theme-schema.js'
import { findMissingSelectors } from '../src/services/theme-builder.js'
import { renderDeck } from '../src/templates/deck.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── Plantilla CSS compartida ─────────────────────────────────────────────────
// Estructura idéntica para todos los temas; la identidad sale de `root` (tokens
// en :root) y de `extra` (ajustes de tratamiento por tema). Así garantizamos que
// TODOS los selectores del vocabulario están cubiertos en cada tema.
function buildCss(importUrl: string, root: string, extra: string): string {
  return `@import url('${importUrl}');

:root {
${root}
}

/* Fondo de slide (el chrome de deck.ts ya pone position/opacity/transform) */
.slide { background: var(--bg); }

/* Utilidades */
.pad { padding: 64px 72px; }
.col { display: flex; flex-direction: column; }

/* ── Tipografía ─────────────────────────────────────────────────────────── */
body { font-family: var(--font-body); }
h1 { font-family: var(--font-display); font-weight: var(--w-display); letter-spacing: var(--track-display); line-height: 1.02; color: var(--ink); }
h2 { font-family: var(--font-display); font-weight: var(--w-h2); letter-spacing: var(--track-display); line-height: 1.06; color: var(--ink); }
h3 { font-family: var(--font-display); font-weight: var(--w-h3); letter-spacing: -.01em; line-height: 1.14; color: var(--ink); }
p  { color: var(--muted); line-height: 1.55; font-weight: 400; }
.lead { font-size: 18px; color: var(--ink-soft); line-height: 1.6; font-weight: 500; }
b, strong { color: var(--ink); font-weight: 700; }
.vio { color: var(--primary); }
.kicker, .eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--muted-2); }
.stat { font-family: var(--font-display); font-weight: var(--w-display); letter-spacing: -.03em; color: var(--ink); line-height: 1; }

/* ── Brand bar ──────────────────────────────────────────────────────────── */
.brandbar { position: absolute; top: 30px; left: 72px; right: 72px; display: flex; align-items: center; justify-content: space-between; z-index: 5; }
.brand { display: flex; align-items: center; gap: 11px; font-family: var(--font-display); font-weight: 700; font-size: 16px; letter-spacing: -.01em; color: var(--ink); }
.brand .dot { width: 26px; height: 26px; border-radius: var(--dot-radius); background: var(--grad); box-shadow: var(--shadow-sm); position: relative; }
.brand .dot::after { content: ""; position: absolute; inset: 7px; border-radius: 50%; background: var(--bg); opacity: .92; }
.brand.light, .brand.light .num { color: #fff; }
.num { font-size: 13px; font-weight: 700; color: var(--muted-2); letter-spacing: .04em; }

/* ── Tags / botones ─────────────────────────────────────────────────────── */
.tag { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; background: var(--primary-soft); color: var(--primary-600); font-size: 13px; font-weight: 700; letter-spacing: .02em; width: max-content; border: 1px solid var(--tag-border); }
.tag .pip { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
.btn { display: inline-flex; align-items: center; gap: 14px; background: var(--black); color: #fff; border-radius: 999px; padding: 14px 22px 14px 26px; font-family: var(--font-display); font-weight: 700; font-size: 15px; width: max-content; box-shadow: var(--shadow-sm); }
.btn .circ { width: 34px; height: 34px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; }
.btn .circ svg { width: 15px; height: 15px; }

/* ── Tarjetas ───────────────────────────────────────────────────────────── */
.card { background: var(--card); border-radius: var(--radius); padding: 30px 32px; position: relative; overflow: hidden; border: var(--card-border); box-shadow: var(--card-shadow); }
.card.dark { background: var(--black); color: #fff; border-color: transparent; }
.card.dark h3 { color: #fff; }
.card.dark p { color: var(--on-dark-muted); }
.card.violet { background: var(--grad); color: #fff; border-color: transparent; }
.card.violet h3 { color: #fff; }
.card.violet p { color: var(--on-accent-muted); }
.card .ico { width: 46px; height: 46px; border-radius: var(--ico-radius); background: var(--ico-bg); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; box-shadow: var(--shadow-sm); }
.card.dark .ico, .card.violet .ico { background: rgba(255,255,255,.14); box-shadow: none; }
.card .ico svg { width: 23px; height: 23px; }
.card .num-badge { position: absolute; top: 24px; right: 26px; font-family: var(--font-display); font-size: 46px; font-weight: var(--w-display); color: var(--numbadge); letter-spacing: -.04em; line-height: 1; }
.card.dark .num-badge { color: rgba(255,255,255,.10); }
.card.violet .num-badge { color: rgba(255,255,255,.16); }

/* ── Image boxes ────────────────────────────────────────────────────────── */
.imgbox { border-radius: var(--radius); overflow: hidden; background: var(--grad-soft); position: relative; box-shadow: var(--card-shadow); }
.imgbox img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph-badge { position: absolute; bottom: 14px; left: 14px; background: rgba(8,10,20,.62); color: #fff; font-size: 11px; font-weight: 600; padding: 5px 11px; border-radius: 999px; backdrop-filter: blur(6px); letter-spacing: .02em; }

/* ── Imagen media (fallback sin .imgbox) ────────────────────────────────── */
.media { border-radius: var(--radius); background: var(--grad-soft); background-size: cover; background-position: center; min-height: 320px; flex: 1; }
.media.dark { background: linear-gradient(135deg, var(--card-2), var(--black)); }

/* ── Avatar-tutor ───────────────────────────────────────────────────────── */
.tutor { position: relative; flex: none; }
.tutor .ring { position: absolute; inset: -14px; border-radius: 50%; border: 2px solid var(--avatar-ring); opacity: .55; animation: pulse 2.6s ease-out infinite; }
.tutor .ring.r2 { animation-delay: 1.3s; }
@keyframes pulse { 0% { transform: scale(.92); opacity: .6; } 70% { opacity: 0; } 100% { transform: scale(1.18); opacity: 0; } }
.tutor .photo { border-radius: 50%; overflow: hidden; background: var(--grad); box-shadow: var(--shadow-lg); position: relative; z-index: 2; }
.tutor .photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; display: block; }
.tutor .live { position: absolute; z-index: 3; bottom: 8px; left: 50%; transform: translateX(-50%); background: var(--black); color: #fff; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; display: flex; align-items: center; gap: 7px; white-space: nowrap; box-shadow: var(--shadow); }
.tutor .live .blink { width: 8px; height: 8px; border-radius: 50%; background: #4ADE80; animation: blink 1.4s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }

/* ── Decoración ─────────────────────────────────────────────────────────── */
.blob { position: absolute; border-radius: 50%; filter: blur(2px); z-index: 0; }

/* ── slideClass especiales ──────────────────────────────────────────────── */
.slide.section-divider { background: var(--black); }
.slide.closing { background: var(--grad); }

/* ── Accesibilidad ──────────────────────────────────────────────────────── */
#nav button:focus-visible { outline: 2px solid var(--primary-300); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .tutor .ring, .tutor .live .blink { animation: none; }
}

/* ── Ajustes propios del tema ───────────────────────────────────────────── */
${extra}`
}

// ── Definiciones de los temas ─────────────────────────────────────────────────
interface ThemeDef {
  name: string
  label: string
  description: string
  importUrl: string
  headingFont: string
  bodyFont: string
  palette: Theme['palette']
  root: string
  extra: string
}

const AURORA: ThemeDef = {
  name: 'aurora-noir',
  label: 'Aurora Noir',
  description:
    'Deck oscuro premium: fondo azul medianoche, degradado aurora (azul→teal), tipografía Space Grotesk y resplandores suaves. Ideal para cursos de tecnología, datos o IA.',
  importUrl:
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap',
  headingFont: "'Space Grotesk', system-ui, sans-serif",
  bodyFont: "'Inter', system-ui, sans-serif",
  palette: {
    background: '#0B1020',
    text: '#ECEEF7',
    muted: '#98A1BD',
    primary: '#5B8DEF',
    card: '#161C32',
    dark: '#070A14',
    avatarRing: '#6FE3D6',
  },
  root: `  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --w-display: 700; --w-h2: 600; --w-h3: 600; --track-display: -.02em;
  --primary: #5B8DEF;
  --primary-600: #8FB4FF;
  --primary-300: #6FE3D6;
  --primary-100: #243154;
  --primary-soft: #141C36;
  --ink: #ECEEF7;
  --ink-soft: #C9CFE2;
  --muted: #98A1BD;
  --muted-2: #707A97;
  --line: rgba(255,255,255,.10);
  --card: #161C32;
  --card-2: #1E2542;
  --black: #070A14;
  --bg: #0B1020;
  --grad: linear-gradient(135deg, #5B8DEF 0%, #7B6BF2 48%, #34D6C8 100%);
  --grad-soft: linear-gradient(135deg, #1A2240 0%, #122436 100%);
  --shadow-sm: 0 2px 12px rgba(0,0,0,.45);
  --shadow: 0 18px 50px rgba(3,8,24,.55);
  --shadow-lg: 0 30px 80px rgba(2,6,20,.7), 0 0 70px rgba(91,141,239,.28);
  --radius: 22px;
  --radius-sm: 14px;
  --avatar-ring: #6FE3D6;
  --blob: rgba(91,141,239,.45);
  --dot-radius: 8px;
  --tag-border: rgba(255,255,255,.12);
  --card-border: 1px solid rgba(255,255,255,.07);
  --card-shadow: 0 18px 50px rgba(3,8,24,.5);
  --ico-bg: #FFFFFF;
  --ico-radius: 13px;
  --numbadge: rgba(123,160,255,.18);
  --on-dark-muted: #AEB6CE;
  --on-accent-muted: #E2EAFF;`,
  extra: `.card.violet { box-shadow: 0 22px 60px rgba(91,141,239,.32); }
.btn { box-shadow: 0 12px 32px rgba(91,141,239,.28); }
.tag { backdrop-filter: blur(4px); }`,
}

const ATELIER: ThemeDef = {
  name: 'atelier',
  label: 'Atelier',
  description:
    'Deck editorial sofisticado: papel marfil con un punto rosado, serif de alto contraste (Fraunces), acento granate y filetes finos. Para masterclass, diseño o humanidades.',
  importUrl:
    'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;0,9..144,900;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap',
  headingFont: "'Fraunces', Georgia, serif",
  bodyFont: "'Inter', system-ui, sans-serif",
  palette: {
    background: '#F6F1EE',
    text: '#211B1A',
    muted: '#7C7068',
    primary: '#9B2D4F',
    card: '#FFFFFF',
    dark: '#211A19',
    avatarRing: '#C9748B',
  },
  root: `  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --w-display: 900; --w-h2: 700; --w-h3: 600; --track-display: -.01em;
  --primary: #9B2D4F;
  --primary-600: #7E2440;
  --primary-300: #D38FA1;
  --primary-100: #F0E2E6;
  --primary-soft: #F3E9E6;
  --ink: #211B1A;
  --ink-soft: #423734;
  --muted: #7C7068;
  --muted-2: #A99C92;
  --line: #E7DDD4;
  --card: #FFFFFF;
  --card-2: #F6EFE9;
  --black: #211A19;
  --bg: #F6F1EE;
  --grad: linear-gradient(135deg, #B23A5B 0%, #8E2742 55%, #5E1A30 100%);
  --grad-soft: linear-gradient(135deg, #F2E4E2 0%, #ECD9D2 100%);
  --shadow-sm: 0 1px 2px rgba(40,20,20,.06);
  --shadow: 0 10px 30px rgba(60,30,30,.08);
  --shadow-lg: 0 24px 60px rgba(60,30,30,.14);
  --radius: 8px;
  --radius-sm: 5px;
  --avatar-ring: #C9748B;
  --blob: rgba(155,45,79,.30);
  --dot-radius: 6px;
  --tag-border: rgba(155,45,79,.22);
  --card-border: 1px solid #E7DDD4;
  --card-shadow: 0 6px 22px rgba(50,25,25,.05);
  --ico-bg: #FFFFFF;
  --ico-radius: 9px;
  --numbadge: rgba(155,45,79,.13);
  --on-dark-muted: #C9BEB6;
  --on-accent-muted: #F1D9DF;`,
  extra: `.vio { font-style: italic; }
h1, h2 { font-optical-sizing: auto; }
.kicker, .eyebrow { letter-spacing: .22em; }
.card .ico { border: 1px solid var(--line); box-shadow: none; }`,
}

const SOLSTICE: ThemeDef = {
  name: 'solstice',
  label: 'Solstice',
  description:
    'Deck cálido y enérgico: blanco crema, degradado coral→ámbar, tipografía Bricolage Grotesque con curvas amables y esquinas muy redondeadas. Para onboarding, marketing o producto.',
  importUrl:
    'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  headingFont: "'Bricolage Grotesque', system-ui, sans-serif",
  bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif",
  palette: {
    background: '#FFFBF7',
    text: '#2A201B',
    muted: '#897A70',
    primary: '#FF6A3D',
    card: '#FFF4ED',
    dark: '#2A1D16',
    avatarRing: '#FF6A3D',
  },
  root: `  --font-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
  --w-display: 800; --w-h2: 700; --w-h3: 700; --track-display: -.02em;
  --primary: #FF6A3D;
  --primary-600: #E8552B;
  --primary-300: #FFB13C;
  --primary-100: #FFE6DA;
  --primary-soft: #FFF0E8;
  --ink: #2A201B;
  --ink-soft: #4A3A32;
  --muted: #897A70;
  --muted-2: #B6A89F;
  --line: #F0E4DB;
  --card: #FFF4ED;
  --card-2: #FFEAE0;
  --black: #2A1D16;
  --bg: #FFFBF7;
  --grad: linear-gradient(135deg, #FF7A45 0%, #FF5E5E 46%, #FFB13C 100%);
  --grad-soft: linear-gradient(135deg, #FFE9DC 0%, #FFDCE0 100%);
  --shadow-sm: 0 2px 10px rgba(255,120,70,.10);
  --shadow: 0 16px 44px rgba(255,110,60,.16);
  --shadow-lg: 0 30px 70px rgba(255,100,50,.22);
  --radius: 26px;
  --radius-sm: 16px;
  --avatar-ring: #FF6A3D;
  --blob: rgba(255,106,61,.40);
  --dot-radius: 9px;
  --tag-border: rgba(255,106,61,.22);
  --card-border: 1px solid transparent;
  --card-shadow: 0 14px 40px rgba(255,120,60,.13);
  --ico-bg: #FFFFFF;
  --ico-radius: 14px;
  --numbadge: rgba(255,106,61,.16);
  --on-dark-muted: #D9CCC4;
  --on-accent-muted: #FFE6D6;`,
  extra: `.tag { box-shadow: var(--shadow-sm); }
.card .ico { box-shadow: var(--shadow-sm); }`,
}

const MERIDIAN: ThemeDef = {
  name: 'meridian',
  label: 'Meridian',
  description:
    'Deck minimalista tipo suizo: fondo gris hielo, grafito frío, un único acento esmeralda, tipografía Sora y filetes finos. Para contenido corporativo, técnico o financiero.',
  importUrl:
    'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap',
  headingFont: "'Sora', system-ui, sans-serif",
  bodyFont: "'Inter', system-ui, sans-serif",
  palette: {
    background: '#F2F5F7',
    text: '#0F151A',
    muted: '#67737C',
    primary: '#0FA372',
    card: '#FFFFFF',
    dark: '#0E1419',
    avatarRing: '#4FD0A3',
  },
  root: `  --font-display: 'Sora', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --w-display: 700; --w-h2: 600; --w-h3: 600; --track-display: -.025em;
  --primary: #0FA372;
  --primary-600: #0B8460;
  --primary-300: #4FD0A3;
  --primary-100: #DCF3EA;
  --primary-soft: #EAF4F0;
  --ink: #0F151A;
  --ink-soft: #2C353D;
  --muted: #67737C;
  --muted-2: #9AA6AE;
  --line: #E2E8EC;
  --card: #FFFFFF;
  --card-2: #F2F6F8;
  --black: #0E1419;
  --bg: #F2F5F7;
  --grad: linear-gradient(135deg, #16B981 0%, #0FA372 50%, #0B7C57 100%);
  --grad-soft: linear-gradient(135deg, #E6F3EE 0%, #DCEEF2 100%);
  --shadow-sm: 0 1px 3px rgba(20,40,55,.06);
  --shadow: 0 12px 34px rgba(20,45,60,.08);
  --shadow-lg: 0 26px 60px rgba(15,40,55,.12);
  --radius: 14px;
  --radius-sm: 9px;
  --avatar-ring: #4FD0A3;
  --blob: rgba(15,163,114,.32);
  --dot-radius: 7px;
  --tag-border: rgba(15,21,26,.10);
  --card-border: 1px solid #E4E9ED;
  --card-shadow: 0 10px 30px rgba(20,45,60,.06);
  --ico-bg: #FFFFFF;
  --ico-radius: 11px;
  --numbadge: rgba(15,163,114,.13);
  --on-dark-muted: #AEB8C0;
  --on-accent-muted: #D6F2E6;`,
  extra: `.card .ico { border: 1px solid var(--line); box-shadow: none; }
.kicker, .eyebrow { letter-spacing: .18em; }`,
}

const DEFS: ThemeDef[] = [AURORA, ATELIER, SOLSTICE, MERIDIAN]

function toTheme(def: ThemeDef): Theme {
  return {
    name: def.name,
    label: def.label,
    description: def.description,
    source: [],
    palette: def.palette,
    typography: {
      headingFont: def.headingFont,
      bodyFont: def.bodyFont,
      fontLinks: [def.importUrl],
    },
    css: buildCss(def.importUrl, def.root, def.extra),
  }
}

// ── Slides de muestra (tokenizadas: ejercitan TODOS los componentes) ──────────
const SAMPLE_SLIDES = `
  <section class="slide cover">
    <div style="width:47%;height:100%;background:var(--grad);position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden">
      <div class="blob" style="width:240px;height:240px;background:rgba(255,255,255,.18);top:-60px;left:-50px;filter:blur(44px)"></div>
      <div class="blob" style="width:160px;height:160px;background:rgba(255,255,255,.12);bottom:40px;right:-30px;filter:blur(40px)"></div>
      <div style="position:relative;width:280px;height:390px;border:2px dashed rgba(255,255,255,.55);border-radius:34px;padding:14px">
        <div class="imgbox" style="width:100%;height:100%;border-radius:24px;box-shadow:var(--shadow-lg)">
          <span class="ph-badge">Imagen · placeholder</span>
        </div>
        <div style="position:absolute;bottom:-20px;left:-18px;background:var(--card);border-radius:14px;padding:10px 14px;box-shadow:var(--shadow);font-weight:800;font-size:13px;color:var(--ink);display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:#4ADE80"></span>Concepto A · B · C
        </div>
      </div>
    </div>
    <div class="col" style="width:53%;justify-content:center;padding:0 80px;position:relative">
      <span class="kicker" style="color:var(--primary-600)">Nombre del Curso · Tema 1</span>
      <h1 style="font-size:50px;margin:20px 0 0">Título de la <span class="vio">presentación</span></h1>
      <p class="lead" style="margin-top:24px;max-width:440px">Descripción breve de la propuesta de valor de este tema educativo.</p>
      <div style="display:flex;align-items:center;gap:18px;margin-top:38px">
        <span class="btn">Comenzar el tema <span class="circ"><svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span></span>
        <span class="tag"><span class="pip"></span>Duración ~15 min</span>
      </div>
      <div style="position:absolute;bottom:46px;left:80px;display:flex;align-items:center;gap:11px">
        <div style="width:24px;height:24px;border-radius:7px;background:var(--grad)"></div>
        <span style="font-weight:800;font-size:14px;color:var(--ink)">Awake Lab · Academia</span>
      </div>
    </div>
  </section>

  <section class="slide intro">
    <div class="brandbar"><div class="brand"><span class="dot"></span>Nombre del Curso</div><span class="num">Introducción</span></div>
    <div class="col" style="width:42%;height:100%;background:var(--primary-soft);align-items:center;justify-content:center;position:relative">
      <div class="blob" style="width:220px;height:220px;background:var(--blob);top:60px;left:-40px;filter:blur(40px)"></div>
      <div class="tutor" style="width:300px;height:300px">
        <span class="ring"></span><span class="ring r2"></span>
        <div class="photo" style="width:300px;height:300px"></div>
        <span class="live"><span class="blink"></span>Tu tutora · en directo</span>
      </div>
      <p style="margin-top:46px;font-weight:700;color:var(--ink);font-size:15px">Voz en off · Bienvenida</p>
    </div>
    <div class="col" style="width:58%;justify-content:center;padding:0 72px">
      <span class="tag"><span class="pip"></span>¡Bienvenidas y bienvenidos!</span>
      <h2 style="font-size:36px;margin:22px 0 0">Tu primer paso hacia el <span class="vio">aprendizaje</span></h2>
      <p class="lead" style="margin-top:22px">Aquí vas a descubrir los fundamentos de este tema con ejemplos prácticos y un ritmo pensado para ti.</p>
      <p class="lead" style="margin-top:16px">En los próximos minutos responderemos a estas preguntas <b>y muchas más</b>.</p>
    </div>
  </section>

  <section class="slide">
    <div class="brandbar"><div class="brand"><span class="dot"></span>Nombre del Curso</div><span class="num">Agenda</span></div>
    <div class="col pad" style="width:100%;justify-content:center">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px">
        <div>
          <span class="kicker" style="color:var(--primary-600)">Lo que vas a explorar</span>
          <h2 style="font-size:38px;margin-top:12px">Los subapartados que veremos son <span class="vio">tres</span></h2>
        </div>
        <p style="max-width:300px;text-align:right;font-weight:500">Quédate hasta el final para descubrir las claves del tema.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px">
        <div class="card" style="padding:34px 32px"><span class="num-badge">1.1</span><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg></div><h3 style="font-size:19px">Primer subapartado</h3><p style="margin-top:10px;font-size:14px">Descripción breve de este primer concepto.</p></div>
        <div class="card violet" style="padding:34px 32px"><span class="num-badge">1.2</span><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div><h3 style="font-size:19px">Segundo subapartado</h3><p style="margin-top:10px;font-size:14px">Modelos y marcos de trabajo clave.</p></div>
        <div class="card dark" style="padding:34px 32px"><span class="num-badge">1.3</span><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M17 8.5a3 3 0 0 1 0 5.8"/></svg></div><h3 style="font-size:19px">Tercer subapartado</h3><p style="margin-top:10px;font-size:14px">Roles y habilidades del equipo.</p></div>
      </div>
    </div>
  </section>

  <section class="slide section-divider">
    <div class="brandbar"><div class="brand light"><span class="dot"></span>Nombre del Curso</div><span class="num" style="color:rgba(255,255,255,.5)">Sección 01</span></div>
    <div class="col" style="width:62%;justify-content:center;padding:0 72px;position:relative;z-index:2">
      <span class="kicker" style="color:var(--primary-300)">Subapartado 1.1</span>
      <h1 style="font-size:52px;color:#fff;margin-top:18px">Título de la primera sección</h1>
      <p style="color:rgba(255,255,255,.7);font-size:19px;margin-top:24px;max-width:520px">Introducción al contenido de esta primera parte del tema.</p>
      <div style="display:flex;gap:12px;margin-top:34px">
        <span class="tag" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)">Concepto A</span>
        <span class="tag" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)">Concepto B</span>
        <span class="tag" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)">Concepto C</span>
      </div>
    </div>
    <div style="position:absolute;right:-30px;top:50%;transform:translateY(-50%);font-family:var(--font-display);font-size:420px;font-weight:var(--w-display);color:rgba(255,255,255,.06);line-height:.8;letter-spacing:-.05em;z-index:1">01</div>
    <div class="blob" style="width:340px;height:340px;background:var(--blob);right:120px;bottom:-120px;filter:blur(48px)"></div>
  </section>

  <section class="slide">
    <div class="brandbar"><div class="brand"><span class="dot"></span>Nombre del Curso</div><span class="num">1.1 · Conceptos</span></div>
    <div class="col" style="width:55%;justify-content:center;padding:0 0 0 72px">
      <span class="tag"><span class="pip"></span>Concepto clave</span>
      <h2 style="font-size:38px;margin:18px 0 0">Nombre del <span class="vio">concepto</span></h2>
      <p class="lead" style="margin-top:20px;max-width:540px">Explicación clara y concisa extraída literalmente del guion del tema.</p>
      <div style="display:flex;gap:40px;margin-top:30px">
        <div><div class="stat" style="font-size:46px">87%</div><p style="font-size:13px;margin-top:6px">de retención media</p></div>
        <div><div class="stat" style="font-size:46px">3×</div><p style="font-size:13px;margin-top:6px">más rápido que antes</p></div>
      </div>
    </div>
    <div style="width:45%;padding:64px 72px 64px 40px;display:flex">
      <div class="imgbox" style="width:100%;height:100%"><span class="ph-badge">Imagen · placeholder</span></div>
    </div>
  </section>

  <section class="slide outro">
    <div class="brandbar"><div class="brand"><span class="dot"></span>Nombre del Curso</div><span class="num">Conclusión</span></div>
    <div class="col" style="width:58%;justify-content:center;padding:0 40px 0 72px">
      <span class="tag"><span class="pip"></span>Hemos recorrido los fundamentos</span>
      <h2 style="font-size:32px;margin:16px 0 0">El aprendizaje es <span class="vio">solo el comienzo</span></h2>
      <p class="lead" style="margin-top:18px;font-size:16px">Resumen de los conceptos principales explorados en este tema.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">
        <div style="display:flex;gap:12px;align-items:center;font-size:14px"><span style="width:18px;height:18px;border-radius:6px;background:var(--grad);flex:none;display:inline-block"></span><span>Concepto clave uno del tema.</span></div>
        <div style="display:flex;gap:12px;align-items:center;font-size:14px"><span style="width:18px;height:18px;border-radius:6px;background:var(--grad);flex:none;display:inline-block"></span><span>Concepto clave dos del tema.</span></div>
      </div>
    </div>
    <div class="col" style="width:42%;height:100%;background:var(--primary-soft);align-items:center;justify-content:center;position:relative">
      <div class="blob" style="width:200px;height:200px;background:var(--blob);bottom:50px;right:-40px;filter:blur(38px)"></div>
      <div class="tutor" style="width:270px;height:270px">
        <span class="ring"></span><span class="ring r2"></span>
        <div class="photo" style="width:270px;height:270px"></div>
        <span class="live"><span class="blink"></span>¡Lo lograste!</span>
      </div>
      <p style="margin-top:42px;font-weight:700;color:var(--ink);font-size:15px">Voz en off · Cierre</p>
    </div>
  </section>

  <section class="slide closing">
    <div class="blob" style="width:320px;height:320px;background:rgba(255,255,255,.14);top:-80px;left:-60px;filter:blur(44px)"></div>
    <div class="blob" style="width:220px;height:220px;background:rgba(255,255,255,.10);bottom:-40px;right:80px;filter:blur(40px)"></div>
    <div class="col" style="width:100%;align-items:center;justify-content:center;text-align:center;padding:0 120px;position:relative;z-index:2">
      <span class="tag" style="background:rgba(255,255,255,.16);color:#fff;border-color:rgba(255,255,255,.28);margin:0 auto">El siguiente paso es tuyo</span>
      <h1 style="font-size:50px;color:#fff;margin-top:24px;max-width:920px">¡Estás listo para aplicar lo aprendido y dar el <span style="color:#FBE9A6">siguiente paso</span>!</h1>
      <div style="display:flex;align-items:center;gap:11px;margin-top:40px"><div style="width:26px;height:26px;border-radius:8px;background:#fff"></div><span style="font-weight:800;font-size:16px;color:#fff">Awake Lab · Academia</span></div>
    </div>
  </section>
`.trim()

// ── Galería de previews ────────────────────────────────────────────────────────
function galleryHtml(themes: Theme[]): string {
  const cards = themes
    .map((t) => {
      const p = t.palette
      const sw = [p.primary, p.card ?? '#fff', p.dark ?? '#111', p.background]
        .map((c) => `<span style="background:${c}"></span>`)
        .join('')
      return `    <a class="card" href="./${t.name}.html">
      <div class="sw">${sw}</div>
      <div class="meta"><h2>${t.label ?? t.name}</h2><p>${t.description ?? ''}</p><code>${t.name}</code></div>
    </a>`
    })
    .join('\n')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Temas · Galería</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;background:#0c0c10;color:#f4f4f6;padding:48px;line-height:1.5}
  h1{font-size:30px;letter-spacing:-.02em;margin-bottom:6px}
  .sub{color:#9a9aa6;margin-bottom:34px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:20px;max-width:1180px}
  .card{display:flex;flex-direction:column;background:#16161d;border:1px solid #26262f;border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .15s,border-color .15s}
  .card:hover{transform:translateY(-3px);border-color:#3a3a46}
  .sw{display:flex;height:90px}
  .sw span{flex:1}
  .meta{padding:20px 22px}
  .meta h2{font-size:19px;letter-spacing:-.01em}
  .meta p{color:#9a9aa6;font-size:13.5px;margin:8px 0 12px}
  .meta code{font-size:12px;color:#7b7b88;background:#0c0c10;padding:3px 9px;border-radius:6px}
</style></head><body>
  <h1>Temas del generador de slides</h1>
  <p class="sub">Abre cada uno para ver el deck de muestra completo. Navega con ← / → o la barra espaciadora.</p>
  <div class="grid">
${cards}
  </div>
</body></html>`
}

// ── Escritura ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const themes = DEFS.map(toTheme)
  const validated: Theme[] = []

  await mkdir(join(ROOT, 'themes'), { recursive: true })
  await mkdir(join(ROOT, 'previews'), { recursive: true })

  for (const theme of themes) {
    const v = ThemeSchema.parse(theme)
    validated.push(v)

    const missing = findMissingSelectors(v.css)
    const status = missing.length ? `⚠ faltan: ${missing.join(', ')}` : 'cubre todos los componentes'

    await writeFile(
      join(ROOT, 'themes', `${v.name}.json`),
      JSON.stringify(v, null, 2),
      'utf8',
    )
    await writeFile(
      join(ROOT, 'previews', `${v.name}.html`),
      renderDeck({ title: `Preview — ${v.label}`, css: v.css, slides: SAMPLE_SLIDES, motion: v.motion }),
      'utf8',
    )
    console.log(`✓ ${v.name.padEnd(12)} → themes/${v.name}.json · previews/${v.name}.html  (${status})`)
  }

  await writeFile(join(ROOT, 'previews', 'index.html'), galleryHtml(validated), 'utf8')
  console.log('✓ previews/index.html (galería)')
}

await main()
