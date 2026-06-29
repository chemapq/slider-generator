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
let currentDeckId = null

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
const genVoiceSelect = $('gen-voice-select')
const modelSelect    = $('model-select')
const audioPanel     = $('audio-panel')
const regenVoiceSelect = $('regen-voice-select')
const regenAudioBtn  = $('regen-audio-btn')
const regenSubs      = $('regen-subs')
const audioStatus    = $('audio-status')

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
})
chkSubs.addEventListener('change', () => { subtitlesEnabled = chkSubs.checked })

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
    showResult(generatedHtml)
    showAudioPanel()
    const voiceWarning = res.headers.get('X-Voice-Warning')
    if (voiceWarning) showStatus('warning', '⚠️ ' + voiceWarning)
    else clearStatus()
  } catch (err) {
    showStatus('error', err instanceof Error ? err.message : String(err))
  } finally {
    generateBtn.disabled = false
  }
})

// --- Descargar ---
downloadBtn.addEventListener('click', () => {
  if (!generatedHtml) return
  const a = document.createElement('a')
  const url = URL.createObjectURL(new Blob([generatedHtml], { type: 'text/html' }))
  a.href = url
  a.download = 'presentacion.html'
  a.click()
  URL.revokeObjectURL(url)
})

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
}
function hideResult() {
  resultArea.style.display = 'none'
  preview.src = 'about:blank'
  generatedHtml = null
  currentDeckId = null
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

regenAudioBtn.addEventListener('click', async () => {
  if (!currentDeckId) return
  regenAudioBtn.disabled = true
  showAudioStatus('loading', 'Sintetizando audio con ElevenLabs…')

  try {
    const res = await fetch('/api/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: currentDeckId,
        voiceId: regenVoiceSelect.value || undefined,
        modelId: modelSelect.value || undefined,
        subtitles: regenSubs.checked,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      if (res.status === 404) {
        audioPanel.style.display = 'none'
        currentDeckId = null
        showAudioStatus('error', '⚠️ El deck ya no está en el servidor. Vuelve a generarlo.')
        return
      }
      throw new Error(body.error || `HTTP ${res.status}`)
    }

    const newHtml = await res.text()
    currentDeckId = res.headers.get('X-Deck-Id') || currentDeckId
    generatedHtml = newHtml
    showResult(newHtml)

    const warning = res.headers.get('X-Voice-Warning')
    if (warning) showAudioStatus('warning', '⚠️ ' + warning)
    else clearAudioStatus()
  } catch (err) {
    showAudioStatus('error', err instanceof Error ? err.message : String(err))
  } finally {
    regenAudioBtn.disabled = false
  }
})

loadThemes()
loadVoices()
