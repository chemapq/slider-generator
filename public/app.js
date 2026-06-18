// @ts-check
'use strict'

const dropZone = /** @type {HTMLDivElement} */ (document.getElementById('drop-zone'))
const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('file-input'))
const fileNameEl = /** @type {HTMLParagraphElement} */ (document.getElementById('file-name'))
const themeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('theme-select'))
const generateBtn = /** @type {HTMLButtonElement} */ (document.getElementById('generate-btn'))
const statusEl = /** @type {HTMLDivElement} */ (document.getElementById('status'))
const resultArea = /** @type {HTMLDivElement} */ (document.getElementById('result-area'))
const preview = /** @type {HTMLIFrameElement} */ (document.getElementById('preview'))
const downloadBtn = /** @type {HTMLButtonElement} */ (document.getElementById('download-btn'))

let selectedFile = /** @type {File | null} */ (null)
let generatedHtml = /** @type {string | null} */ (null)
let blobUrl = /** @type {string | null} */ (null)

// --- Cargar temas ---
async function loadThemes() {
  try {
    const res = await fetch('/api/themes')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const themes = /** @type {{ name: string; label: string }[]} */ (await res.json())
    themeSelect.innerHTML = themes
      .map((t) => `<option value="${escHtml(t.name)}">${escHtml(t.label)}</option>`)
      .join('')
  } catch {
    themeSelect.innerHTML = '<option value="timely-ai">timely-ai</option>'
  }
}

// --- Drag & drop ---
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over')
})

dropZone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer?.files[0]
  if (file) setFile(file)
})

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) setFile(file)
})

function setFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    showStatus('error', 'Solo se admiten archivos PDF.')
    return
  }
  selectedFile = file
  fileNameEl.textContent = file.name
  dropZone.classList.add('has-file')
  generateBtn.disabled = false
  clearStatus()
  hideResult()
}

// --- Generar ---
generateBtn.addEventListener('click', async () => {
  if (!selectedFile) return

  generateBtn.disabled = true
  showStatus('loading', 'Generando slides con Claude… esto puede tardar un minuto.')
  hideResult()

  const form = new FormData()
  form.append('file', selectedFile)
  form.append('theme', themeSelect.value)

  try {
    const res = await fetch('/api/generate', { method: 'POST', body: form })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }

    generatedHtml = await res.text()
    showResult(generatedHtml)
    clearStatus()
  } catch (err) {
    showStatus('error', String(err instanceof Error ? err.message : err))
  } finally {
    generateBtn.disabled = false
  }
})

// --- Descargar ---
downloadBtn.addEventListener('click', () => {
  if (!generatedHtml) return
  const a = document.createElement('a')
  const blob = new Blob([generatedHtml], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = `slides-${Date.now()}.html`
  a.click()
  URL.revokeObjectURL(url)
})

// --- Helpers ---
function showStatus(type, msg) {
  statusEl.className = type
  statusEl.textContent = msg
  statusEl.style.display = 'block'
}

function clearStatus() {
  statusEl.style.display = 'none'
  statusEl.textContent = ''
  statusEl.className = ''
}

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
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl)
    blobUrl = null
  }
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Arrancar
loadThemes()
