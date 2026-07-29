/**
 * Shell del deck propio: HTML autocontenido con CSS+JS inline, 16:9,
 * transición push horizontal entre slides + cascada de entrada del contenido
 * (GSAP core, CDN), nav flotante tipo cristal, barra de progreso degradada,
 * puntos que se alargan y auto-reescalado.
 * Chrome portado del deck demo de referencia (presentacion-growth-revops.html).
 *
 * Motor de audio (V5): lee window.__DECK_AUDIO__ y window.__DECK_OPTS__ inyectados
 * por el renderer (V6). Si no están presentes el deck se comporta exactamente igual
 * que antes (sin audio, sin controles). Incluye un anillo de cuenta atrás
 * (#audio-timer, esquina inferior derecha) con el tiempo restante del audio del
 * slide activo; se oculta en slides sin audio.
 */

export interface DeckParts {
  title: string
  css: string
  /** Slides ya montadas como `<section class="slide …">…</section>` concatenadas. */
  slides: string
  /** Script tag con window.__DECK_AUDIO__ y window.__DECK_OPTS__, inyectado antes de DECK_JS.
   *  Ausente → deck sin audio (comportamiento previo a V5). */
  audioScript?: string
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
  /* El body es flex: sin esto el stage (1280px) se encoge al ancho del contenedor
     cuando se ve en un iframe estrecho (preview), rompiendo el escalado de fit(). */
  flex: none;
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
  z-index: 1;
  /* Estado base = slide "por delante" (i > cur): espera entrando desde la derecha. */
  transform: translateX(70px);
  transition: opacity .45s ease, transform .62s cubic-bezier(.22, .61, .36, 1);
  display: flex;
}
/* Activa: centrada. Leve retardo de opacidad → entra "a través" de la saliente. */
.slide.active { opacity: 1; pointer-events: auto; transform: translateX(0); z-index: 2; transition: opacity .5s ease .08s, transform .62s cubic-bezier(.22, .61, .36, 1); }
/* "Por detrás" (i < cur): empujada a la izquierda. Dirección automática: al avanzar la
   activa pasa a .prev (sale por la izquierda); al retroceder vuelve a base (sale por la derecha). */
.slide.prev   { opacity: 0; transform: translateX(-70px); }
.slide .notes { display: none; }

/* Accesibilidad: sin desplazamientos si el usuario lo pide (la cascada GSAP también se corta). */
@media (prefers-reduced-motion: reduce) {
  .slide, .slide.active, .slide.prev { transform: none; transition: opacity .3s ease; }
}

/* ── Capa PERSISTENTE en primer plano (#flow) ──────────────────────────────────
   Orbes de glow que NO se reinician entre slides: viajan suavemente de una posición a la
   siguiente al navegar (continuidad entre slides). Van por ENCIMA de la capa del tema
   (z-index 3), muy difusos y a baja opacidad para no tapar el contenido. Color por tokens
   del tema → estilo coherente con el resto de acentos. */
#flow { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
#flow .orb { position: absolute; border-radius: 50%; filter: blur(60px); transform: translate(-50%, -50%); will-change: transform; }
#flow .orb-a { width: 440px; height: 440px; left: 28%; top: 32%; opacity: .18; background: radial-gradient(circle at 42% 42%, var(--primary, #0ABCC9), transparent 68%); }
#flow .orb-b { width: 360px; height: 360px; left: 74%; top: 66%; opacity: .15; background: radial-gradient(circle at 45% 45%, var(--primary-300, #19F7F1), transparent 66%); }
#flow .orb-c { width: 500px; height: 500px; left: 56%; top: 22%; opacity: .12; background: radial-gradient(circle at 50% 50%, var(--primary-600, #0FCED3), transparent 70%); }

/* ── Acentos decorativos en PRIMER PLANO (siempre visibles, incluso sobre slides opacas) ──
   Overlay dentro de #stage, por ENCIMA de las slides (z-index 3), pointer-events:none. Para
   decks que imitan referencias de fondo opaco, el motion de fondo se taparía: esto no. Muy
   sutil. Se alimenta de los tokens del tema (--primary-300…) con fallback a los cianes de marca. */
#decor-fg { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
#decor-fg svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#decor-fg .fg-line { fill: none; stroke: var(--primary-300, #19F7F1); stroke-width: 1.5; opacity: .3; }
#decor-fg .fg-bracket { fill: none; stroke: var(--primary-300, #19F7F1); stroke-width: 2; opacity: .42; stroke-linecap: round; }
#decor-fg .glint {
  position: absolute; width: 7px; height: 7px; border-radius: 50%;
  background: var(--primary-300, #19F7F1); opacity: .22;
  box-shadow: 0 0 12px 2px var(--primary-300, #19F7F1);
}
#decor-fg .g1 { top: 30px; left: 34px; }
#decor-fg .g2 { top: 30px; right: 34px; }
#decor-fg .g3 { bottom: 30px; left: 34px; }
#decor-fg .g4 { bottom: 30px; right: 34px; }
/* Barrido de luz diagonal (token) que cruza el escenario una vez por transición. */
#decor-fg .sweep {
  position: absolute; top: -10%; left: 0; width: 200px; height: 120%;
  background: linear-gradient(90deg, transparent, var(--primary-300, #19F7F1), transparent);
  opacity: 0; filter: blur(12px);
}

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
#nav button:hover  { background: rgba(255, 255, 255, .28); }
#nav button.active { background: rgba(255, 255, 255, .38); }
#nav button svg    { width: 16px; height: 16px; }
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

/* Separador visual entre controles de audio y nav principal */
#audio-controls {
  display: none;
  align-items: center;
  gap: 8px;
  padding-right: 12px;
  border-right: 1px solid rgba(255, 255, 255, .18);
}
/* Botón CC: texto en lugar de SVG */
#btn-cc {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
  width: auto;
  padding: 0 10px;
  border-radius: 999px;
}

/* Overlay de subtítulos (fixed, encima del nav) */
#captions {
  display: none;
  position: fixed;
  bottom: 84px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 70vw;
  background: rgba(8, 7, 14, .72);
  color: #fff;
  padding: 10px 18px;
  border-radius: 12px;
  font-size: 18px;
  line-height: 1.4;
  text-align: center;
  z-index: 55;
  backdrop-filter: blur(6px);
  pointer-events: none;
  opacity: 0;
  transition: opacity .2s;
}
#captions.show { opacity: 1; }

/* Temporizador de audio: anillo con cuenta atrás (fixed esquina inferior derecha).
   Oculto por defecto; el JS lo muestra solo cuando el slide activo tiene audio. */
#audio-timer {
  display: none;
  position: fixed;
  bottom: 22px;
  right: 26px;
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  background: rgba(8, 7, 14, .55);
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 50%;
  backdrop-filter: blur(14px);
  z-index: 50;
  pointer-events: none;
}
#audio-timer svg {
  position: absolute;
  inset: 0;
  width: 52px;
  height: 52px;
  transform: rotate(-90deg);
}
#audio-timer .track {
  fill: none;
  stroke: rgba(255, 255, 255, .22);
  stroke-width: 3;
}
#audio-timer .arc {
  fill: none;
  stroke: #fff;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 144.5;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset .3s linear;
}
#audio-timer-time {
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
}

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

// ── JS inline ─────────────────────────────────────────────────────────────────
// Todo en un único IIFE. El motor de audio es un bloque condicional al final:
// si window.__DECK_AUDIO__ no existe, no activa ningún control y el deck se
// comporta exactamente igual que sin V5.
const DECK_JS = `
(function () {
  'use strict';

  // ── Navegación ──────────────────────────────────────────────────────────────
  var stage  = document.getElementById('stage');
  var slides = Array.from(document.querySelectorAll('.slide'));
  var total  = slides.length;
  var cur    = 0;

  // ── Animación de entrada de contenido (GSAP core, vía CDN) ────────────────────
  // GSAP solo pinta la CASCADA del contenido de la slide activa. La transición ENTRE
  // slides es CSS (fiable, sin depender del CDN ni de reescrituras por frame). Si GSAP
  // no carga, el contenido aparece sin cascada y el deck funciona igual.
  var G        = window.gsap;
  var useGSAP  = !!G;
  var motionOK = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Acentos en primer plano (líneas + destellos en esquinas). Van por ENCIMA de las
  // slides, así que se ven siempre, aunque la slide sea un panel opaco (reproducción de
  // referencias). Se animan en cada cambio de slide.
  var decorFg   = document.getElementById('decor-fg');
  var fgLines   = decorFg ? Array.from(decorFg.querySelectorAll('.fg-line')) : [];
  var fgStrokes = decorFg ? Array.from(decorFg.querySelectorAll('.fg-line, .fg-bracket')) : [];
  var glints    = decorFg ? Array.from(decorFg.querySelectorAll('.glint')) : [];
  var sweep     = decorFg ? decorFg.querySelector('.sweep') : null;
  // "Trazado" de líneas y brackets SIN plugin: stroke-dasharray = longitud del path; luego
  // se anima el dashoffset de len→0. Si no se anima (reduced-motion), quedan dibujados.
  if (useGSAP) {
    fgStrokes.forEach(function (ln) {
      var len = ln.getTotalLength ? ln.getTotalLength() : 1200;
      ln.style.strokeDasharray = String(len);
      ln.setAttribute('data-len', String(len));
    });
    if (sweep) G.set(sweep, { x: -260, opacity: 0 });
    // Respiración continua y sutil de los destellos entre transiciones (da vida al reposo).
    if (motionOK && glints.length) {
      G.to(glints, { opacity: '+=0.13', duration: 2.2, ease: 'sine.inOut', repeat: -1, yoyo: true,
        stagger: { each: 0.4, from: 'random' } });
    }
  }

  // ── Capa PERSISTENTE en primer plano (#flow) ──────────────────────────────────
  // Orbes de glow que NO se reinician entre slides: cada cambio los hace VIAJAR de su
  // posición actual a la del nuevo slide (posición determinista por índice → reversible).
  var flowEl  = document.getElementById('flow');
  var orbs    = flowEl ? Array.from(flowEl.querySelectorAll('.orb')) : [];
  var ORB_CFG = [{ step: 0.9, rad: 150 }, { step: -0.7, rad: 190 }, { step: 1.15, rad: 130 }];
  function flowPos(i) {
    return orbs.map(function (_, k) {
      var c = ORB_CFG[k % ORB_CFG.length];
      return { x: Math.cos(i * c.step + k * 1.3) * c.rad, y: Math.sin(i * c.step * 0.8 + k) * c.rad * 0.66 };
    });
  }
  if (useGSAP && orbs.length) {
    G.set(orbs, { xPercent: -50, yPercent: -50 });
    // Respiración lenta (escala) continua → vida en reposo, sin pelear con el viaje (x/y).
    if (motionOK) {
      orbs.forEach(function (o, k) {
        G.to(o, { scale: 1.12, duration: 6 + k, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: k * 0.6 });
      });
    }
  }

  var dotsEl = document.getElementById('dots');
  slides.forEach(function (_, i) {
    var d = document.createElement('span');
    d.className = 'd';
    d.dataset.i = String(i);
    d.addEventListener('click', function () { unlock(); go(i); });
    if (dotsEl) dotsEl.appendChild(d);
  });
  var dotEls = dotsEl ? Array.from(dotsEl.children) : [];

  function pad(n) { return String(n + 1).padStart(2, '0'); }

  // Hijos "animables" de un nodo: elementos, menos las notas (aside .notes, ocultas).
  function contentKids(node) {
    return Array.prototype.filter.call(node.children, function (el) {
      return !el.classList.contains('notes');
    });
  }

  // Nivel sobre el que cascadear. Si la slide es un ÚNICO envoltorio (p. ej. una columna
  // que abraza todo el contenido), descendemos hasta el primer nivel con varios elementos
  // y cascadeamos ESOS; así el escalonado no se colapsa en un solo bloque.
  function cascadeTargets(active) {
    var els = contentKids(active);
    for (var g = 0; g < 4 && els.length === 1 && els[0].children.length > 0; g++) {
      els = contentKids(els[0]);
    }
    return els;
  }

  // ── Intérprete de coreografía dirigido por spec (data-anim) ───────────────────
  // SEGURIDAD: el deck NUNCA ejecuta código del LLM. El slide trae un atributo
  // data-anim con DATOS (JSON): una lista de pasos { target, effect, delay?, duration?,
  // stagger? }. Este intérprete de confianza los traduce a GSAP. Un efecto fuera del
  // catálogo se ignora; un selector inválido se captura y se salta; los números se
  // clampan. Sin data-anim válido, se cae a la cascada genérica de siempre.
  var ANIM_VIS = { autoAlpha: 1, x: 0, y: 0, scale: 1 };
  var ANIM_FX = {
    fadeIn:    { from: { autoAlpha: 0 } },
    fadeUp:    { from: { autoAlpha: 0, y: 26 } },
    fadeDown:  { from: { autoAlpha: 0, y: -26 } },
    fadeLeft:  { from: { autoAlpha: 0, x: -30 } },
    fadeRight: { from: { autoAlpha: 0, x: 30 } },
    zoomIn:    { from: { autoAlpha: 0, scale: 0.9 } },
    pop:       { from: { autoAlpha: 0, scale: 0.55 }, ease: 'back.out(1.7)' },
    blurIn:    { from: { autoAlpha: 0, filter: 'blur(14px)' }, to: { filter: 'blur(0px)' } }
  };
  function clampNum(v, lo, hi, dflt) {
    v = (typeof v === 'number' && isFinite(v)) ? v : dflt;
    return Math.max(lo, Math.min(hi, v));
  }
  // "Trazado" de un <path>/línea SVG sin plugin: dasharray = longitud, offset len→0.
  function animDrawLine(node, dur, delay) {
    var len = node.getTotalLength ? node.getTotalLength() : 1000;
    G.fromTo(node, { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: dur, delay: delay, ease: 'power2.out', overwrite: 'auto' });
  }
  function runAnimSpec(active, spec) {
    var applied = false;
    for (var i = 0; i < spec.length; i++) {
      var step = spec[i];
      if (!step || typeof step.target !== 'string') continue;
      var nodes;
      try { nodes = active.querySelectorAll(step.target); }
      catch (e) { continue; } // selector inválido → saltar el paso, no romper el resto
      if (!nodes.length) continue;
      var dur   = clampNum(step.duration, 0.1, 4, 0.6);
      var delay = clampNum(step.delay, 0, 6, 0);
      var stgr  = clampNum(step.stagger, 0, 1, 0.08);
      if (step.effect === 'drawLine') {
        Array.prototype.forEach.call(nodes, function (n, k) { animDrawLine(n, dur, delay + k * stgr); });
        applied = true;
        continue;
      }
      var fx = ANIM_FX[step.effect];
      if (!fx) continue; // efecto fuera del catálogo → ignorar
      var toVars = Object.assign({}, ANIM_VIS, fx.to || {},
        { duration: dur, delay: delay, stagger: stgr, ease: fx.ease || 'power2.out', overwrite: 'auto' });
      G.fromTo(nodes, fx.from, toVars);
      applied = true;
    }
    return applied;
  }
  function parseAnimSpec(active) {
    var raw = active.getAttribute && active.getAttribute('data-anim');
    if (!raw) return null;
    try {
      var spec = JSON.parse(raw);
      return (Array.isArray(spec) && spec.length) ? spec : null;
    } catch (e) { return null; }
  }

  // Entrada del contenido de la slide activa. Si el slide trae un spec (data-anim) válido,
  // el LLM gobierna la coreografía; si no, cascada genérica: fade + subida escalonada.
  function animateContent() {
    if (!useGSAP || !motionOK) return;
    var active = slides[cur];
    if (!active) return;
    var spec = parseAnimSpec(active);
    if (spec && runAnimSpec(active, spec)) return;
    var targets = cascadeTargets(active);
    if (!targets.length) return;
    G.fromTo(targets, { autoAlpha: 0, y: 22 },
      { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out', stagger: 0.07, delay: 0.12, overwrite: 'auto' });
  }

  // Acentos en 1er plano (todos con color de TOKEN → encajan con cualquier tema). En cada
  // cambio de slide: las líneas y los brackets de esquina se re-trazan, los destellos dan un
  // "pop" de tamaño y un barrido de luz diagonal cruza el escenario. Al ir por encima del
  // contenido, se ven aunque la slide sea un panel opaco (reproducción de referencias).
  function animateAccents() {
    if (!useGSAP || !motionOK) return;
    fgStrokes.forEach(function (ln) {
      var len = parseFloat(ln.getAttribute('data-len')) || 1200;
      G.fromTo(ln, { strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 0.9, ease: 'power2.out', overwrite: 'auto' });
    });
    // Pop de tamaño de los destellos (la opacidad la gobierna la respiración continua).
    if (glints.length) {
      G.fromTo(glints, { scale: 0.55 }, { scale: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.06, overwrite: 'auto' });
    }
    // Barrido de luz diagonal que cruza una vez.
    if (sweep) {
      G.fromTo(sweep, { x: -260, opacity: 0 },
        { keyframes: [{ opacity: 0.14, duration: 0.3 }, { x: 1340, opacity: 0, duration: 0.75 }],
          ease: 'power1.inOut', overwrite: 'auto' });
    }
  }

  // Los orbes de #flow NO se reinician: viajan de la posición del slide anterior a la del
  // actual al navegar (persistencia + continuidad). El viaje (x/y) convive con la respiración
  // (scale). Con reduced-motion se reposicionan al instante, sin viaje.
  function animateFlow() {
    if (!useGSAP || !orbs.length) return;
    var pos = flowPos(cur);
    orbs.forEach(function (o, k) {
      if (motionOK) G.to(o, { x: pos[k].x, y: pos[k].y, duration: 1.0, ease: 'power2.inOut', overwrite: 'auto' });
      else G.set(o, { x: pos[k].x, y: pos[k].y });
    });
  }

  function render() {
    slides.forEach(function (s, i) {
      s.classList.toggle('active', i === cur);
      s.classList.toggle('prev',   i < cur);
    });
    dotEls.forEach(function (d, i) { d.classList.toggle('on', i === cur); });
    var counter  = document.getElementById('counter');
    var progress = document.getElementById('progress');
    if (counter)  counter.textContent  = pad(cur) + ' / ' + pad(total - 1);
    if (progress) progress.style.width = (total > 1 ? (cur / (total - 1)) * 100 : 100) + '%';
    animateContent();
    animateAccents();
    animateFlow();
    playCurrent(); // no-op cuando no hay audio
  }

  function go(i)  { cur = Math.max(0, Math.min(total - 1, i)); render(); }
  function next() { go(cur + 1); }
  function prev() { go(cur - 1); }

  var btnNext = document.getElementById('next');
  var btnPrev = document.getElementById('prev');
  if (btnNext) btnNext.addEventListener('click', function () { unlock(); next(); });
  if (btnPrev) btnPrev.addEventListener('click', function () { unlock(); prev(); });

  window.addEventListener('keydown', function (e) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); unlock(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key))      { e.preventDefault(); unlock(); prev(); }
    else if (e.key === 'Home') { unlock(); go(0); }
    else if (e.key === 'End')  { unlock(); go(total - 1); }
    else if (e.key === 'p')    { togglePlay(); }
    else if (e.key === 'm')    { toggleMute(); }
    else if (e.key === 'c')    { toggleCC(); }
  });

  function fit() {
    if (!stage) return;
    var sx = window.innerWidth  / 1280;
    var sy = window.innerHeight / 720;
    stage.style.transform = 'scale(' + Math.min(sx, sy) + ')';
  }
  window.addEventListener('resize', fit);
  fit();

  // ── Motor de audio ──────────────────────────────────────────────────────────
  // Lee window.__DECK_AUDIO__ (inyectado por el renderer en V6) y
  // window.__DECK_OPTS__ ({ subtitles: bool }). Si no están, todos los
  // helpers de audio son no-ops y el deck funciona exactamente igual que antes.

  var deckAudioData = window.__DECK_AUDIO__;
  var deckOpts      = window.__DECK_OPTS__ || {};
  var hasAudio      = Array.isArray(deckAudioData) && deckAudioData.some(function (a) { return !!a; });

  // Estado del motor.
  var audioOn    = true;
  var autoAdv    = false;
  var subsOn     = deckOpts.subtitles !== false;
  var muted      = false;
  var unlocked   = false;
  var audioCache = {};
  var prevAudio  = null;

  // Refs DOM (null-safe — pueden no existir en decks sin audio).
  var captionsEl = document.getElementById('captions');
  var audioCtrl  = document.getElementById('audio-controls');
  var btnPlay    = document.getElementById('btn-play');
  var btnMute    = document.getElementById('btn-mute');
  var btnCC      = document.getElementById('btn-cc');
  var btnAuto    = document.getElementById('btn-auto');

  // Temporizador de audio: anillo + cuenta atrás del slide activo.
  var timerEl   = document.getElementById('audio-timer');
  var timerArc  = timerEl ? timerEl.querySelector('.arc') : null;
  var timerTime = document.getElementById('audio-timer-time');
  var TIMER_C   = 144.5; // circunferencia del anillo (2π·23); debe coincidir con stroke-dasharray

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function setTimer(remaining, duration) {
    if (timerTime) timerTime.textContent = fmtTime(remaining);
    if (timerArc) {
      var frac = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
      timerArc.style.strokeDashoffset = String(TIMER_C * (1 - frac));
    }
  }

  function showTimer(on) {
    if (timerEl) timerEl.style.display = on ? 'flex' : 'none';
  }

  // Iconos SVG para el botón play/pausa (se intercambian según estado).
  var SVG_PLAY  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="10" y1="4" x2="10" y2="20"/><line x1="14" y1="4" x2="14" y2="20"/></svg>';

  function syncBtns() {
    if (btnPlay) btnPlay.innerHTML = audioOn ? SVG_PAUSE : SVG_PLAY;
    if (btnMute) btnMute.classList.toggle('active', muted);
    if (btnCC)   btnCC.classList.toggle('active', subsOn);
    if (btnAuto) btnAuto.classList.toggle('active', autoAdv);
  }

  function hideCaption() {
    if (captionsEl) captionsEl.classList.remove('show');
  }

  function getAudio(i) {
    if (!deckAudioData || !deckAudioData[i]) return null;
    if (!audioCache[i]) {
      var a = new Audio(deckAudioData[i].src);
      a.muted = muted;
      audioCache[i] = a;
    }
    return audioCache[i];
  }

  function playCurrent() {
    if (!hasAudio) return;
    var audio = getAudio(cur);

    // Parar el audio anterior.
    if (prevAudio && prevAudio !== audio) {
      prevAudio.pause();
      prevAudio.currentTime = 0;
      prevAudio.ontimeupdate = null;
      prevAudio.onended = null;
      prevAudio.onloadedmetadata = null;
    }
    prevAudio = audio;
    hideCaption();

    if (!audio) { showTimer(false); return; }

    // Temporizador: anillo lleno con la duración total en cuanto haya metadata
    // (con data: URIs base64 llega en milisegundos).
    showTimer(true);
    var refreshTimer = function () {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setTimer(audio.duration - audio.currentTime, audio.duration);
      }
    };
    audio.onloadedmetadata = refreshTimer;
    refreshTimer();

    // Capturar el índice actual para los handlers asíncronos.
    var snapCur = cur;

    audio.ontimeupdate = function () {
      refreshTimer();
      var data = deckAudioData[snapCur];
      if (!data) return;
      var t    = audio.currentTime;
      var cues = data.cues || [];
      var found = null;
      for (var j = 0; j < cues.length; j++) {
        if (t >= cues[j].start && t <= cues[j].end) { found = cues[j]; break; }
      }
      if (found && subsOn) {
        if (captionsEl) { captionsEl.textContent = found.text; captionsEl.classList.add('show'); }
      } else {
        hideCaption();
      }
    };

    audio.onended = function () {
      hideCaption();
      setTimer(0, audio.duration);
      if (autoAdv) {
        if (cur < total - 1) { next(); }
        else { autoAdv = false; syncBtns(); }
      }
    };

    if (audioOn && unlocked) audio.play().catch(function () {});
  }

  // Política de autoplay: el audio no arranca hasta el primer gesto del usuario.
  // unlock() se llama desde los handlers de navegación y controles de audio.
  function unlock() {
    if (hasAudio && !unlocked) { unlocked = true; playCurrent(); }
  }

  function togglePlay() {
    if (!hasAudio) return;
    unlocked = true;
    audioOn = !audioOn;
    var audio = getAudio(cur);
    if (audio) {
      if (audioOn) audio.play().catch(function () {});
      else audio.pause();
    }
    syncBtns();
  }

  function toggleMute() {
    if (!hasAudio) return;
    muted = !muted;
    Object.keys(audioCache).forEach(function (k) { audioCache[k].muted = muted; });
    syncBtns();
  }

  function toggleCC() {
    if (!hasAudio) return;
    subsOn = !subsOn;
    if (!subsOn) hideCaption();
    syncBtns();
  }

  function toggleAuto() {
    if (!hasAudio) return;
    unlocked = true;
    autoAdv = !autoAdv;
    if (autoAdv) {
      audioOn = true;
      var audio = getAudio(cur);
      if (audio) audio.play().catch(function () {});
    }
    syncBtns();
  }

  // Activar controles solo si hay audio real.
  if (hasAudio) {
    if (audioCtrl)  { audioCtrl.style.display = 'flex'; }
    if (captionsEl) { captionsEl.style.display = 'block'; }
    var hintEl = document.querySelector('.hint');
    // Correr el hint a la izquierda: el anillo del temporizador ocupa su esquina.
    if (hintEl) { hintEl.textContent = '← / → · espacio · p m c'; hintEl.style.right = '96px'; }
    syncBtns();
    if (btnPlay) btnPlay.addEventListener('click', togglePlay);
    if (btnMute) btnMute.addEventListener('click', toggleMute);
    if (btnCC)   btnCC.addEventListener('click',   toggleCC);
    if (btnAuto) btnAuto.addEventListener('click', toggleAuto);
  }

  // Hook para el editor externo (no afecta al comportamiento normal del deck).
  window.__deckAudioPause = function () {
    audioOn = false;
    if (prevAudio) prevAudio.pause();
    if (typeof syncBtns === 'function') syncBtns();
  };

  render();
}());
`.trim()

// SVGs para los botones de audio (en el HTML estático; el JS los sobreescribe en runtime).
const SVG_SPEAKER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`
const SVG_DOUBLE_CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,18 12,12 4,6"/><polyline points="12,18 20,12 12,6"/></svg>`
const SVG_PLAY_STATIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"/></svg>`

// GSAP core vía CDN (solo el core: ni la cascada ni el trazado de acentos necesitan plugins:
// el "draw" se hace con stroke-dasharray/offset). Si no carga, window.gsap queda indefinido y
// el deck cae a "sin cascada/acentos" (la transición entre slides es CSS y funciona igual).
// Va síncrono, antes de DECK_JS.
const GSAP_CDN = `<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>`

// Capa persistente en primer plano: orbes de glow que viajan entre slides (no se reinician).
// Va DENTRO de #stage, DESPUÉS de las slides (encima) y ANTES de los acentos crisp.
const FLOW_HTML = `<div id="flow" aria-hidden="true">
  <div class="orb orb-a"></div>
  <div class="orb orb-b"></div>
  <div class="orb orb-c"></div>
</div>`

// Acentos en primer plano: dos líneas de acento (arriba/abajo) que se trazan + cuatro
// destellos en las esquinas que pulsan. Va DENTRO de #stage, DESPUÉS de las slides (encima).
const DECOR_FG_HTML = `<div id="decor-fg" aria-hidden="true">
  <div class="sweep"></div>
  <svg viewBox="0 0 1280 720" preserveAspectRatio="none">
    <path class="fg-line" d="M40,44 H1240"/>
    <path class="fg-line" d="M40,676 H1240"/>
    <path class="fg-bracket" d="M34,64 V34 H64"/>
    <path class="fg-bracket" d="M1246,64 V34 H1216"/>
    <path class="fg-bracket" d="M34,656 V686 H64"/>
    <path class="fg-bracket" d="M1246,656 V686 H1216"/>
  </svg>
  <span class="glint g1"></span><span class="glint g2"></span><span class="glint g3"></span><span class="glint g4"></span>
</div>`

// ── Render de UNA slide, autónomo y estático (para la revisión visual) ──────────
// Documento mínimo 1280×720 con el MISMO BASE_CSS + tema + clases que el deck real
// (\`slide active <slideClass>\`), pero sin nav, barra, audio, GSAP ni acentos: solo el
// contenido sobre su fondo, forzado visible y quieto para capturarlo en un navegador
// headless. Sirve para que Claude VEA la slide y detecte problemas de legibilidad.
export function renderSlideStandalone({
  css,
  slideClass,
  body,
}: {
  css: string
  slideClass?: string
  body: string
}): string {
  const cls = `slide active${slideClass ? ` ${escapeHtml(slideClass)}` : ''}`
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
${BASE_CSS}
${css}
/* Captura: slide visible, quieto y sin recorte de animación. Va al final para ganar. */
#stage { transform: none !important; }
.slide { opacity: 1 !important; transform: none !important; transition: none !important; pointer-events: auto !important; }
</style>
</head>
<body>
<div id="stage"><section class="${cls}">${body}</section></div>
</body>
</html>
`
}

// ── Plantilla HTML ────────────────────────────────────────────────────────────
export function renderDeck({ title, css, slides, audioScript }: DeckParts): string {
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
${FLOW_HTML}
${DECOR_FG_HTML}
</div>
<div id="captions"></div>
<div id="audio-timer">
  <svg viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="23"/><circle class="arc" cx="26" cy="26" r="23"/></svg>
  <span id="audio-timer-time"></span>
</div>
<div id="nav">
  <div id="audio-controls">
    <button id="btn-play" aria-label="Play/pausa">${SVG_PLAY_STATIC}</button>
    <button id="btn-mute" aria-label="Silenciar">${SVG_SPEAKER}</button>
    <button id="btn-cc"   aria-label="Subtítulos">CC</button>
    <button id="btn-auto" aria-label="Reproducir todo">${SVG_DOUBLE_CHEVRON}</button>
  </div>
  <button id="prev" aria-label="Anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
  <span id="counter">01 / 01</span>
  <div id="dots"></div>
  <button id="next" aria-label="Siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
</div>
<div class="hint">← / → · barra espaciadora</div>
${GSAP_CDN}
${audioScript ?? ''}<script>${DECK_JS}</script>
</body>
</html>
`
}
