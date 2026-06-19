/**
 * Shell del deck propio: HTML autocontenido con CSS+JS inline, 16:9,
 * navegación por teclado/flechas, barra de progreso, contador, puntos
 * y auto-reescalado. No depende de reveal.js ni de ninguna librería externa.
 */

export interface DeckParts {
  title: string
  css: string
  /** Slides ya montadas como `<section class="slide …">…</section>` concatenadas. */
  slides: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ── CSS base (estructura; el tema aporta lo visual) ──────────────────────────
const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  overflow: hidden;
}

/* Stage se escala para llenar el viewport manteniendo 16:9 */
.stage {
  width: 1280px;
  height: 720px;
  transform-origin: center center;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.deck {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.slide {
  position: absolute;
  inset: 0;
  display: none;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.slide.active { display: flex; }

/* Notas del ponente: ocultas (reservadas para un futuro modo presentador). */
.slide .notes { display: none; }

/* Avatar — máscara circular + anillo de marca.
   Selector con especificidad (.slide img.avatar) para mandar SIEMPRE sobre el
   tema: el tamaño y el anillo son estructurales, el tema solo aporta el color
   vía --avatar-ring. */
.slide img.avatar {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  object-fit: cover;
  object-position: center top;
  border: 5px solid var(--avatar-ring, var(--primary, #6d3ce6));
  box-shadow:
    0 0 0 3px rgba(255,255,255,0.07),
    0 0 0 9px color-mix(in srgb, var(--avatar-ring, var(--primary, #6d3ce6)) 28%, transparent),
    0 4px 24px rgba(0,0,0,0.35);
  display: block;
  flex-shrink: 0;
}

/* Número gigante del divisor de sección. Tamaño estructural (el deck lo posee);
   el color sale de currentColor del .slide.section-divider que define el tema. */
.slide .section-num {
  font-size: 150px;
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.04em;
  opacity: 0.16;
}

/* Barra inferior (navegación) */
.bar {
  flex-shrink: 0;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  background: rgba(0,0,0,0.18);
  backdrop-filter: blur(6px);
}

.btn-nav {
  flex-shrink: 0;
  background: none;
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.75);
  width: 30px;
  height: 30px;
  border-radius: 6px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-nav:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
.btn-nav:disabled { opacity: 0.25; cursor: default; }

.dots {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  overflow: hidden;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255,255,255,0.28);
  border: none;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.2s, transform 0.2s;
}

.dot.active {
  background: rgba(255,255,255,0.9);
  transform: scale(1.35);
}

.counter {
  flex-shrink: 0;
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: right;
  font-family: system-ui, sans-serif;
}

/* Barra de progreso */
.progress-bar {
  flex-shrink: 0;
  height: 3px;
  background: rgba(255,255,255,0.08);
}

.progress-fill {
  height: 100%;
  background: var(--primary, #6d3ce6);
  transition: width 0.3s ease;
  width: 0%;
}
`.trim()

// ── JS inline (sin dependencias externas) ────────────────────────────────────
const DECK_JS = `
(function () {
  'use strict';
  var slides = Array.from(document.querySelectorAll('.slide'));
  var dotsEl = document.querySelector('.dots');
  var counterEl = document.querySelector('.counter');
  var fillEl = document.querySelector('.progress-fill');
  var prevBtn = document.querySelector('.btn-prev');
  var nextBtn = document.querySelector('.btn-next');
  var cur = 0;

  slides.forEach(function (_, i) {
    var d = document.createElement('button');
    d.className = 'dot';
    d.setAttribute('aria-label', 'Slide ' + (i + 1));
    d.addEventListener('click', function () { go(i); });
    if (dotsEl) dotsEl.appendChild(d);
  });

  function update() {
    slides.forEach(function (s, i) { s.classList.toggle('active', i === cur); });
    if (dotsEl) dotsEl.querySelectorAll('.dot').forEach(function (d, i) { d.classList.toggle('active', i === cur); });
    if (counterEl) counterEl.textContent = (cur + 1) + ' / ' + slides.length;
    if (fillEl) fillEl.style.width = ((cur + 1) / slides.length * 100) + '%';
    if (prevBtn) prevBtn.disabled = cur === 0;
    if (nextBtn) nextBtn.disabled = cur === slides.length - 1;
  }

  function go(n) {
    cur = Math.max(0, Math.min(n, slides.length - 1));
    update();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); go(cur + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1); }
  });

  if (prevBtn) prevBtn.addEventListener('click', function () { go(cur - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { go(cur + 1); });

  var stage = document.querySelector('.stage');
  function scale() {
    if (!stage) return;
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    stage.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', scale);
  scale();
  update();
}());
`.trim()

// ── Plantilla HTML ────────────────────────────────────────────────────────────
export function renderDeck({ title, css, slides }: DeckParts): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${BASE_CSS}
${css}
</style>
</head>
<body>
<div class="stage">
  <div class="deck">
${slides}
  </div>
  <div class="bar">
    <button class="btn-nav btn-prev" aria-label="Anterior">&#8249;</button>
    <div class="dots"></div>
    <button class="btn-nav btn-next" aria-label="Siguiente">&#8250;</button>
    <div class="counter"></div>
  </div>
  <div class="progress-bar"><div class="progress-fill"></div></div>
</div>
<script>${DECK_JS}</script>
</body>
</html>
`
}
