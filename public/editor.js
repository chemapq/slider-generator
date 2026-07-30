'use strict'

// Motor del editor visual del deck. Opera sobre iframe.contentDocument (same-origin,
// blob creado por el propio parent). Nunca deja rastro en el HTML exportado: la
// serialización retira todo el chrome del editor antes de devolver el HTML.
//
// API pública: window.DeckEditor.{ enter, exit, isActive, serializeCleanHtml, extractSlides }
;(function () {
  // Bloques de texto editables dentro de .slide (contenteditable a nivel de bloque).
  var TEXT_SEL = 'h1,h2,h3,h4,p,li,blockquote,.lead,.kicker,.eyebrow,.tag,.stat,.num,.brand'
  // Atributos/clases que hay que retirar SIEMPRE al salir de edición / serializar / extraer.
  var ED_ATTRS = ['contenteditable', 'spellcheck', 'data-ed-editable', 'data-ed-img']
  var ED_CLASSES = ['ed-hover', 'ed-selected']
  var ED_STYLE_ID = 'ed-style'
  var ED_TOOLBAR_ID = 'ed-toolbar'
  var ED_IMG_POP_ID = 'ed-imgpop'
  var ED_FILE_INPUT_ID = 'ed-file-input'
  var ED_SEARCH_INPUT_ID = 'ed-imgsearch'

  // Tokens del tema usados como swatches de color rápido en la barra de formato.
  var THEME_VARS = ['--primary', '--primary-600', '--ink', '--ink-soft', '--muted', '--card']

  var TB = '#' + ED_TOOLBAR_ID
  var POP = '#' + ED_IMG_POP_ID
  var ED_CSS = [
    // ── Marcadores sobre el contenido ──────────────────────────────────────
    '.slide [contenteditable] { outline: none; }',
    '.slide [contenteditable]:focus { outline: none; }',
    '.slide [data-ed-img] { cursor: pointer; }',
    '.ed-hover { outline: 2px dashed rgba(108,99,255,.55); outline-offset: 3px; border-radius: 4px; }',
    '.slide [data-ed-editable].ed-hover { cursor: text; }',
    '.slide [data-ed-img].ed-hover { cursor: pointer; outline-color: rgba(108,99,255,.85); }',
    '.ed-selected { outline: 2px solid #6c63ff; outline-offset: 3px; border-radius: 4px; }',

    // ── Barra de formato ────────────────────────────────────────────────────
    TB + ' {',
    '  position: fixed; display: none; z-index: 2147483000;',
    '  align-items: center; gap: 1px;',
    '  background: #17171f; border: 1px solid rgba(255,255,255,.09);',
    '  border-radius: 12px; padding: 5px;',
    '  box-shadow: 0 12px 34px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.30);',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  -webkit-user-select: none; user-select: none;',
    '}',
    // Puntero triangular hacia la selección
    TB + '::after {',
    '  content: ""; position: absolute; width: 11px; height: 11px;',
    '  background: #17171f; transform: rotate(45deg);',
    '  left: var(--caret-x, 50%); margin-left: -5.5px; pointer-events: none;',
    '}',
    TB + '.ed-above::after { bottom: -5px; border-right: 1px solid rgba(255,255,255,.09); border-bottom: 1px solid rgba(255,255,255,.09); }',
    TB + '.ed-below::after { top: -5px; border-left: 1px solid rgba(255,255,255,.09); border-top: 1px solid rgba(255,255,255,.09); }',
    // Botones
    TB + ' .ed-btn {',
    '  all: unset; box-sizing: border-box; cursor: pointer; color: #d6d6df;',
    '  height: 30px; min-width: 30px; padding: 0 8px;',
    '  display: inline-flex; align-items: center; justify-content: center;',
    '  border-radius: 8px; font-size: 14px; font-weight: 600; line-height: 1;',
    '  transition: background .12s ease, color .12s ease;',
    '}',
    TB + ' .ed-btn:hover { background: rgba(255,255,255,.10); color: #fff; }',
    TB + ' .ed-btn:active { background: rgba(255,255,255,.16); }',
    TB + ' .ed-btn.is-active { background: #6c63ff; color: #fff; }',
    TB + ' .ed-btn svg { width: 17px; height: 17px; display: block; }',
    TB + ' .ed-btn[data-cmd="bold"] { font-weight: 800; font-size: 15px; }',
    TB + ' .ed-btn[data-cmd="italic"] { font-style: italic; font-family: Georgia, "Times New Roman", serif; font-size: 15px; }',
    TB + ' .ed-btn[data-cmd="underline"] { text-decoration: underline; text-underline-offset: 2px; }',
    TB + ' .ed-btn[data-cmd="size-dec"], ' + TB + ' .ed-btn[data-cmd="size-inc"] { font-weight: 700; letter-spacing: -.01em; }',
    TB + ' .ed-sep { width: 1px; height: 20px; background: rgba(255,255,255,.10); margin: 0 5px; flex: none; }',
    // Muestras de color
    TB + ' .ed-swatches { display: inline-flex; align-items: center; gap: 5px; padding: 0 4px; }',
    TB + ' .ed-swatch {',
    '  all: unset; box-sizing: border-box; display: inline-block; cursor: pointer;',
    '  width: 17px; height: 17px; border-radius: 50%;',
    '  box-shadow: inset 0 0 0 1px rgba(255,255,255,.28); transition: transform .1s ease;',
    '}',
    TB + ' .ed-swatch:hover { transform: scale(1.2); }',
    TB + ' .ed-color {',
    '  position: relative; display: inline-flex; width: 22px; height: 22px; cursor: pointer;',
    '  border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.30);',
    '  background: conic-gradient(from 0deg, #ff5c5c, #ffd25c, #5cff8f, #5cd6ff, #6c63ff, #ff5cf0, #ff5c5c);',
    '}',
    TB + ' .ed-color input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; padding: 0; margin: 0; cursor: pointer; }',

    // ── Popover de imagen ─────────────────────────────────────────────────────
    POP + ' {',
    '  position: fixed; display: none; z-index: 2147483000; flex-direction: column; gap: 1px;',
    '  min-width: 190px; background: #17171f; border: 1px solid rgba(255,255,255,.09);',
    '  border-radius: 12px; padding: 5px;',
    '  box-shadow: 0 12px 34px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.30);',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '}',
    POP + ' button {',
    '  all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px;',
    '  color: #d6d6df; font-size: 13px; font-weight: 600; padding: 9px 11px; border-radius: 8px; white-space: nowrap;',
    '  transition: background .12s ease, color .12s ease;',
    '}',
    POP + ' button:hover { background: rgba(255,255,255,.10); color: #fff; }',
    POP + ' button.ed-danger:hover { background: rgba(255,90,90,.16); color: #ff9a9a; }',
    POP + ' button svg { width: 16px; height: 16px; flex: none; opacity: .85; }',
    // Fila de búsqueda manual en Unsplash (se despliega bajo "Buscar en Unsplash…")
    POP + ' .ed-search-row { display: none; gap: 6px; padding: 4px; }',
    POP + ' .ed-search-row.is-open { display: flex; }',
    POP + ' .ed-search-row input {',
    '  all: unset; box-sizing: border-box; flex: 1; min-width: 170px;',
    '  background: #101018; border: 1px solid rgba(255,255,255,.14); border-radius: 8px;',
    '  color: #fff; font-size: 13px; font-weight: 500; padding: 7px 9px;',
    '}',
    POP + ' .ed-search-row input:focus { border-color: #6c63ff; }',
    POP + ' .ed-search-row input::placeholder { color: #6a6a78; }',
    POP + ' .ed-search-row .ed-go {',
    '  all: unset; box-sizing: border-box; cursor: pointer; flex: none;',
    '  background: #6c63ff; color: #fff; font-size: 13px; font-weight: 600;',
    '  border-radius: 8px; padding: 7px 12px;',
    '}',
    POP + ' .ed-search-row .ed-go:hover { background: #7c74ff; }',
    // Línea de estado del popover (búsqueda en curso / error)
    POP + ' .ed-pop-status { display: none; color: #9a9aa8; font-size: 12px; font-weight: 500; padding: 6px 11px 4px; max-width: 250px; }',
    POP + ' .ed-pop-status.ed-error { color: #ff9a9a; }',
    POP + '.ed-busy button { opacity: .45; pointer-events: none; }',
  ].join('\n')

  // ── Iconos SVG (stroke) ─────────────────────────────────────────────────
  var SVG_ALIGN_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>'
  var SVG_ALIGN_CENTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M6 18h12"/></svg>'
  var SVG_ALIGN_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M10 12h10M8 18h12"/></svg>'
  var SVG_CLEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H8"/><path d="m5 11 9 9"/></svg>'
  var SVG_REPLACE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="15" rx="2"/><path d="M3 15l4.5-3.5 3.5 2.5 3-2 7 5.5"/><circle cx="8.3" cy="9" r="1.4"/></svg>'
  var SVG_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 7V5h4v2M6.5 7l1 12h9l1-12"/></svg>'
  var SVG_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>'
  var SVG_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>'

  // ── Estado del módulo (un único iframe editado a la vez) ───────────────────
  var active = false
  var curDoc = null
  var curWin = null
  var keyGuardFn = null
  var hoverOverFn = null
  var hoverOutFn = null
  var selectionChangeFn = null
  var docClickFn = null
  var wordSelectFn = null
  var popTarget = null
  var curSelectedEl = null
  var savedRange = null
  // Unsplash: habilitado desde enter(iframe, { unsplash }) según config del servidor.
  var unsplashOn = false
  // Búsqueda de foto en curso (bloquea el popover para evitar dobles peticiones).
  var popBusy = false
  // elemento → ids de fotos ya mostradas en él (para que "regenerar" no repita).
  var seenPhotoIds = new WeakMap()

  // ── Selección: guardar/restaurar (necesario porque el <input type=color>
  //    nativo roba el foco del contenteditable y colapsa la selección) ───────
  function saveSelection(doc) {
    var sel = doc.getSelection()
    if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange()
  }
  function restoreSelection(doc) {
    if (!savedRange) return
    var sel = doc.getSelection()
    sel.removeAllRanges()
    sel.addRange(savedRange)
  }

  // ── Marcar textos e imágenes como editables ─────────────────────────────────
  function markEditable(doc) {
    var slides = doc.querySelectorAll('.slide')
    slides.forEach(function (slide) {
      slide.querySelectorAll(TEXT_SEL).forEach(function (el) {
        if (el.closest('.notes')) return
        // Evita anidar editables: si un ancestro dentro de la slide ya lo es, se salta.
        var p = el.parentElement
        var nested = false
        while (p && p !== slide) {
          if (p.getAttribute('contenteditable') === 'true') { nested = true; break }
          p = p.parentElement
        }
        if (nested) return
        el.setAttribute('contenteditable', 'true')
        el.setAttribute('spellcheck', 'false')
        el.setAttribute('data-ed-editable', '')
      })

      slide.querySelectorAll('img[src]').forEach(function (img) {
        img.setAttribute('data-ed-img', 'img')
      })
      slide.querySelectorAll('[style*="background-image"]').forEach(function (el) {
        if (!el.hasAttribute('data-ed-img')) el.setAttribute('data-ed-img', 'bg')
      })
      // Slots de Unsplash que quedaron sin foto (solo el degradado de fallback):
      // conservan data-img-query pero no tienen background inline. Se marcan
      // igualmente para que el usuario pueda reintentar la búsqueda desde aquí.
      slide.querySelectorAll('[data-img-query]').forEach(function (el) {
        if (el.tagName !== 'IMG' && !el.hasAttribute('data-ed-img')) {
          el.setAttribute('data-ed-img', 'bg')
        }
      })
    })
  }

  // ── Hover (delegación) ───────────────────────────────────────────────────
  function attachHover(doc) {
    hoverOverFn = function (e) {
      var t = e.target.closest && e.target.closest('[data-ed-editable], [data-ed-img]')
      if (t) t.classList.add('ed-hover')
    }
    hoverOutFn = function (e) {
      var t = e.target.closest && e.target.closest('[data-ed-editable], [data-ed-img]')
      if (t) t.classList.remove('ed-hover')
    }
    doc.addEventListener('mouseover', hoverOverFn)
    doc.addEventListener('mouseout', hoverOutFn)
  }
  function detachHover(doc) {
    if (hoverOverFn) doc.removeEventListener('mouseover', hoverOverFn)
    if (hoverOutFn) doc.removeEventListener('mouseout', hoverOutFn)
    hoverOverFn = hoverOutFn = null
  }

  // ── Guarda de teclado: evita que las flechas/espacio naveguen el deck
  //    mientras se escribe dentro de un contenteditable ──────────────────────
  function attachKeyGuard(win, doc) {
    keyGuardFn = function (e) {
      var a = doc.activeElement
      // Input de búsqueda del popover de imagen: se aísla TODO el teclado de la
      // navegación del deck (aquí se escribe texto libre). Enter lanza la búsqueda.
      if (a && a.id === ED_SEARCH_INPUT_ID) {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          runUnsplashSwap(doc, a.value)
        }
        return
      }
      var navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']
      if (a && a.isContentEditable && navKeys.indexOf(e.key) !== -1) {
        e.stopPropagation()
      }
    }
    win.addEventListener('keydown', keyGuardFn, true)
  }
  function detachKeyGuard(win) {
    if (keyGuardFn && win) win.removeEventListener('keydown', keyGuardFn, true)
    keyGuardFn = null
  }

  // ── Barra de formato ─────────────────────────────────────────────────────
  function buildToolbar(doc) {
    var bar = doc.createElement('div')
    bar.id = ED_TOOLBAR_ID
    bar.innerHTML =
      '<button class="ed-btn" type="button" data-cmd="bold" title="Negrita">B</button>' +
      '<button class="ed-btn" type="button" data-cmd="italic" title="Cursiva">I</button>' +
      '<button class="ed-btn" type="button" data-cmd="underline" title="Subrayado">U</button>' +
      '<span class="ed-sep"></span>' +
      '<button class="ed-btn" type="button" data-cmd="size-dec" title="Reducir tamaño">A−</button>' +
      '<button class="ed-btn" type="button" data-cmd="size-inc" title="Aumentar tamaño">A+</button>' +
      '<span class="ed-sep"></span>' +
      '<span class="ed-swatches" data-role="swatches"></span>' +
      '<label class="ed-color" title="Color personalizado"><input type="color" data-role="freecolor"></label>' +
      '<span class="ed-sep"></span>' +
      '<button class="ed-btn" type="button" data-cmd="justifyLeft" title="Alinear a la izquierda">' + SVG_ALIGN_LEFT + '</button>' +
      '<button class="ed-btn" type="button" data-cmd="justifyCenter" title="Centrar">' + SVG_ALIGN_CENTER + '</button>' +
      '<button class="ed-btn" type="button" data-cmd="justifyRight" title="Alinear a la derecha">' + SVG_ALIGN_RIGHT + '</button>' +
      '<span class="ed-sep"></span>' +
      '<button class="ed-btn" type="button" data-cmd="removeFormat" title="Limpiar formato">' + SVG_CLEAR + '</button>'
    doc.body.appendChild(bar)
    return bar
  }

  function populateSwatches(doc, bar) {
    var holder = bar.querySelector('[data-role="swatches"]')
    if (!holder) return
    var rootStyle = doc.defaultView.getComputedStyle(doc.documentElement)
    THEME_VARS.forEach(function (varName) {
      var val = rootStyle.getPropertyValue(varName).trim()
      if (!val) return
      var b = doc.createElement('button')
      b.type = 'button'
      b.className = 'ed-swatch'
      b.style.background = val
      b.title = 'Color ' + varName.replace('--', '')
      b.dataset.color = val
      b.dataset.cmd = 'color'
      holder.appendChild(b)
    })
  }

  function applyFontSize(doc, delta) {
    var sel = doc.getSelection()
    if (!sel || !sel.anchorNode) return
    var node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode
    var block = node && node.closest && node.closest('[data-ed-editable]')
    if (!block) return
    var cur = parseFloat(doc.defaultView.getComputedStyle(block).fontSize) || 16
    var next = Math.max(10, Math.min(96, cur + delta))
    block.style.fontSize = next + 'px'
  }

  function wireToolbar(doc, bar) {
    // Conserva el foco/selección del contenteditable al pulsar un botón
    // (el <input type=color> se excluye: necesita su comportamiento nativo para abrir el picker).
    bar.addEventListener('mousedown', function (e) {
      if (e.target.tagName !== 'INPUT') e.preventDefault()
    })

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('button')
      if (!btn || !btn.dataset.cmd) return
      var cmd = btn.dataset.cmd
      if (cmd === 'size-inc' || cmd === 'size-dec') {
        applyFontSize(doc, cmd === 'size-inc' ? 2 : -2)
        return
      }
      if (cmd === 'color') {
        doc.execCommand('styleWithCSS', false, true)
        doc.execCommand('foreColor', false, btn.dataset.color)
        return
      }
      doc.execCommand(cmd)
    })

    var freeColor = bar.querySelector('[data-role="freecolor"]')
    if (freeColor) {
      freeColor.addEventListener('mousedown', function () { saveSelection(doc) })
      freeColor.addEventListener('input', function () {
        restoreSelection(doc)
        doc.execCommand('styleWithCSS', false, true)
        doc.execCommand('foreColor', false, freeColor.value)
      })
    }
  }

  function onSelectionChange() {
    if (!active || !curDoc) return
    var bar = curDoc.getElementById(ED_TOOLBAR_ID)
    if (!bar) return
    var sel = curDoc.getSelection()
    var editableAncestor = null
    if (sel && sel.rangeCount > 0 && sel.anchorNode) {
      var anchorEl = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode
      editableAncestor = anchorEl && anchorEl.closest && anchorEl.closest('[data-ed-editable]')
    }

    if (!editableAncestor) {
      if (curSelectedEl) { curSelectedEl.classList.remove('ed-selected'); curSelectedEl = null }
      bar.style.display = 'none'
      return
    }

    if (editableAncestor !== curSelectedEl) {
      if (curSelectedEl) curSelectedEl.classList.remove('ed-selected')
      editableAncestor.classList.add('ed-selected')
      curSelectedEl = editableAncestor
    }

    saveSelection(curDoc)

    var range = sel.getRangeAt(0)
    var rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) rect = editableAncestor.getBoundingClientRect()

    bar.style.display = 'flex'
    var barRect = bar.getBoundingClientRect()

    // Colocar encima de la selección; si no cabe, debajo. La clase orienta el puntero.
    var above = true
    var top = rect.top - barRect.height - 10
    if (top < 6) { top = rect.bottom + 10; above = false }
    bar.classList.toggle('ed-above', above)
    bar.classList.toggle('ed-below', !above)

    var left = Math.max(6, Math.min(rect.left, curWin.innerWidth - barRect.width - 6))
    bar.style.top = top + 'px'
    bar.style.left = left + 'px'

    // Puntero apuntando al centro de la selección (relativo a la barra).
    var caretX = Math.max(14, Math.min(barRect.width - 14, rect.left + rect.width / 2 - left))
    bar.style.setProperty('--caret-x', caretX + 'px')

    syncActiveStates(curDoc, bar)
  }

  // Resalta los botones cuyo formato ya está aplicado en la selección actual.
  function syncActiveStates(doc, bar) {
    ['bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'justifyRight'].forEach(function (cmd) {
      var b = bar.querySelector('.ed-btn[data-cmd="' + cmd + '"]')
      if (!b) return
      var on = false
      try { on = doc.queryCommandState(cmd) } catch (e) { /* comando no soportado */ }
      b.classList.toggle('is-active', on)
    })
  }

  function attachSelectionWatch(doc) {
    selectionChangeFn = function () { onSelectionChange() }
    doc.addEventListener('selectionchange', selectionChangeFn)
  }
  function detachSelectionWatch(doc) {
    if (selectionChangeFn) doc.removeEventListener('selectionchange', selectionChangeFn)
    selectionChangeFn = null
  }

  // ── Edición de imágenes ──────────────────────────────────────────────────
  // Único punto donde se hornea la imagen en la slide (archivo local o foto de
  // Unsplash: mismo destino).
  function applyImage(target, dataUri) {
    if (target.getAttribute('data-ed-img') === 'bg') {
      target.style.backgroundImage = "url('" + dataUri + "')"
      // Los slots que quedaron sin foto no traen estos ajustes inline.
      if (!target.style.backgroundSize) target.style.backgroundSize = 'cover'
      if (!target.style.backgroundPosition) target.style.backgroundPosition = 'center'
    } else {
      target.src = dataUri
    }
    // data-img apuntaba al placeholder anterior: sin él, fillSlots no volverá a
    // pisar la imagen recién horneada en un futuro re-render (p. ej. /api/audio).
    target.removeAttribute('data-img')
  }

  function ensureFileInput(doc) {
    var input = doc.getElementById(ED_FILE_INPUT_ID)
    if (!input) {
      input = doc.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.id = ED_FILE_INPUT_ID
      input.style.display = 'none'
      doc.body.appendChild(input)
    }
    return input
  }

  function buildImagePopover(doc) {
    var pop = doc.createElement('div')
    pop.id = ED_IMG_POP_ID
    pop.innerHTML =
      '<button type="button" data-act="regen" data-role="regen">' + SVG_REFRESH + 'Regenerar foto</button>' +
      '<button type="button" data-act="search" data-role="search">' + SVG_SEARCH + 'Buscar en Unsplash…</button>' +
      '<div class="ed-search-row" data-role="searchrow">' +
      '<input type="text" id="' + ED_SEARCH_INPUT_ID + '" placeholder="ej: team meeting office" spellcheck="false">' +
      '<button type="button" class="ed-go" data-act="dosearch">Ir</button>' +
      '</div>' +
      '<button type="button" data-act="replace">' + SVG_REPLACE + 'Reemplazar imagen…</button>' +
      '<button type="button" data-act="remove" class="ed-danger">' + SVG_TRASH + 'Quitar imagen</button>' +
      '<div class="ed-pop-status" data-role="popstatus"></div>'
    doc.body.appendChild(pop)
    return pop
  }

  function openImagePopover(doc, target) {
    if (popBusy) return // hay una búsqueda en curso: no reabrir sobre otro target
    popTarget = target
    var pop = doc.getElementById(ED_IMG_POP_ID)
    if (!pop) return

    // Opciones de Unsplash según el target: "regenerar" solo tiene sentido si el
    // slot recuerda su búsqueda (data-img-query); "buscar" vale para cualquier imagen.
    var query = target.getAttribute('data-img-query') || ''
    pop.querySelector('[data-role="regen"]').style.display = unsplashOn && query ? 'flex' : 'none'
    pop.querySelector('[data-role="search"]').style.display = unsplashOn ? 'flex' : 'none'
    pop.querySelector('[data-role="searchrow"]').classList.remove('is-open')
    doc.getElementById(ED_SEARCH_INPUT_ID).value = query
    setPopStatus(pop, '', false)

    var rect = target.getBoundingClientRect()
    pop.style.display = 'flex'
    var popRect = pop.getBoundingClientRect()
    var top = Math.max(4, Math.min(rect.top + 8, curWin.innerHeight - popRect.height - 4))
    var left = Math.max(4, Math.min(rect.left + 8, curWin.innerWidth - popRect.width - 4))
    pop.style.top = top + 'px'
    pop.style.left = left + 'px'
  }

  function setPopStatus(pop, msg, isError) {
    var status = pop.querySelector('[data-role="popstatus"]')
    if (!status) return
    status.textContent = msg
    status.className = 'ed-pop-status' + (isError ? ' ed-error' : '')
    status.style.display = msg ? 'block' : 'none'
  }

  // Orientación con la que buscar el reemplazo. data-img-orient manda cuando existe
  // (el avatar-tutor lo lleva fijo a portrait: su hueco es un círculo, y por caja
  // saldría 'landscape' y la cara quedaría mal recortada).
  function orientationOf(el) {
    var hint = el.getAttribute('data-img-orient')
    if (hint === 'portrait' || hint === 'landscape') return hint
    var r = el.getBoundingClientRect()
    return r.height > r.width ? 'portrait' : 'landscape'
  }

  // Busca una foto en Unsplash con `query` y la aplica sobre popTarget. Excluye
  // las fotos ya vistas en ese elemento para que "regenerar" traiga variedad.
  // La atribución al fotógrafo va al alt (guidelines de Unsplash).
  function runUnsplashSwap(doc, query) {
    query = (query || '').trim()
    var pop = doc.getElementById(ED_IMG_POP_ID)
    var target = popTarget
    if (!pop || !target || popBusy) return

    if (!query) {
      pop.querySelector('[data-role="searchrow"]').classList.add('is-open')
      doc.getElementById(ED_SEARCH_INPUT_ID).focus()
      return
    }

    var seen = seenPhotoIds.get(target) || []
    var currentId = target.getAttribute('data-img-id')
    if (currentId && seen.indexOf(currentId) === -1) seen.push(currentId)
    seenPhotoIds.set(target, seen)

    popBusy = true
    pop.classList.add('ed-busy')
    setPopStatus(pop, 'Buscando en Unsplash…', false)

    fetch('/api/unsplash/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query, orientation: orientationOf(target), excludeIds: seen }),
    })
      .then(function (res) {
        if (res.ok) return res.json()
        return res
          .json()
          .catch(function () { return {} })
          .then(function (body) { throw new Error(body.error || 'HTTP ' + res.status) })
      })
      .then(function (photo) {
        applyImage(target, photo.dataUri)
        target.setAttribute('data-img-query', query)
        target.setAttribute('data-img-id', photo.id)
        if (target.getAttribute('data-ed-img') !== 'bg') {
          target.setAttribute('alt', 'Foto de ' + photo.photographer + ' en Unsplash')
        }
        seen.push(photo.id)
        pop.style.display = 'none'
        if (popTarget === target) popTarget = null
      })
      .catch(function (err) {
        setPopStatus(pop, err && err.message ? err.message : 'Error buscando la foto', true)
      })
      .finally(function () {
        popBusy = false
        pop.classList.remove('ed-busy')
      })
  }

  function wireImagePopover(doc, pop) {
    // El input de búsqueda necesita el mousedown nativo para recibir el foco.
    pop.addEventListener('mousedown', function (e) {
      if (e.target.tagName !== 'INPUT') e.preventDefault()
    })
    pop.addEventListener('click', function (e) {
      var btn = e.target.closest('button')
      if (!btn || !popTarget || popBusy) return
      var act = btn.dataset.act
      if (act === 'regen') {
        runUnsplashSwap(doc, popTarget.getAttribute('data-img-query'))
        return
      }
      if (act === 'search') {
        var row = pop.querySelector('[data-role="searchrow"]')
        row.classList.toggle('is-open')
        if (row.classList.contains('is-open')) doc.getElementById(ED_SEARCH_INPUT_ID).focus()
        return
      }
      if (act === 'dosearch') {
        runUnsplashSwap(doc, doc.getElementById(ED_SEARCH_INPUT_ID).value)
        return
      }
      if (act === 'remove') {
        if (popTarget.getAttribute('data-ed-img') === 'bg') popTarget.style.backgroundImage = 'none'
        else popTarget.remove()
        pop.style.display = 'none'
        popTarget = null
        return
      }
      if (act === 'replace') {
        var input = ensureFileInput(doc)
        var target = popTarget
        input.onchange = function () {
          var file = input.files && input.files[0]
          input.value = ''
          if (!file) return
          if (file.size > 3 * 1024 * 1024) {
            console.warn('[editor] imagen > 3 MB: el HTML resultante puede pesar mucho.')
          }
          var reader = new FileReader()
          reader.onload = function () { applyImage(target, reader.result) }
          reader.readAsDataURL(file)
        }
        input.click()
        pop.style.display = 'none'
      }
    })
  }

  // ── Click en texto: selecciona la palabra entera bajo el cursor ────────────
  // Un click simple dentro de un editable deja el caret colapsado en mitad de la
  // palabra; aquí se expande a la palabra completa. Los dobles/triples clicks y
  // las selecciones por arrastre conservan su comportamiento nativo.
  var WORD_CHAR = /[\p{L}\p{N}_]/u

  function attachWordSelect(doc) {
    wordSelectFn = function (e) {
      if (e.detail !== 1) return
      var block = e.target.closest && e.target.closest('[data-ed-editable]')
      if (!block) return
      var sel = doc.getSelection()
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return
      var node = sel.anchorNode
      if (!node || node.nodeType !== 3 || !block.contains(node)) return
      var text = node.textContent
      var start = sel.anchorOffset
      var end = start
      while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
      while (end < text.length && WORD_CHAR.test(text[end])) end++
      if (start === end) return // click sobre espacio/puntuación: se deja el caret
      var range = doc.createRange()
      range.setStart(node, start)
      range.setEnd(node, end)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    doc.addEventListener('click', wordSelectFn)
  }
  function detachWordSelect(doc) {
    if (wordSelectFn) doc.removeEventListener('click', wordSelectFn)
    wordSelectFn = null
  }

  function attachImageClicks(doc) {
    docClickFn = function (e) {
      var imgEl = e.target.closest && e.target.closest('[data-ed-img]')
      if (imgEl) {
        e.preventDefault()
        openImagePopover(doc, imgEl)
        return
      }
      var pop = doc.getElementById(ED_IMG_POP_ID)
      if (pop && pop.style.display !== 'none' && !pop.contains(e.target)) {
        pop.style.display = 'none'
        popTarget = null
      }
    }
    doc.addEventListener('click', docClickFn, true)
  }
  function detachImageClicks(doc) {
    if (docClickFn) doc.removeEventListener('click', docClickFn, true)
    docClickFn = null
  }

  // ── Limpieza de artefactos del editor (usado en exit/serialize/extract) ──
  function stripEditorArtifacts(root) {
    ED_ATTRS.forEach(function (attr) {
      root.querySelectorAll('[' + attr + ']').forEach(function (el) { el.removeAttribute(attr) })
    })
    ED_CLASSES.forEach(function (cls) {
      root.querySelectorAll('.' + cls).forEach(function (el) {
        el.classList.remove(cls)
        if (!el.getAttribute('class')) el.removeAttribute('class')
      })
    })
  }

  // ── API pública ───────────────────────────────────────────────────────────
  // opts.unsplash: true si el servidor tiene UNSPLASH_ACCESS_KEY (el popover de
  // imagen ofrece entonces "Regenerar foto" y "Buscar en Unsplash…").
  function enter(iframe, opts) {
    if (active) return
    var doc = iframe.contentDocument
    if (!doc) { console.warn('[editor] no se pudo acceder al documento del iframe'); return }

    unsplashOn = Boolean(opts && opts.unsplash)
    curDoc = doc
    curWin = iframe.contentWindow

    try { curWin.__deckAudioPause && curWin.__deckAudioPause() } catch (e) { /* deck sin audio */ }

    var style = doc.createElement('style')
    style.id = ED_STYLE_ID
    style.textContent = ED_CSS
    doc.head.appendChild(style)

    markEditable(doc)

    var bar = buildToolbar(doc)
    populateSwatches(doc, bar)
    wireToolbar(doc, bar)

    var pop = buildImagePopover(doc)
    wireImagePopover(doc, pop)

    attachHover(doc)
    attachKeyGuard(curWin, doc)
    attachSelectionWatch(doc)
    attachWordSelect(doc)
    attachImageClicks(doc)

    active = true
  }

  function exit(iframe) {
    var doc = curDoc || (iframe && iframe.contentDocument)
    if (!doc) { active = false; return }
    var win = curWin || (iframe && iframe.contentWindow)

    detachHover(doc)
    detachKeyGuard(win)
    detachSelectionWatch(doc)
    detachWordSelect(doc)
    detachImageClicks(doc)

    var bar = doc.getElementById(ED_TOOLBAR_ID)
    if (bar) bar.remove()
    var pop = doc.getElementById(ED_IMG_POP_ID)
    if (pop) pop.remove()
    var style = doc.getElementById(ED_STYLE_ID)
    if (style) style.remove()
    var fileInput = doc.getElementById(ED_FILE_INPUT_ID)
    if (fileInput) fileInput.remove()

    stripEditorArtifacts(doc)

    active = false
    curDoc = null
    curWin = null
    popTarget = null
    popBusy = false
    curSelectedEl = null
    savedRange = null
  }

  function isActive() { return active }

  function serializeCleanHtml(iframe) {
    var doc = iframe.contentDocument
    if (!doc) return null
    var clone = doc.documentElement.cloneNode(true)
    ;[ED_TOOLBAR_ID, ED_IMG_POP_ID, ED_STYLE_ID, ED_FILE_INPUT_ID].forEach(function (id) {
      var el = clone.querySelector('#' + id)
      if (el) el.remove()
    })
    stripEditorArtifacts(clone)
    return '<!doctype html>\n' + clone.outerHTML
  }

  function extractSlides(iframe) {
    var doc = iframe.contentDocument
    if (!doc) return []
    var sections = doc.querySelectorAll('#stage .slide')
    return Array.from(sections).map(function (sec) {
      var c = sec.cloneNode(true)
      c.querySelectorAll('.notes').forEach(function (n) { n.remove() })
      stripEditorArtifacts(c)
      return c.innerHTML
    })
  }

  window.DeckEditor = {
    enter: enter,
    exit: exit,
    isActive: isActive,
    serializeCleanHtml: serializeCleanHtml,
    extractSlides: extractSlides,
  }
})()
