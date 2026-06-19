'use strict'

// --- Estado ---
let pdfFile = null
let imageFiles = []
let avatarFile = null
let refFiles = []
let generatedHtml = null
let blobUrl = null

const $ = (id) => document.getElementById(id)

const themeSelect = $('theme-select')
const generateBtn = $('generate-btn')
const statusEl = $('status')
const resultArea = $('result-area')
const preview = $('preview')
const downloadBtn = $('download-btn')

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
})

// --- Generar ---
generateBtn.addEventListener('click', async () => {
  if (!pdfFile) return

  generateBtn.disabled = true
  showStatus('loading', 'Generando presentación con Claude… puede tardar 1-2 minutos.')
  hideResult()

  const form = new FormData()
  form.append('file', pdfFile)
  form.append('theme', themeSelect.value)
  imageFiles.forEach((f) => form.append('images', f))
  if (avatarFile) form.append('avatar', avatarFile)
  refFiles.forEach((f) => form.append('references', f))

  try {
    const res = await fetch('/api/generate', { method: 'POST', body: form })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    generatedHtml = await res.text()
    showResult(generatedHtml)
    clearStatus()
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
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function escAttr(s) { return escHtml(s).replace(/"/g, '&quot;') }

loadThemes()
