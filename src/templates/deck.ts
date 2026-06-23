/**
 * Shell del deck propio: HTML autocontenido con CSS+JS inline, 16:9,
 * transición fade/scale, nav flotante tipo cristal, barra de progreso
 * degradada, puntos que se alargan y auto-reescalado.
 * Chrome portado del deck demo de referencia (presentacion-growth-revops.html).
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

// ── CSS base (chrome estructural; el tema aporta tipografía y componentes) ────
const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #0E0C16;
  color: #16131F;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
}
#stage {
  position: relative;
  width: 1280px;
  height: 720px;
  transform-origin: center center;
}
.slide {
  position: absolute;
  inset: 0;
  width: 1280px;
  height: 720px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transform: scale(.985);
  transition: opacity .5s ease, transform .5s ease;
  display: flex;
}
.slide.active { opacity: 1; pointer-events: auto; transform: scale(1); z-index: 2; }
.slide.prev   { opacity: 0; transform: scale(1.01); }
.slide .notes { display: none; }

/* Barra de progreso (degradada, fixed arriba) */
#progress {
  position: fixed;
  top: 0; left: 0;
  height: 4px;
  background: var(--grad, linear-gradient(90deg, #7C5CFC, #5B3CE0));
  z-index: 50;
  transition: width .4s ease;
}

/* Nav flotante (cristal, fixed abajo-centro) */
#nav {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, .10);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, .16);
  padding: 9px 16px;
  border-radius: 999px;
}
#nav button {
  background: rgba(255, 255, 255, .14);
  border: none;
  color: #fff;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .2s;
}
#nav button:hover { background: rgba(255, 255, 255, .28); }
#nav button svg  { width: 16px; height: 16px; }
#counter {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: .04em;
  min-width: 54px;
  text-align: center;
}
#dots { display: flex; gap: 7px; align-items: center; }
#dots .d {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .30);
  cursor: pointer;
  transition: all .25s;
}
#dots .d.on { background: #fff; width: 22px; border-radius: 999px; }

/* Hint teclado (fixed esquina inferior derecha) */
.hint {
  position: fixed;
  bottom: 26px;
  right: 26px;
  color: rgba(255, 255, 255, .45);
  font-size: 12px;
  z-index: 50;
  font-weight: 500;
}
@media (max-width: 640px) { .hint { display: none; } }
`.trim()

// ── JS inline (portado del deck demo; sin dependencias externas) ──────────────
const DECK_JS = `
(function () {
  'use strict';
  var stage    = document.getElementById('stage');
  var slides   = Array.from(document.querySelectorAll('.slide'));
  var total    = slides.length;
  var cur      = 0;

  var dotsEl = document.getElementById('dots');
  slides.forEach(function (_, i) {
    var d = document.createElement('span');
    d.className = 'd';
    d.dataset.i = String(i);
    d.addEventListener('click', function () { go(i); });
    if (dotsEl) dotsEl.appendChild(d);
  });
  var dotEls = dotsEl ? Array.from(dotsEl.children) : [];

  function pad(n) { return String(n + 1).padStart(2, '0'); }

  function render() {
    slides.forEach(function (s, i) {
      s.classList.toggle('active', i === cur);
      s.classList.toggle('prev',   i < cur);
    });
    dotEls.forEach(function (d, i) { d.classList.toggle('on', i === cur); });
    var counter  = document.getElementById('counter');
    var progress = document.getElementById('progress');
    if (counter)  counter.textContent        = pad(cur) + ' / ' + pad(total - 1);
    if (progress) progress.style.width       = (total > 1 ? (cur / (total - 1)) * 100 : 100) + '%';
  }

  function go(i)  { cur = Math.max(0, Math.min(total - 1, i)); render(); }
  function next() { go(cur + 1); }
  function prev() { go(cur - 1); }

  var btnNext = document.getElementById('next');
  var btnPrev = document.getElementById('prev');
  if (btnNext) btnNext.addEventListener('click', next);
  if (btnPrev) btnPrev.addEventListener('click', prev);

  window.addEventListener('keydown', function (e) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key))      { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { go(0); }
    else if (e.key === 'End')  { go(total - 1); }
  });

  function fit() {
    if (!stage) return;
    var sx = window.innerWidth  / 1280;
    var sy = window.innerHeight / 720;
    stage.style.transform = 'scale(' + Math.min(sx, sy) + ')';
  }
  window.addEventListener('resize', fit);
  fit();
  render();
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
<div id="progress"></div>
<div id="stage">
${slides}
</div>
<div id="nav">
  <button id="prev" aria-label="Anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
  <span id="counter">01 / 01</span>
  <div id="dots"></div>
  <button id="next" aria-label="Siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
</div>
<div class="hint">← / → · barra espaciadora</div>
<script>${DECK_JS}</script>
</body>
</html>
`
}
