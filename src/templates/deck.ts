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
 *
 * Capa de movimiento por tema (#mo / #mo-tx): la decoración en primer plano ya no está
 * hardcodeada aquí. El tema declara su firma (preset del catálogo o SVG propio saneado) y
 * este módulo la monta y la anima con el vocabulario `mo-*`. Catálogo y contrato: motion.ts.
 */
import {
  renderMotionCss,
  renderMotionHtml,
  renderMotionScript,
  resolveMotion,
  type ThemeMotion,
} from './motion.js'

export interface DeckParts {
  title: string
  css: string
  /** Slides ya montadas como `<section class="slide …">…</section>` concatenadas. */
  slides: string
  /** Script tag con window.__DECK_AUDIO__ y window.__DECK_OPTS__, inyectado antes de DECK_JS.
   *  Ausente → deck sin audio (comportamiento previo a V5). */
  audioScript?: string
  /** Firma de movimiento del tema (`theme.motion`, con el SVG ya saneado).
   *  Ausente → firma histórica del deck: frame + sweep + push + orbes. */
  motion?: ThemeMotion
  /**
   * Semilla para elegir la composición del kit de decoración (una de 10). `renderSlides` la
   * construye con el nombre del tema y el título del deck, así que dos decks distintos casi
   * nunca coinciden y el MISMO deck re-renderizado sale idéntico (no hay `Math.random()`).
   * Ausente → se usa el título; si tampoco hay, la primera composición.
   */
  motionSeed?: string
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

/* Accesibilidad: sin desplazamientos si el usuario lo pide (la cascada GSAP también se corta).
   Va con !important A PROPÓSITO: las variantes de transición de slide del tema
   (body.tx-scale .slide…, motion.ts) se emiten DESPUÉS y con más especificidad, así que sin
   !important esta guarda pierde y en modo "reduce" las slides seguirían desplazándose.
   Misma razón para la capa de movimiento: cubre también el CSS que escriba el tema. */
@media (prefers-reduced-motion: reduce) {
  .slide, .slide.active, .slide.prev {
    transform: none !important;
    transition: opacity .3s ease !important;
  }
  #mo, #mo *, #mo-tx, #mo-tx *, #flow, #flow * {
    animation: none !important;
    transition: none !important;
  }
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

/* La decoración en PRIMER PLANO ya no vive aquí: es la capa de movimiento POR TEMA
   (#mo overlay + #mo-tx cortina), y su CSS lo emite renderMotionCss() con el preset
   elegido — o lo escribe el propio tema si trae su SVG. Ver templates/motion.ts. */

/* Barra de progreso (degradada, fixed arriba) */
#progress {
  position: fixed;
  top: 0; left: 0;
  height: 4px;
  background: var(--grad, linear-gradient(90deg, #7C5CFC, #5B3CE0));
  z-index: 50;
  transition: width .4s ease;
}

/* Nav flotante (fixed abajo-centro).
   El chrome va SIEMPRE en oscuro translúcido, nunca en blanco: un velo blanco con
   iconos blancos desaparecía sobre las slides claras (fondo --bg, tarjetas .card…).
   En oscuro se lee sobre cualquier fondo, igual que #captions y #audio-timer.
   El borde lleva dos capas —línea clara por dentro, halo oscuro por fuera— para que
   el contorno del pill se distinga tanto sobre blanco como sobre negro. */
#nav {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(10, 9, 18, .72);
  backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, .2);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .34), 0 1px 3px rgba(0, 0, 0, .28);
  padding: 9px 16px;
  border-radius: 999px;
}
#nav button {
  background: rgba(255, 255, 255, .16);
  border: none;
  color: #fff;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .2s, box-shadow .2s;
}
#nav button:hover  { background: rgba(255, 255, 255, .30); }
/* Estado activo (mute / CC / auto): además del relleno, un aro para que se distinga
   del hover incluso mirando de lejos. */
#nav button.active {
  background: rgba(255, 255, 255, .42);
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .85);
}
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
  background: rgba(255, 255, 255, .38);
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
  background: rgba(10, 9, 18, .72);
  border: 1px solid rgba(255, 255, 255, .2);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .34), 0 1px 3px rgba(0, 0, 0, .28);
  border-radius: 50%;
  backdrop-filter: blur(16px) saturate(140%);
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

/* Avatar en vídeo (HeyGen): ocupa el hueco de la foto que sustituye. Sin acoplar a
   .tutor .photo, porque en modo libre Claude estructura el avatar como quiera y ahí el
   vídeo se quedaba en 1x1 (display:inline por defecto). Cualquier width/height inline
   heredado del <img> original gana a esta regla. */
video[data-avatar-video] { width: 100%; height: 100%; object-fit: cover; display: block; }

/* Hint teclado (fixed esquina inferior derecha). Va en su propio pill oscuro por lo
   mismo que el nav: como texto blanco suelto era ilegible sobre slides claras. */
.hint {
  position: fixed;
  bottom: 24px;
  right: 26px;
  color: rgba(255, 255, 255, .88);
  font-size: 12px;
  z-index: 50;
  font-weight: 500;
  background: rgba(10, 9, 18, .72);
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 999px;
  padding: 4px 11px;
  backdrop-filter: blur(10px);
  pointer-events: none;
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

  // ── Capa de movimiento POR TEMA (#mo overlay + #mo-tx cortina) ───────────────
  // El tema declara su firma en JSON (themes/*.json → motion) y el renderer la deja aquí
  // como DATOS. El SVG (preset del catálogo o firma propia ya saneada) está inline en #mo:
  // este intérprete NO lo conoce, solo sabe reaccionar al vocabulario de clases mo-* con
  // que vienen marcados sus nodos. El AMBIENTE (deriva, respiración, rotación lenta) es
  // CSS y no pasa por aquí: si el CDN de GSAP cae, la capa sigue viva.
  var M      = window.__DECK_MOTION__ || {};
  var moI    = clampNum(M.intensity, 0, 1, 0.6);   // --mo-i:     opacidad/amplitud global
  var moS    = clampNum(M.speed, 0.5, 2, 1);       // --mo-speed: multiplicador de duración
  var moEl   = document.getElementById('mo');
  var moTxEl = document.getElementById('mo-tx');
  if (stage) {
    stage.style.setProperty('--mo-i', String(moI));
    stage.style.setProperty('--mo-speed', String(moS));
  }

  // Los querySelectorAll del vocabulario se resuelven UNA vez; en cada transición solo se
  // lanzan tweens sobre los arrays ya cacheados.
  function moQ(sel) { return moEl ? Array.prototype.slice.call(moEl.querySelectorAll(sel)) : []; }
  var moDrawEls   = moQ('.mo-draw');
  var moPopEls    = moQ('.mo-pop');
  var moShiftEls  = moQ('.mo-shift');
  var moSpinEls   = moQ('.mo-spin');
  var moFadeEls   = moQ('.mo-fade');
  var moScanEls   = moQ('.mo-scan');
  var moTravelEls = moQ('.mo-travel');

  if (useGSAP) {
    // "Trazado" sin plugin: dasharray = longitud del path, luego dashoffset len→0. Si no
    // se anima (reduced-motion), los trazos quedan dibujados. getTotalLength solo existe en
    // elementos con geometría, así que se comprueba antes de llamar.
    moDrawEls.forEach(function (n) {
      if (!n.getTotalLength) return;
      var len = 0;
      try { len = n.getTotalLength(); } catch (e) { return; }
      if (!len) return;
      n.style.strokeDasharray = String(len);
      n.setAttribute('data-mo-len', String(len));
    });
    // Opacidad de reposo de los nodos .mo-fade: el pulso multiplica ESE valor (que lo fija
    // el CSS del preset o del tema), en vez de imponer uno desde el JS.
    moFadeEls.forEach(function (n) {
      var op = 1;
      try { op = parseFloat(window.getComputedStyle(n).opacity); } catch (e) {}
      n.setAttribute('data-mo-op', String(isFinite(op) ? op : 1));
    });
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

  // ── Vocabulario mo-*: una rutina por marca ────────────────────────────────────
  // Cada función reacciona al cambio de slide sobre los nodos que llevan su clase, en la
  // dirección de la navegación (dir: +1 avanzar, −1 retroceder). Los presets del repo y el
  // SVG libre de un tema se escriben con el MISMO vocabulario → una sola rutina para todos.
  // Todas las duraciones se multiplican por moS (--mo-speed).

  // .mo-draw — re-trazado: dashoffset len→0 (y −len→0 al retroceder, para que el trazo
  // entre por el otro extremo). Filetes, brackets, conectores, arcos.
  function moDraw(dir) {
    // Escalonado en el sentido de la navegación: con una decoración rica (los presets
    // llevan entre 4 y 17 trazos marcados) arrancarlos todos en el mismo frame se lee
    // como un parpadeo; en cascada se lee como un gesto. El paso se reparte para que el
    // último trazo no arranque más tarde de 0,45 s, o la reacción sobreviviría a la
    // transición de slide.
    var n = moDrawEls.length;
    var step = n > 1 ? Math.min(0.05, 0.45 / (n - 1)) : 0;
    moDrawEls.forEach(function (el, k) {
      var len = parseFloat(el.getAttribute('data-mo-len'));
      if (!len) return;
      G.fromTo(el, { strokeDashoffset: dir < 0 ? -len : len },
        { strokeDashoffset: 0, duration: 0.9 * moS, delay: (dir < 0 ? n - 1 - k : k) * step * moS,
          ease: 'power2.out', overwrite: 'auto' });
    });
  }

  // .mo-pop — scale 0,55 → 1 con rebote. Puntos, destellos, nodos.
  function moPop(dir) {
    if (!moPopEls.length) return;
    G.fromTo(moPopEls, { scale: 0.55 },
      { scale: 1, duration: 0.5 * moS, ease: 'back.out(2)', overwrite: 'auto',
        stagger: { each: 0.06 * moS, from: dir < 0 ? 'end' : 'start' } });
  }

  // .mo-shift — salto de fase horizontal. Cintas, bandas, ondas.
  // La fase es una función del contador de navegación (como flowPos con los orbes) en vez de
  // un x += 120·dir acumulado: así el desplazamiento es REVERSIBLE, determinista y acotado
  // (acumulando, 20 slides seguidas se llevarían la cinta fuera del escenario).
  var moPhase = 0;
  function moShift(dir) {
    if (!moShiftEls.length) return;
    moPhase += dir;
    moShiftEls.forEach(function (n, k) {
      var amp = 120 * (1 - (k % 3) * 0.22);
      G.to(n, { x: Math.sin(moPhase * 0.9 + k * 1.1) * amp,
        duration: 1.1 * moS, ease: 'power2.inOut', overwrite: 'auto' });
    });
  }

  // .mo-spin — rotación ±18° según la dirección, con origen en el centro del bbox
  // (el default de GSAP para SVG). Arcos y anillos.
  function moSpin(dir) {
    moSpinEls.forEach(function (n, k) {
      var rot = (parseFloat(n.getAttribute('data-mo-rot')) || 0) + 18 * dir * (k % 2 ? -1 : 1);
      n.setAttribute('data-mo-rot', String(rot));
      G.to(n, { rotation: rot, duration: 0.9 * moS, ease: 'back.out(1.4)', overwrite: 'auto' });
    });
  }

  // .mo-fade — pulso de opacidad sobre su valor de REPOSO (el que fija el CSS del preset o
  // del tema) y vuelta. Rejillas, tramas. El factor es 1,35 y no más: el preset dimensiona
  // su opacidad de reposo para que ni el pico del pulso pase del tope de 0,18 sobre foto.
  function moFade() {
    moFadeEls.forEach(function (n) {
      var op = parseFloat(n.getAttribute('data-mo-op'));
      if (!isFinite(op)) op = 1;
      G.fromTo(n, { opacity: Math.min(1, op * 1.35) },
        { opacity: op, duration: 0.6 * moS, ease: 'power2.out', overwrite: 'auto' });
    });
  }

  // .mo-scan — cruza el escenario en el eje de dir. Líneas de escaneo.
  function moScan(dir) {
    if (!moScanEls.length) return;
    var from = dir < 0 ? 1408 : -128, to = dir < 0 ? -128 : 1408;
    G.fromTo(moScanEls, { x: from, opacity: 0 },
      { keyframes: [{ opacity: 0.5 * moI, duration: 0.18 * moS },
                    { x: to, opacity: 0, duration: 0.9 * moS }],
        ease: 'power1.inOut', overwrite: 'auto',
        // Con más de una barra, la segunda va por detrás → el barrido deja rastro.
        stagger: { each: 0.08 * moS, from: dir < 0 ? 'end' : 'start' } });
  }

  // .mo-travel — VIAJE por índice de slide. Es la única marca del vocabulario que no vuelve
  // a su sitio: cada slide tiene su posición y navegar lleva la pieza de una a la siguiente,
  // igual que los orbes de #flow. Es lo que hace que la capa acompañe al deck en vez de dar
  // un respingo y quedarse quieta: en la slide 6 la decoración está en otro sitio que en la 1.
  //
  // Determinista por (índice de slide, índice de pieza), no acumulado: retroceder devuelve
  // EXACTAMENTE la posición anterior, y 40 slides seguidas no se llevan nada fuera del
  // escenario. Cada pieza usa su propia fase y amplitud → las piezas no viajan en bloque
  // (que se leería como que se mueve la capa entera), sino con parallax.
  //
  // Ojo: .mo-travel escribe transform, así que NO se combina con .mo-shift (x) ni .mo-spin
  // (rotation) en el mismo nodo, ni con un @keyframes CSS que anime transform (gotcha 4 de
  // motion.ts). En los presets del repo van siempre en nodos distintos.
  // Solo x/y, sin rotación, igual que el viaje de los orbes. La rotación se probó y se quitó:
  // GSAP la hornea en la matriz con el origen derivado del bbox, y en las piezas grandes (un
  // velo de 300 px) eso reintroduce en cada salto un error de unos 5 px que NO converge, así
  // que ir y volver no devolvía la misma posición. Además es redundante: quien gira es
  // .mo-spin, que sí acumula de forma reversible.
  function moTravelPos(i, k) {
    var a = i * 0.62 + k * 2.4;
    return {
      x: Math.cos(a) * (26 + (k % 3) * 13),
      y: Math.sin(a * 0.78 + k * 0.7) * (15 + (k % 2) * 9)
    };
  }
  function moTravel() {
    if (!useGSAP || !moTravelEls.length) return;
    moTravelEls.forEach(function (n, k) {
      var p = moTravelPos(cur, k);
      // Duraciones largas y desfasadas: el viaje tiene que leerse como deriva, no como un
      // salto. Se sale del compás de la transición de slide a propósito.
      if (motionOK) G.to(n, { x: p.x, y: p.y,
        duration: (1.6 + (k % 3) * 0.35) * moS, ease: 'power2.inOut', overwrite: 'auto' });
      else G.set(n, p);
    });
  }

  // ── Cortinas (#mo-tx): reaccionan a la DIRECCIÓN de la navegación ─────────────
  // Todas arrancan y acaban en opacity 0, así que sin GSAP no se ven (el CSS las deja
  // invisibles). El pico de opacidad se ata a --mo-i y nunca pasa de 0,22: la cortina no
  // puede llegar a tapar el contenido ni teñir una foto o el vídeo del avatar.
  function moPeak(max) { return Math.min(0.22, max * (moI / 0.6)); }
  function moTxQ(sel) { return moTxEl ? moTxEl.querySelector(sel) : null; }

  var MOTION_TX = {
    // Barrido diagonal de luz que cruza una vez (el histórico del deck).
    sweep: function (dir) {
      var el = moTxQ('.mo-sweep');
      if (!el) return;
      G.fromTo(el, { x: dir < 0 ? 1340 : -260, opacity: 0 },
        { keyframes: [{ opacity: moPeak(0.14), duration: 0.3 * moS },
                      { x: dir < 0 ? -260 : 1340, opacity: 0, duration: 0.75 * moS }],
          ease: 'power1.inOut', overwrite: 'auto' });
    },
    // Banda de degradado inclinada que cruza en el sentido de dir.
    wipe: function (dir) {
      var el = moTxQ('.mo-wipe');
      if (!el) return;
      G.fromTo(el, { xPercent: dir < 0 ? 260 : -260, skewX: -12, opacity: moPeak(0.22) },
        { xPercent: dir < 0 ? -260 : 260, opacity: 0, duration: 0.55 * moS,
          ease: 'power2.inOut', overwrite: 'auto' });
    },
    // Anillo que se expande desde el centro (o se contrae al retroceder).
    iris: function (dir) {
      var el = moTxQ('.mo-iris circle');
      if (!el) return;
      var a = dir < 0 ? 900 : 0, b = dir < 0 ? 0 : 900;
      G.fromTo(el, { attr: { r: a, 'stroke-width': 40 }, opacity: moPeak(0.22) },
        { attr: { r: b, 'stroke-width': 0 }, opacity: 0, duration: 0.7 * moS,
          ease: 'power2.out', overwrite: 'auto' });
    },
    // Seis barras verticales que entran escalonadas y salen por el lado contrario.
    stripes: function (dir) {
      var els = moTxEl ? Array.prototype.slice.call(moTxEl.querySelectorAll('.mo-stripes i')) : [];
      if (!els.length) return;
      G.fromTo(els, { yPercent: dir < 0 ? 100 : -100, opacity: moPeak(0.12) },
        { keyframes: [{ yPercent: 0, duration: 0.28 * moS },
                      { yPercent: dir < 0 ? -100 : 100, opacity: 0, duration: 0.32 * moS }],
          ease: 'power2.inOut', overwrite: 'auto',
          stagger: { each: 0.04 * moS, from: dir < 0 ? 'end' : 'start' } });
    }
  };

  // Reacción completa de la capa a un cambio de slide. dir 0 (ir al slide ya activo) no
  // dispara nada: ni vocabulario ni cortina.
  function animateMotion(dir) {
    if (!useGSAP || !motionOK || !dir) return;
    moDraw(dir); moPop(dir); moShift(dir); moSpin(dir); moFade(dir); moScan(dir);
    var tx = MOTION_TX[M.transition];
    if (typeof tx === 'function') tx(dir);
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

  // dir: +1 se avanza, −1 se retrocede, 0 no hay salto (mismo slide). La capa de
  // movimiento es lo único que lo usa; el resto del render es igual en los dos sentidos.
  function render(dir) {
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
    animateMotion(dir === undefined ? 1 : dir);
    // El viaje va FUERA de animateMotion: no depende de la dirección y tiene que colocar la
    // capa también en el primer render (dir 0), igual que animateFlow con los orbes.
    moTravel();
    animateFlow();
    playCurrent(); // no-op cuando no hay audio
  }

  function go(i)  {
    var n   = Math.max(0, Math.min(total - 1, i));
    var dir = n > cur ? 1 : n < cur ? -1 : 0;
    cur = n;
    render(dir);
  }
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
  var hasAvatarVideo = document.querySelector('video[data-avatar-video]') !== null;
  var hasAudio      = (Array.isArray(deckAudioData) && deckAudioData.some(function (a) { return !!a; }))
    || hasAvatarVideo;

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

  // Elemento "de audio" de la slide i: si trae un <video data-avatar-video> (avatar
  // HeyGen con lip-sync), ES el reproductor (su audio ya está dentro del mp4); si no,
  // el <audio> de siempre. HTMLVideoElement y Audio comparten la API que usa el motor
  // (play/pause/currentTime/duration/muted/onended/ontimeupdate/onloadedmetadata).
  function getMedia(i) {
    if (!audioCache[i]) {
      var video = slides[i] && slides[i].querySelector('video[data-avatar-video]');
      if (video) {
        video.muted = muted;
        audioCache[i] = video;
      } else if (deckAudioData && deckAudioData[i] && deckAudioData[i].src) {
        var a = new Audio(deckAudioData[i].src);
        a.muted = muted;
        audioCache[i] = a;
      } else {
        return null;
      }
    }
    return audioCache[i];
  }

  function playCurrent() {
    if (!hasAudio) return;
    var audio = getMedia(cur);

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
    var audio = getMedia(cur);
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
      var audio = getMedia(cur);
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

  // Hook para el panel "Guion" del generador: saltar a una slide desde el parent.
  // No desbloquea el audio (playCurrent solo suena tras un gesto dentro del deck).
  window.__deckGo = function (i) {
    var n = parseInt(i, 10);
    go(isNaN(n) ? 0 : n);
  };

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
export function renderDeck({
  title,
  css,
  slides,
  audioScript,
  motion,
  motionSeed,
}: DeckParts): string {
  // Sin `motion` declarado → la firma histórica del deck (frame + sweep + push + orbes).
  // La semilla solo elige la composición del kit de decoración (una de 10).
  const mo = resolveMotion(motion, motionSeed || title)
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${BASE_CSS}
${css}
${renderMotionCss(mo)}
</style>
</head>
<body class="tx-${mo.slideTransition}">
<div id="progress"></div>
<div id="stage">
${slides}
${mo.flow ? FLOW_HTML : ''}
${renderMotionHtml(mo)}
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
${renderMotionScript(mo)}
${audioScript ?? ''}<script>${DECK_JS}</script>
</body>
</html>
`
}
