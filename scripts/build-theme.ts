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

// ── CSS del tema "Timely AI" ─────────────────────────────────────────────────
// Portado del deck standalone (presentacion-growth-revops.html).
// SOLO contiene tipografía + componentes; el chrome (body, #stage, .slide
// estructural, #progress, #nav, #dots, .hint) vive en templates/deck.ts.
const TIMELY_AI_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

:root {
  --primary: #6C4CF1;
  --primary-600: #5B3CE0;
  --primary-300: #A78BFF;
  --primary-100: #EDE8FF;
  --primary-soft: #F4F1FF;
  --ink: #16131F;
  --ink-soft: #2A2636;
  --muted: #6B6880;
  --muted-2: #8E8BA0;
  --line: #E7E5EF;
  --card: #F2F1F6;
  --card-2: #ECEAF3;
  --black: #0C0B10;
  --bg: #FFFFFF;
  --grad: linear-gradient(135deg, #7C5CFC 0%, #5B3CE0 60%, #3F27B8 100%);
  --grad-soft: linear-gradient(135deg, #EFEAFF 0%, #E2D8FF 100%);
  --blob: rgba(108,76,241,.35);
  --shadow-sm: 0 2px 10px rgba(28,20,60,.06);
  --shadow: 0 18px 50px rgba(60,40,140,.14);
  --shadow-lg: 0 30px 70px rgba(40,25,110,.20);
  --radius: 26px;
  --radius-sm: 16px;
  --avatar-ring: var(--primary-300);
}

/* Fondo de slide de contenido (el chrome ya pone position/opacity/transform) */
.slide { background: var(--bg); }

/* Utilidades */
.pad { padding: 64px 72px; }
.col { display: flex; flex-direction: column; }

/* ── Tipografía ─────────────────────────────────────────────────────────── */
h1 { font-weight: 900; letter-spacing: -.03em; line-height: 1.02; color: var(--ink); }
h2 { font-weight: 800; letter-spacing: -.025em; line-height: 1.05; color: var(--ink); }
h3 { font-weight: 800; letter-spacing: -.015em; line-height: 1.12; }
p  { color: var(--muted); line-height: 1.55; font-weight: 400; }
.lead   { font-size: 18px; color: var(--ink-soft); line-height: 1.6; font-weight: 500; }
b, strong { color: var(--ink); font-weight: 700; }
.vio    { color: var(--primary); }
.kicker, .eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--muted-2); }
.stat   { font-weight: 900; letter-spacing: -.03em; color: var(--ink); line-height: 1; }

/* ── Brand bar ──────────────────────────────────────────────────────────── */
.brandbar {
  position: absolute; top: 30px; left: 72px; right: 72px;
  display: flex; align-items: center; justify-content: space-between;
  z-index: 5;
}
.brand { display: flex; align-items: center; gap: 11px; font-weight: 800; font-size: 16px; letter-spacing: -.01em; color: var(--ink); }
.brand .dot { width: 26px; height: 26px; border-radius: 8px; background: var(--grad); box-shadow: var(--shadow-sm); position: relative; }
.brand .dot::after { content: ""; position: absolute; inset: 7px; border-radius: 50%; background: #fff; opacity: .92; }
.brand.light, .brand.light .num { color: #fff; }
.num { font-size: 13px; font-weight: 700; color: var(--muted-2); letter-spacing: .04em; }

/* ── Tags / botones ─────────────────────────────────────────────────────── */
.tag {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-radius: 999px;
  background: var(--primary-soft); color: var(--primary-600);
  font-size: 13px; font-weight: 700; letter-spacing: .02em; width: max-content;
  border: 1px solid #E4DDFF;
}
.tag .pip { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
.btn {
  display: inline-flex; align-items: center; gap: 14px;
  background: var(--black); color: #fff; border-radius: 999px;
  padding: 14px 22px 14px 26px; font-weight: 700; font-size: 15px; width: max-content;
}
.btn .circ { width: 34px; height: 34px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; }
.btn .circ svg { width: 15px; height: 15px; }

/* ── Tarjetas ───────────────────────────────────────────────────────────── */
.card { background: var(--card); border-radius: var(--radius); padding: 30px 32px; position: relative; overflow: hidden; }
.card.dark   { background: var(--black); color: #fff; }
.card.dark h3, .card.dark p { color: #fff; }
.card.dark p  { color: #B9B5CC; }
.card.violet  { background: var(--grad); color: #fff; }
.card.violet h3, .card.violet p { color: #fff; }
.card.violet p { color: #EADFFF; }
.card .ico {
  width: 46px; height: 46px; border-radius: 13px; background: #fff;
  display: flex; align-items: center; justify-content: center; margin-bottom: 18px; box-shadow: var(--shadow-sm);
}
.card.dark .ico, .card.violet .ico { background: rgba(255,255,255,.14); box-shadow: none; }
.card .ico svg { width: 23px; height: 23px; }
.card .num-badge {
  position: absolute; top: 24px; right: 26px; font-size: 46px; font-weight: 900;
  color: rgba(108,76,241,.12); letter-spacing: -.04em; line-height: 1;
}
.card.dark .num-badge   { color: rgba(255,255,255,.10); }
.card.violet .num-badge { color: rgba(255,255,255,.16); }

/* ── Image boxes ────────────────────────────────────────────────────────── */
.imgbox { border-radius: var(--radius); overflow: hidden; background: var(--grad-soft); position: relative; }
.imgbox img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph-badge {
  position: absolute; bottom: 14px; left: 14px;
  background: rgba(12,11,16,.62); color: #fff; font-size: 11px; font-weight: 600;
  padding: 5px 11px; border-radius: 999px; backdrop-filter: blur(6px); letter-spacing: .02em;
}

/* ── Imagen media (fallback sin .imgbox) ────────────────────────────────── */
.media {
  border-radius: var(--radius); background: var(--grad-soft);
  background-size: cover; background-position: center;
  min-height: 320px; flex: 1;
}
.media.dark { background: linear-gradient(135deg, #2a2440, var(--black)); }

/* ── Avatar-tutor ───────────────────────────────────────────────────────── */
.tutor { position: relative; flex: none; }
.tutor .ring {
  position: absolute; inset: -14px; border-radius: 50%;
  border: 2px solid var(--primary-300); opacity: .55;
  animation: pulse 2.6s ease-out infinite;
}
.tutor .ring.r2 { animation-delay: 1.3s; }
@keyframes pulse {
  0%   { transform: scale(.92); opacity: .6; }
  70%  { opacity: 0; }
  100% { transform: scale(1.18); opacity: 0; }
}
.tutor .photo { border-radius: 50%; overflow: hidden; background: var(--grad); box-shadow: var(--shadow-lg); position: relative; z-index: 2; }
.tutor .photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; display: block; }
.tutor .live {
  position: absolute; z-index: 3; bottom: 8px; left: 50%; transform: translateX(-50%);
  background: var(--black); color: #fff; font-size: 12px; font-weight: 700;
  padding: 6px 14px; border-radius: 999px; display: flex; align-items: center; gap: 7px; white-space: nowrap; box-shadow: var(--shadow);
}
.tutor .live .blink { width: 8px; height: 8px; border-radius: 50%; background: #4ADE80; animation: blink 1.4s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }

/* ── Decoración ─────────────────────────────────────────────────────────── */
.blob { position: absolute; border-radius: 50%; filter: blur(2px); z-index: 0; }

/* ── slideClass especiales ──────────────────────────────────────────────── */
.slide.section-divider { background: var(--black); }
.slide.closing         { background: var(--grad); }
`.trim()

const TIMELY_AI_THEME: Theme = {
  name: 'timely-ai',
  label: 'Timely AI',
  description:
    'Deck corporativo moderno: fondo blanco, morado de marca, tarjetas redondeadas, tipografía Inter. Sistema de diseño fiel al deck demo de referencia.',
  source: ['slide01.png', 'slide02.png', 'slide03.png'],
  palette: {
    background: '#FFFFFF',
    text: '#16131F',
    muted: '#6B6880',
    primary: '#6C4CF1',
    card: '#F2F1F6',
    dark: '#0C0B10',
    avatarRing: '#A78BFF',
  },
  typography: {
    headingFont: "'Inter', system-ui, sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
    ],
  },
  css: TIMELY_AI_CSS,
}

// ── Slides de muestra (verifican TODOS los slideClass y componentes) ──────────
const SAMPLE_SLIDES = `
  <section class="slide cover">
    <div style="width:47%;height:100%;background:var(--grad);position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden">
      <div class="blob" style="width:230px;height:230px;background:rgba(255,255,255,.18);top:-60px;left:-50px;filter:blur(40px)"></div>
      <div class="blob" style="width:150px;height:150px;background:rgba(255,255,255,.12);bottom:40px;right:-30px;filter:blur(40px)"></div>
      <div style="position:relative;width:280px;height:390px;border:2px dashed rgba(255,255,255,.5);border-radius:34px;padding:14px;backdrop-filter:blur(2px)">
        <div class="imgbox" style="width:100%;height:100%;border-radius:24px;box-shadow:var(--shadow-lg)">
          <span class="ph-badge">Imagen · placeholder</span>
        </div>
        <div style="position:absolute;top:-24px;right:-22px;width:58px;height:58px;border-radius:18px;background:#fff;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center">
          <div style="width:28px;height:28px;border-radius:8px;background:var(--grad)"></div>
        </div>
        <div style="position:absolute;bottom:-20px;left:-18px;background:#fff;border-radius:14px;padding:10px 14px;box-shadow:var(--shadow);font-weight:800;font-size:13px;color:var(--ink);display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:#4ADE80"></span>Concepto A · B · C
        </div>
      </div>
    </div>
    <div class="col" style="width:53%;justify-content:center;padding:0 80px;position:relative">
      <span class="kicker" style="color:var(--primary-600)">Nombre del Curso · Tema 1</span>
      <h1 style="font-size:50px;margin:20px 0 0">Título de la <span class="vio">Presentación</span></h1>
      <p class="lead" style="margin-top:24px;max-width:440px">Descripción breve de la propuesta de valor de este tema educativo.</p>
      <div style="display:flex;align-items:center;gap:18px;margin-top:38px">
        <span class="btn">Comenzar el tema <span class="circ"><svg viewBox="0 0 24 24" fill="none" stroke="#0C0B10" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span></span>
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
      <div class="blob" style="width:200px;height:200px;background:rgba(108,76,241,.12);top:60px;left:-40px;filter:blur(30px)"></div>
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
      <p class="lead" style="margin-top:22px">Aquí vas a descubrir los fundamentos de este tema. ¿Alguna vez te has preguntado cómo funcionan estos conceptos en la práctica?</p>
      <p class="lead" style="margin-top:16px">En los próximos minutos responderemos a estas preguntas <b>y más</b>.</p>
    </div>
  </section>

  <section class="slide">
    <div class="brandbar"><div class="brand"><span class="dot"></span>Nombre del Curso</div><span class="num">Agenda</span></div>
    <div class="col pad" style="width:100%;justify-content:center">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px">
        <div>
          <span class="kicker" style="color:var(--primary-600)">Lo que vas a explorar</span>
          <h2 style="font-size:38px;margin-top:12px">Los subapartados que exploraremos son <span class="vio">tres</span></h2>
        </div>
        <p style="max-width:300px;text-align:right;font-weight:500">Quédate hasta el final para descubrir las claves del tema.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px">
        <div class="card" style="padding:34px 32px"><span class="num-badge">1.1</span><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="#6C4CF1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg></div><h3 style="font-size:19px;color:var(--ink)">Primer subapartado</h3><p style="margin-top:10px;font-size:14px">Descripción breve de este primer concepto.</p></div>
        <div class="card violet" style="padding:34px 32px"><span class="num-badge">1.2</span><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div><h3 style="font-size:19px">Segundo subapartado</h3><p style="margin-top:10px;font-size:14px">Frameworks y modelos clave.</p></div>
        <div class="card dark" style="padding:34px 32px"><span class="num-badge">1.3</span><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M17 8.5a3 3 0 0 1 0 5.8"/><path d="M20.5 20a4.5 4.5 0 0 0-3-4.2"/></svg></div><h3 style="font-size:19px">Tercer subapartado</h3><p style="margin-top:10px;font-size:14px">Roles y habilidades del equipo.</p></div>
      </div>
    </div>
  </section>

  <section class="slide section-divider">
    <div class="brandbar"><div class="brand light"><span class="dot"></span>Nombre del Curso</div><span class="num" style="color:rgba(255,255,255,.5)">Sección 01</span></div>
    <div class="col" style="width:62%;justify-content:center;padding:0 72px;position:relative;z-index:2">
      <span class="kicker" style="color:var(--primary-300)">Subapartado 1.1</span>
      <h1 style="font-size:52px;color:#fff;margin-top:18px">Título de la primera sección</h1>
      <p style="color:#B9B5CC;font-size:19px;margin-top:24px;max-width:520px">Introducción al contenido de esta primera parte.</p>
      <div style="display:flex;gap:12px;margin-top:34px">
        <span class="tag" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)">Concepto A</span>
        <span class="tag" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)">Concepto B</span>
        <span class="tag" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)">Concepto C</span>
      </div>
    </div>
    <div style="position:absolute;right:-30px;top:50%;transform:translateY(-50%);font-size:420px;font-weight:900;color:rgba(255,255,255,.06);line-height:.8;letter-spacing:-.05em;z-index:1">01</div>
    <div class="blob" style="width:340px;height:340px;background:rgba(108,76,241,.35);right:120px;bottom:-120px;filter:blur(40px)"></div>
  </section>

  <section class="slide">
    <div class="brandbar"><div class="brand"><span class="dot"></span>Nombre del Curso</div><span class="num">1.1 · Conceptos</span></div>
    <div class="col" style="width:55%;justify-content:center;padding:0 0 0 72px">
      <span class="tag"><span class="pip"></span>Concepto clave</span>
      <h2 style="font-size:38px;margin:18px 0 0">Nombre del <span class="vio">concepto</span></h2>
      <p class="lead" style="margin-top:20px;max-width:540px">Explicación clara y concisa extraída literalmente del guion del PDF.</p>
      <p style="margin-top:14px;font-weight:600;color:var(--ink-soft)">Métricas que utiliza:</p>
      <div style="display:flex;gap:12px;margin-top:14px">
        <span class="tag">Métrica A</span><span class="tag">Métrica B</span><span class="tag">Métrica C</span>
      </div>
      <div class="card" style="margin-top:26px;display:flex;align-items:center;gap:16px;padding:20px 24px;max-width:540px">
        <div class="ico" style="margin:0;flex:none"><svg viewBox="0 0 24 24" fill="none" stroke="#6C4CF1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
        <div><b style="font-size:15px">Foco principal</b><p style="font-size:13.5px;margin-top:3px">El elemento diferenciador clave de este concepto.</p></div>
      </div>
    </div>
    <div style="width:45%;padding:64px 72px 64px 40px;display:flex">
      <div class="imgbox" style="width:100%;height:100%;box-shadow:var(--shadow)"><span class="ph-badge">Imagen · placeholder</span></div>
    </div>
  </section>

  <section class="slide">
    <div class="brandbar"><div class="brand"><span class="dot"></span>Nombre del Curso</div><span class="num">1.2 · Frameworks</span></div>
    <div class="col pad" style="width:100%;justify-content:center">
      <div style="text-align:center;max-width:760px;margin:0 auto 28px">
        <span class="tag" style="margin:0 auto"><span class="pip"></span>El framework fundamental</span>
        <h2 style="font-size:38px;margin-top:16px">El modelo <span class="vio">AARRR</span> — funnel pirata</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:11px">
        <div style="display:flex;align-items:center;gap:16px;background:var(--grad);color:#fff;border-radius:14px;padding:16px 22px;width:100%;box-shadow:var(--shadow)"><span style="font-size:24px;font-weight:900;width:34px">A</span><div><b style="color:#fff;font-size:16px">Adquisición</b><span style="color:#EADFFF;font-size:13px;margin-left:8px">Acquisition</span></div></div>
        <div style="display:flex;align-items:center;gap:16px;background:#7B5CF5;color:#fff;border-radius:14px;padding:16px 22px;width:92%;align-self:flex-end;box-shadow:var(--shadow-sm)"><span style="font-size:24px;font-weight:900;width:34px">A</span><div><b style="color:#fff;font-size:16px">Activación</b><span style="color:#EADFFF;font-size:13px;margin-left:8px">Activation</span></div></div>
        <div style="display:flex;align-items:center;gap:16px;background:#9A82F7;color:#fff;border-radius:14px;padding:16px 22px;width:84%;align-self:flex-end"><span style="font-size:24px;font-weight:900;width:34px">R</span><div><b style="color:#fff;font-size:16px">Retención</b><span style="color:#F0EAFF;font-size:13px;margin-left:8px">Retention</span></div></div>
        <div style="display:flex;align-items:center;gap:16px;background:var(--black);color:#fff;border-radius:14px;padding:16px 22px;width:76%;align-self:flex-end"><span style="font-size:24px;font-weight:900;width:34px">R</span><div><b style="color:#fff;font-size:16px">Ingresos</b><span style="color:#B9B5CC;font-size:13px;margin-left:8px">Revenue</span></div></div>
        <div style="display:flex;align-items:center;gap:16px;background:#2A2636;color:#fff;border-radius:14px;padding:16px 22px;width:68%;align-self:flex-end"><span style="font-size:24px;font-weight:900;width:34px">R</span><div><b style="color:#fff;font-size:16px">Referencia</b><span style="color:#B9B5CC;font-size:13px;margin-left:8px">Referral</span></div></div>
      </div>
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
      <div class="blob" style="width:200px;height:200px;background:rgba(108,76,241,.12);bottom:50px;right:-40px;filter:blur(30px)"></div>
      <div class="tutor" style="width:270px;height:270px">
        <span class="ring"></span><span class="ring r2"></span>
        <div class="photo" style="width:270px;height:270px"></div>
        <span class="live"><span class="blink"></span>¡Lo lograste!</span>
      </div>
      <p style="margin-top:42px;font-weight:700;color:var(--ink);font-size:15px">Voz en off · Cierre</p>
    </div>
  </section>

  <section class="slide closing">
    <div class="blob" style="width:300px;height:300px;background:rgba(255,255,255,.12);top:-80px;left:-60px;filter:blur(40px)"></div>
    <div class="blob" style="width:200px;height:200px;background:rgba(255,255,255,.10);bottom:-40px;right:80px;filter:blur(40px)"></div>
    <div class="col" style="width:100%;align-items:center;justify-content:center;text-align:center;padding:0 120px;position:relative;z-index:2">
      <span class="tag" style="background:rgba(255,255,255,.16);color:#fff;border-color:rgba(255,255,255,.28);margin:0 auto">El siguiente paso es tuyo</span>
      <h1 style="font-size:50px;color:#fff;margin-top:24px;max-width:920px">¡Estás listo para aplicar lo aprendido y hacer crecer tu organización!</h1>
      <div style="display:flex;align-items:center;gap:11px;margin-top:40px"><div style="width:26px;height:26px;border-radius:8px;background:#fff"></div><span style="font-weight:800;font-size:16px;color:#fff">Awake Lab · Academia</span></div>
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

  const { loadReferenceImages } = await import('../src/services/references.js')
  const { deriveThemeFromImages, findMissingSelectors } = await import(
    '../src/services/theme-builder.js'
  )

  const refImages = await loadReferenceImages()
  if (!refImages.length) {
    throw new Error('No hay imágenes en references/. Añade al menos una imagen de referencia.')
  }

  const merged = await deriveThemeFromImages(refImages, {
    name: TIMELY_AI_THEME.name,
    label: TIMELY_AI_THEME.label,
    description: TIMELY_AI_THEME.description,
    source: TIMELY_AI_THEME.source,
  })

  const missing = findMissingSelectors(merged.css)
  if (missing.length) {
    console.warn(`⚠ El CSS generado no menciona: ${missing.join(', ')}`)
    console.warn('  Revisa el preview; quizá convenga regenerar o ajustar a mano.')
  } else {
    console.log('✓ El CSS cubre todos los componentes del vocabulario.')
  }

  await writeArtifacts(merged)
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
