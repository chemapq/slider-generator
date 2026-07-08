/**
 * Shell del deck propio: HTML autocontenido con CSS+JS inline, 16:9,
 * transición fade/scale, nav flotante tipo cristal, barra de progreso
 * degradada, puntos que se alargan y auto-reescalado.
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

  render();
}());
`.trim()

// SVGs para los botones de audio (en el HTML estático; el JS los sobreescribe en runtime).
const SVG_SPEAKER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`
const SVG_DOUBLE_CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,18 12,12 4,6"/><polyline points="12,18 20,12 12,6"/></svg>`
const SVG_PLAY_STATIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"/></svg>`

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
${audioScript ?? ''}<script>${DECK_JS}</script>
</body>
</html>
`
}
