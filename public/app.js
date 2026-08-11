'use strict'

// --- Estado ---
let pdfFile = null
let imageFiles = []
let avatarFile = null
let refFiles = []
let generatedHtml = null
let blobUrl = null
let voiceEnabled = false
let subtitlesEnabled = true
let avatarVideoEnabled = false
let heygenConfigured = false
let currentDeckId = null
let editing = false
let unsplashConfigured = false
// Panel "Guion de voz": narración por slide tal como está en el servidor (línea base
// para detectar cambios) + si el panel está abierto.
let scriptBaseline = []
let scriptOpen = false
// Voz y modelo con los que está hecho el audio del deck actual (los reporta el servidor
// en X-Audio-Voice/X-Audio-Model). El selector de regenerar se mantiene en esta voz: así
// regenerar una slide editada no cambia la voz del resto. Solo el usuario la cambia.
let deckVoiceId = null
let deckModelId = null
// Solo hay "voz del deck" que respetar si el deck tiene audio sintetizado.
let deckHasAudio = false

const $ = (id) => document.getElementById(id)

const themeSelect = $('theme-select')
const themeField = $('theme-field')
const themeFromImages = $('theme-from-images')
const generateBtn = $('generate-btn')
const statusEl = $('status')
const resultArea = $('result-area')
const preview = $('preview')
const downloadBtn = $('download-btn')
const chkVoice       = $('chk-voice')
const chkSubs        = $('chk-subs')
const voiceConfig    = $('voice-config')
const chkAvatarVideo = $('chk-avatar-video')
const avatarVideoRow = $('avatar-video-row')
const avatarVideoHint = $('avatar-video-hint')
const regenAvatarVideo = $('regen-avatar-video')
const regenAvatarVideoRow = $('regen-avatar-video-row')
const genVoiceSelect = $('gen-voice-select')
const modelSelect    = $('model-select')
const audioPanel     = $('audio-panel')
const regenVoiceSelect = $('regen-voice-select')
const regenAudioBtn  = $('regen-audio-btn')
const regenSubs      = $('regen-subs')
const audioStatus    = $('audio-status')
const editToggleBtn  = $('edit-toggle-btn')
const saveBtn        = $('save-btn')
const editIndicator  = $('edit-indicator')
const scriptToggleBtn = $('script-toggle-btn')
const scriptPanel    = $('script-panel')
const scriptList     = $('script-list')
const scriptStatus   = $('script-status')
const scriptDirtyEl  = $('script-dirty')
const scriptSaveBtn  = $('script-save-btn')
const scriptRegenBtn = $('script-regen-btn')
const voiceMismatch  = $('voice-mismatch')

// Límite por narración en ElevenLabs (src/services/tts.ts: MAX_CHARS). Pasarse deja la
// slide muda, así que el panel avisa antes de gastar la petición.
const NARRATION_MAX_CHARS = 9000

// --- Cargar voces disponibles ---
async function loadVoices() {
  try {
    const res = await fetch('/api/voices')
    if (!res.ok) return
    const { configured, voices } = await res.json()
    if (!voices.length) return
    const opts = voices.map((v) => `<option value="${escAttr(v.id)}">${escHtml(v.label)}</option>`).join('')
    genVoiceSelect.innerHTML = opts
    regenVoiceSelect.innerHTML = opts
    audioPanel._voiceConfigured = configured
  } catch {
    // sin voces configuradas → panel post-gen permanece oculto
  }
}

// --- Estado de HeyGen (habilita el checkbox "Avatar en vídeo") ---
async function loadHeygenStatus() {
  try {
    const res = await fetch('/api/heygen')
    if (!res.ok) return
    const { configured } = await res.json()
    heygenConfigured = Boolean(configured)
    updateAvatarVideoAvailability()
  } catch {
    // sin HeyGen configurado → el checkbox queda deshabilitado
  }
}

/** El checkbox solo se puede marcar si voz está activada Y HeyGen está configurado. */
function updateAvatarVideoAvailability() {
  const available = heygenConfigured && voiceEnabled
  chkAvatarVideo.disabled = !available
  if (!available) { chkAvatarVideo.checked = false; avatarVideoEnabled = false }
  avatarVideoRow.classList.toggle('disabled', !available)
  avatarVideoHint.textContent = !heygenConfigured
    ? '· requiere HeyGen configurado en el servidor'
    : !voiceEnabled
      ? '· requiere narración por voz activada'
      : '· la intro habla con lip-sync, con la cara de la voz elegida'
  regenAvatarVideoRow.style.display = heygenConfigured ? 'flex' : 'none'
}

// --- Estado de Unsplash (habilita regenerar/buscar fotos en el editor) ---
async function loadUnsplashStatus() {
  try {
    const res = await fetch('/api/unsplash')
    if (!res.ok) return
    const { configured, avatar } = await res.json()
    unsplashConfigured = Boolean(configured)
    // Sin avatar subido se usa un retrato de Unsplash: se anuncia en la zona de avatar.
    if (avatar) $('avatar-hint').textContent = 'intro y cierre · sin él, retrato de Unsplash'
  } catch {
    // sin Unsplash → el popover de imagen solo ofrece archivo local / quitar
  }
}

// --- Cargar temas ---
async function loadThemes() {
  try {
    const res = await fetch('/api/themes')
    if (!res.ok) throw new Error()
    const themes = await res.json()
    themeSelect.innerHTML = themes
      .map((t) => `<option value="${escAttr(t.name)}">${escHtml(t.label)}</option>`)
      .join('')
  } catch {
    themeSelect.innerHTML = '<option value="timely-ai">timely-ai</option>'
  }
}

// --- Conexión drag&drop + input para cada zona ---
function wireZone(zoneId, inputId, { multiple, isPdf }, onFiles) {
  const zone = $(zoneId)
  const input = $(inputId)

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over') })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'))
  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    zone.classList.remove('drag-over')
    handle(Array.from(e.dataTransfer.files || []))
  })
  input.addEventListener('change', () => handle(Array.from(input.files || [])))

  function handle(files) {
    if (!files.length) return
    let accepted = files
    if (isPdf) {
      accepted = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      if (!accepted.length) return showStatus('error', 'El guion debe ser un PDF.')
    } else {
      accepted = files.filter((f) => f.type.startsWith('image/'))
    }
    onFiles(multiple ? accepted : accepted.slice(0, 1), zone)
    clearStatus()
    hideResult()
  }
}

// --- Miniaturas ---
function renderThumbs(container, files, { circular } = {}) {
  container.innerHTML = ''
  files.forEach((f) => {
    const img = document.createElement('img')
    img.className = 'thumb' + (circular ? ' avatar' : '')
    img.src = URL.createObjectURL(f)
    img.onload = () => URL.revokeObjectURL(img.src)
    container.appendChild(img)
  })
}

// --- Zonas ---
wireZone('dz-pdf', 'in-pdf', { multiple: false, isPdf: true }, (files) => {
  pdfFile = files[0]
  $('pdf-name').textContent = pdfFile.name
  $('dz-pdf').classList.add('has-file')
  generateBtn.disabled = false
})

wireZone('dz-images', 'in-images', { multiple: true }, (files, zone) => {
  imageFiles = imageFiles.concat(files)
  renderThumbs($('images-thumbs'), imageFiles)
  zone.classList.add('has-file')
})

wireZone('dz-avatar', 'in-avatar', { multiple: false }, (files, zone) => {
  avatarFile = files[0]
  renderThumbs($('avatar-thumbs'), [avatarFile], { circular: true })
  zone.classList.add('has-file')
})

wireZone('dz-refs', 'in-refs', { multiple: true }, (files, zone) => {
  refFiles = refFiles.concat(files)
  renderThumbs($('refs-thumbs'), refFiles)
  zone.classList.add('has-file')
  updateThemeSource()
})

// --- Checkbox de voz: expande/colapsa la config ---
chkVoice.addEventListener('change', () => {
  voiceEnabled = chkVoice.checked
  voiceConfig.style.display = voiceEnabled ? 'flex' : 'none'
  updateAvatarVideoAvailability()
})
chkSubs.addEventListener('change', () => { subtitlesEnabled = chkSubs.checked })
chkAvatarVideo.addEventListener('change', () => { avatarVideoEnabled = chkAvatarVideo.checked })

// Con referencias de estilo, ELLAS definen el tema: ocultamos el desplegable.
function updateThemeSource() {
  const fromImages = refFiles.length > 0
  themeField.style.display = fromImages ? 'none' : 'flex'
  themeFromImages.style.display = fromImages ? 'flex' : 'none'
}

// --- Generar ---
generateBtn.addEventListener('click', async () => {
  if (!pdfFile) return

  generateBtn.disabled = true
  const loadingMsg = voiceEnabled
    ? 'Generando presentación con Claude + narración TTS… puede tardar 3-5 minutos.'
    : refFiles.length
      ? 'Generando la presentación guiada por tus referencias con Claude… puede tardar 1-2 minutos.'
      : 'Generando presentación con Claude… puede tardar 1-2 minutos.'
  showStatus('loading', loadingMsg)
  hideResult()

  const form = new FormData()
  form.append('file', pdfFile)
  // Con referencias, el tema lo definen las imágenes: no enviamos el desplegable.
  if (!refFiles.length) form.append('theme', themeSelect.value)
  imageFiles.forEach((f) => form.append('images', f))
  if (avatarFile) form.append('avatar', avatarFile)
  refFiles.forEach((f) => form.append('references', f))
  if (voiceEnabled) {
    form.append('voice', 'on')
    if (genVoiceSelect.value) form.append('voiceId', genVoiceSelect.value)
    if (modelSelect.value) form.append('modelId', modelSelect.value)
    if (avatarVideoEnabled) form.append('avatarVideo', 'on')
  }
  form.append('subtitles', subtitlesEnabled ? 'on' : 'off')

  try {
    const res = await fetch('/api/generate', { method: 'POST', body: form })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    generatedHtml = await res.text()
    currentDeckId = res.headers.get('X-Deck-Id')
    setDeckVoice(res.headers.get('X-Audio-Voice'), res.headers.get('X-Audio-Model'))
    showResult(generatedHtml)
    showAudioPanel()
    const warning = res.headers.get('X-Voice-Warning') || res.headers.get('X-Image-Warning') || res.headers.get('X-Avatar-Warning')
    if (warning) showStatus('warning', '⚠️ ' + warning)
    else clearStatus()
  } catch (err) {
    showStatus('error', err instanceof Error ? err.message : String(err))
  } finally {
    generateBtn.disabled = false
  }
})

// --- Descargar ---
// Serializa el iframe en vivo (WYSIWYG: incluye ediciones + audio embebido).
// Si el editor no está disponible o el iframe no es accesible, cae al último HTML recibido.
downloadBtn.addEventListener('click', () => {
  let html = null
  try {
    if (window.DeckEditor && preview.contentDocument) html = window.DeckEditor.serializeCleanHtml(preview)
  } catch {
    html = null
  }
  if (!html) html = generatedHtml
  if (!html) return
  const a = document.createElement('a')
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  a.href = url
  a.download = 'presentacion.html'
  a.click()
  URL.revokeObjectURL(url)
})

// --- Editor visual: toggle Presentar/Editar + Guardar ---
editToggleBtn.addEventListener('click', async () => {
  if (!editing) {
    window.DeckEditor.enter(preview, { unsplash: unsplashConfigured })
    editing = true
    editToggleBtn.textContent = '▶ Presentar'
    editToggleBtn.classList.add('active')
    saveBtn.style.display = 'inline-block'
  } else {
    await saveAndExitEditing()
    editToggleBtn.textContent = '✎ Editar'
    editToggleBtn.classList.remove('active')
    saveBtn.style.display = 'none'
  }
})

saveBtn.addEventListener('click', () => { syncSlides() })

// Guarda las ediciones pendientes y sale de modo edición sobre el documento ACTUAL
// del iframe (debe llamarse antes de que preview.src cambie, p. ej. al regenerar
// audio: si no, el editor queda con listeners colgando de un documento ya navegado
// y las ediciones sin guardar se pierden).
async function saveAndExitEditing() {
  if (!editing) return
  await syncSlides()
  window.DeckEditor.exit(preview)
  editing = false
}

async function syncSlides() {
  if (!currentDeckId) return
  const slides = window.DeckEditor.extractSlides(preview)
  setEditIndicator('Guardando…')
  try {
    const res = await fetch(`/api/deck/${currentDeckId}/slides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides }),
    })
    if (res.status === 404) {
      setEditIndicator('El deck expiró; vuelve a generarlo')
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    setEditIndicator('Guardado ✓')
  } catch (err) {
    setEditIndicator('Error al guardar')
  }
}

function setEditIndicator(msg) { editIndicator.textContent = msg }
function resetEditUi() {
  editing = false
  editToggleBtn.textContent = '✎ Editar'
  editToggleBtn.classList.remove('active')
  saveBtn.style.display = 'none'
  setEditIndicator('')
}

// --- Helpers ---
function showStatus(type, msg) {
  statusEl.className = type
  statusEl.innerHTML = type === 'loading' ? `<span class="spinner"></span><span></span>` : ''
  if (type === 'loading') statusEl.lastChild.textContent = msg
  else statusEl.textContent = msg
  statusEl.style.display = type === 'loading' ? 'flex' : 'block'
}
function clearStatus() { statusEl.style.display = 'none'; statusEl.textContent = ''; statusEl.className = '' }

function showResult(html) {
  if (blobUrl) URL.revokeObjectURL(blobUrl)
  blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  preview.src = blobUrl
  resultArea.style.display = 'flex'
  resetEditUi()
}
function hideResult() {
  if (editing && window.DeckEditor) window.DeckEditor.exit(preview)
  resetEditUi()
  closeScriptPanel()
  resultArea.style.display = 'none'
  preview.src = 'about:blank'
  generatedHtml = null
  currentDeckId = null
  deckVoiceId = null
  deckModelId = null
  deckHasAudio = false
  voiceMismatch.style.display = 'none'
  audioPanel.style.display = 'none'
  clearAudioStatus()
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function escAttr(s) { return escHtml(s).replace(/"/g, '&quot;') }

// --- Panel de audio ---
function showAudioPanel() {
  if (!currentDeckId || !audioPanel._voiceConfigured) return
  audioPanel.style.display = 'flex'
  clearAudioStatus()
}

function clearAudioStatus() {
  audioStatus.style.display = 'none'
  audioStatus.textContent = ''
  audioStatus.className = ''
}

function showAudioStatus(type, msg) {
  audioStatus.className = type
  if (type === 'loading') {
    audioStatus.innerHTML = `<span class="spinner"></span><span></span>`
    audioStatus.lastChild.textContent = msg
  } else {
    audioStatus.textContent = msg
  }
  audioStatus.style.display = type === 'loading' ? 'flex' : 'block'
}

regenAudioBtn.addEventListener('click', () => runAudioRegen(showAudioStatus))

/**
 * Re-sintetiza el audio del deck actual (POST /api/audio) y recarga la preview.
 * El servidor solo llama a ElevenLabs por las slides cuya narración haya cambiado.
 * `setStatus(type, msg)` decide en qué panel se ve el progreso (audio o guion).
 */
async function runAudioRegen(setStatus) {
  if (!currentDeckId) {
    setStatus('error', '⚠️ El deck ya no está en el servidor. Vuelve a generarlo.')
    return
  }
  // Si se está editando, guardar y salir ANTES de regenerar: /api/audio lee las
  // slides del store, y el iframe está a punto de navegar a un documento nuevo.
  await saveAndExitEditing()
  setAudioButtonsDisabled(true)
  setStatus('loading', 'Sintetizando audio con ElevenLabs…')

  try {
    const res = await fetch('/api/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: currentDeckId,
        voiceId: regenVoiceSelect.value || undefined,
        modelId: modelSelect.value || undefined,
        subtitles: regenSubs.checked,
        avatarVideo: regenAvatarVideo.checked,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      if (res.status === 404) {
        audioPanel.style.display = 'none'
        currentDeckId = null
        setStatus('error', '⚠️ El deck ya no está en el servidor. Vuelve a generarlo.')
        return
      }
      throw new Error(body.error || `HTTP ${res.status}`)
    }

    const newHtml = await res.text()
    currentDeckId = res.headers.get('X-Deck-Id') || currentDeckId
    // La voz del deck pasa a ser la usada en esta regeneración (y el aviso se apaga).
    setDeckVoice(res.headers.get('X-Audio-Voice'), res.headers.get('X-Audio-Model'))
    generatedHtml = newHtml
    const wasScriptOpen = scriptOpen
    showResult(newHtml)
    // showResult repinta la preview; el panel de guion sobrevive (el texto guardado
    // sigue siendo el del servidor), solo se refrescan las marcas de slide muda.
    if (wasScriptOpen) await openScriptPanel({ keepStatus: true })

    const warning = res.headers.get('X-Voice-Warning') || res.headers.get('X-Avatar-Warning')
    if (warning) setStatus('warning', '⚠️ ' + warning)
    else setStatus('ok', ('Audio actualizado ✓ ' + describeSynth(res.headers.get('X-Audio-Synth'))).trim())
  } catch (err) {
    setStatus('error', err instanceof Error ? err.message : String(err))
  } finally {
    setAudioButtonsDisabled(false)
  }
}

// --- Voz del deck ---
// El audio de un deck está hecho con UNA voz. Regenerar tras editar una slide debe
// seguir usando esa voz (si no, el servidor no puede reutilizar el resto del audio y
// el deck acabaría con dos voces distintas), así que el selector se mantiene en ella
// y solo cambia si el usuario elige otra a mano.

/** Añade una opción al selector si ese valor no está ya entre las suyas. */
function ensureOption(select, value, label) {
  if (!value) return
  if (Array.from(select.options).some((o) => o.value === value)) return
  const opt = document.createElement('option')
  opt.value = value
  opt.textContent = label
  select.appendChild(opt)
}

/**
 * Registra la voz/modelo con los que quedó el audio del deck (cabeceras X-Audio-Voice
 * y X-Audio-Model) y los deja seleccionados en el panel de regenerar. Sin cabeceras
 * (deck generado sin narración) se conserva lo elegido en el panel de generación.
 */
function setDeckVoice(voiceId, modelId) {
  deckHasAudio = Boolean(voiceId)
  deckVoiceId = voiceId || genVoiceSelect.value || null
  deckModelId = modelId || modelSelect.value || null

  // Una voz que ya no esté en ELEVENLABS_VOICES sigue siendo la del deck: se añade al
  // selector para no perderla (si no, quedaría en blanco y regeneraría con otra voz).
  if (deckVoiceId) {
    ensureOption(regenVoiceSelect, deckVoiceId, `Voz del deck (${deckVoiceId.slice(0, 8)}…)`)
    regenVoiceSelect.value = deckVoiceId
  }
  if (deckModelId) {
    ensureOption(modelSelect, deckModelId, `Modelo del deck (${deckModelId})`)
    modelSelect.value = deckModelId
  }
  updateVoiceMismatch()
}

/** Avisa de que regenerar con otra voz rehace TODAS las slides, no solo las editadas. */
function updateVoiceMismatch() {
  const changed =
    deckHasAudio &&
    (regenVoiceSelect.value !== deckVoiceId || modelSelect.value !== deckModelId)
  voiceMismatch.textContent = changed
    ? '⚠️ Voz o modelo distintos a los del audio actual: al regenerar se sintetizarán ' +
      'TODAS las slides, no solo las que hayas editado.'
    : ''
  voiceMismatch.style.display = changed ? 'block' : 'none'
}

regenVoiceSelect.addEventListener('change', updateVoiceMismatch)
modelSelect.addEventListener('change', updateVoiceMismatch)

function setAudioButtonsDisabled(on) {
  regenAudioBtn.disabled = on
  scriptRegenBtn.disabled = on
  scriptSaveBtn.disabled = on || countDirty() === 0
}

/** "synthesized=2;reused=10;failed=0" → "(2 sintetizadas · 10 reutilizadas)". */
function describeSynth(header) {
  if (!header) return ''
  const n = {}
  header.split(';').forEach((p) => {
    const [k, v] = p.split('=')
    n[k] = Number(v) || 0
  })
  const parts = []
  if (n.synthesized) parts.push(`${n.synthesized} sintetizada${n.synthesized === 1 ? '' : 's'}`)
  if (n.reused) parts.push(`${n.reused} reutilizada${n.reused === 1 ? '' : 's'}`)
  if (n.failed) parts.push(`${n.failed} fallida${n.failed === 1 ? '' : 's'}`)
  return parts.length ? `(${parts.join(' · ')})` : ''
}

// --- Panel de guion de voz ---
scriptToggleBtn.addEventListener('click', async () => {
  if (scriptOpen) {
    closeScriptPanel()
    return
  }
  await openScriptPanel()
})

/**
 * Carga el guion del deck desde el servidor y pinta una fila por slide.
 * Reentrante: se vuelve a llamar tras regenerar audio para refrescar los avisos
 * de slide muda (descarta las ediciones sin guardar, que ya se habrán guardado).
 */
async function openScriptPanel(opts) {
  if (!currentDeckId) {
    showScriptStatus('error', '⚠️ El deck ya no está en el servidor. Vuelve a generarlo.')
    return
  }
  scriptPanel.style.display = 'flex'
  scriptOpen = true
  scriptToggleBtn.classList.add('active')
  if (!opts || !opts.keepStatus) showScriptStatus('loading', 'Cargando guion…')

  try {
    const res = await fetch(`/api/deck/${currentDeckId}/narrations`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const { slides } = await res.json()
    scriptBaseline = slides.map((s) => s.narration || '')
    renderScriptList(slides)
    // "Guardar y regenerar" solo tiene sentido con ElevenLabs configurado.
    scriptRegenBtn.style.display = audioPanel._voiceConfigured ? 'inline-block' : 'none'
    if (!opts || !opts.keepStatus) clearScriptStatus()
  } catch (err) {
    scriptList.innerHTML = ''
    showScriptStatus('error', err instanceof Error ? err.message : String(err))
  }
}

function closeScriptPanel() {
  scriptOpen = false
  scriptPanel.style.display = 'none'
  scriptToggleBtn.classList.remove('active')
  scriptList.innerHTML = ''
  scriptBaseline = []
  scriptDirtyEl.textContent = ''
  scriptSaveBtn.disabled = true
  clearScriptStatus()
}

function renderScriptList(slides) {
  scriptList.innerHTML = slides
    .map((s, i) => {
      const label = s.label ? escHtml(s.label) : '<em style="color:#5a5a68">sin titular</em>'
      const chip = s.slideClass ? `<span class="row-chip">${escHtml(s.slideClass)}</span>` : ''
      const mute = s.hasAudio ? '' : '<span class="row-chip mute">sin audio</span>'
      return (
        `<div class="script-row" data-index="${i}">` +
        `<div class="row-head">` +
        `<span class="row-num">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="row-label">${label}</span>${chip}${mute}` +
        `<span class="row-spacer"></span>` +
        `<span class="row-chars"></span>` +
        `<button class="row-goto" type="button" data-goto="${i}">Ver slide</button>` +
        `</div>` +
        `<textarea data-index="${i}" spellcheck="false" rows="2" ` +
        `placeholder="Sin narración — escribe aquí el texto que debe locutar esta slide">` +
        `${escHtml(s.narration || '')}</textarea>` +
        `</div>`
      )
    })
    .join('')

  scriptList.querySelectorAll('textarea').forEach((ta) => {
    autoGrow(ta)
    updateRowChars(ta)
  })
  updateDirtyUi()
}

scriptList.addEventListener('input', (e) => {
  const ta = e.target.closest('textarea')
  if (!ta) return
  autoGrow(ta)
  updateRowChars(ta)
  ta.closest('.script-row').classList.toggle('is-dirty', isRowDirty(ta))
  updateDirtyUi()
})

// "Ver slide": salta la preview a esa slide (hook __deckGo del deck).
scriptList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-goto]')
  if (!btn) return
  try {
    preview.contentWindow.__deckGo(Number(btn.dataset.goto))
  } catch {
    // deck aún cargando o sin el hook (deck antiguo): no hay nada que hacer
  }
})

function autoGrow(ta) {
  ta.style.height = 'auto'
  ta.style.height = Math.min(240, Math.max(62, ta.scrollHeight + 2)) + 'px'
}

function updateRowChars(ta) {
  const el = ta.closest('.script-row').querySelector('.row-chars')
  const n = ta.value.trim().length
  const over = n > NARRATION_MAX_CHARS
  el.className = 'row-chars' + (over ? ' over' : '')
  el.textContent = over ? `${n} car. · supera ${NARRATION_MAX_CHARS}: quedará muda` : `${n} car.`
}

function isRowDirty(ta) {
  const i = Number(ta.dataset.index)
  return ta.value.trim() !== (scriptBaseline[i] || '').trim()
}

function countDirty() {
  let n = 0
  scriptList.querySelectorAll('textarea').forEach((ta) => { if (isRowDirty(ta)) n++ })
  return n
}

function updateDirtyUi() {
  const n = countDirty()
  scriptDirtyEl.textContent = n
    ? `${n} slide${n === 1 ? '' : 's'} modificada${n === 1 ? '' : 's'}`
    : ''
  scriptSaveBtn.disabled = n === 0
}

/** Guarda el guion editado en el store del servidor. Devuelve true si fue bien. */
async function saveNarrations() {
  if (!currentDeckId) {
    showScriptStatus('error', '⚠️ El deck ya no está en el servidor. Vuelve a generarlo.')
    return false
  }
  const narrations = Array.from(scriptList.querySelectorAll('textarea')).map((ta) => ta.value.trim())
  showScriptStatus('loading', 'Guardando guion…')

  try {
    const res = await fetch(`/api/deck/${currentDeckId}/narrations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ narrations }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      if (res.status === 404) currentDeckId = null
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const { changed } = await res.json()
    scriptBaseline = narrations
    scriptList.querySelectorAll('.script-row').forEach((r) => r.classList.remove('is-dirty'))
    updateDirtyUi()
    showScriptStatus(
      'ok',
      changed
        ? `Guion guardado ✓ · ${changed} slide${changed === 1 ? '' : 's'} cambiada${changed === 1 ? '' : 's'}`
        : 'Guion guardado ✓',
    )
    return true
  } catch (err) {
    showScriptStatus('error', err instanceof Error ? err.message : String(err))
    return false
  }
}

scriptSaveBtn.addEventListener('click', () => saveNarrations())

scriptRegenBtn.addEventListener('click', async () => {
  const dirty = countDirty()
  if (dirty && !(await saveNarrations())) return // no regenerar sobre un guion no guardado
  await runAudioRegen(showScriptStatus)
})

function clearScriptStatus() {
  scriptStatus.style.display = 'none'
  scriptStatus.textContent = ''
  scriptStatus.className = ''
}

function showScriptStatus(type, msg) {
  scriptStatus.className = type
  if (type === 'loading') {
    scriptStatus.innerHTML = `<span class="spinner"></span><span></span>`
    scriptStatus.lastChild.textContent = msg
  } else {
    scriptStatus.textContent = msg
  }
  scriptStatus.style.display = type === 'loading' ? 'flex' : 'block'
}

loadThemes()
loadVoices()
loadUnsplashStatus()
loadHeygenStatus()
