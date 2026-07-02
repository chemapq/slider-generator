# PLAN-EDITOR.md — Editor visual del deck ("click para editar")

> **Especificación de ejecución.** Rama `editable-html`. Complementa a
> [PLAN.md](PLAN.md) (generación) y [PLAN-VOZ.md](PLAN-VOZ.md) (voz/subtítulos).
> Escrito para implementarse tarea a tarea. Los snippets son **de referencia**:
> adáptalos al estilo del repo, pero respeta los **contratos** e **invariantes**.

---

## 0. Cómo usar este documento

- Implementa en el orden **T1 → T8**. Cada tarea tiene: *objetivo, archivos, contrato,
  criterio de aceptación*.
- Tras cada tarea que toque `src/`: `npm run typecheck` debe pasar.
- Verificación manual al final (§Verificación). El servidor: `npm run dev` → `http://127.0.0.1:3000`.
- **No** rompas los invariantes de §2. Si algo obliga a hacerlo, para y anótalo.

### Decisiones cerradas (sin ambigüedad)

| Tema | Decisión |
|------|----------|
| Alcance | **Texto + imágenes**. Sin mover/redimensionar/borrar/añadir elementos. |
| UX | Botón toggle **Presentar / Editar** sobre la preview + barra de formato flotante. |
| Persistencia | Descarga WYSIWYG desde el iframe **+** `PUT /api/deck/:id/slides` → `deck-store`. |
| **Set de formato** | **Negrita, Cursiva, Subrayado, Tamaño (A+/A−), Color (paleta del tema + libre), Alineación (izq/centro/der), Limpiar formato.** Listas/enlaces/resaltado → fuera (futuro). |
| **Guardar** | **Ambos**: automático al salir de edición **y** botón "Guardar" explícito. |
| **Reemplazo de imagen** | **Solo subida de archivo local** (no pegar URL en esta iteración). |

### Fuera de alcance

Estructura/layout, editar `narration`/regenerar voz desde texto editado, persistencia en
disco/multiusuario, vídeo u otros medios.

---

## 1. Objetivo

En la preview, un botón alterna **Presentar/Editar**. En edición, click en:

- **texto** → editar contenido + formato básico (set de arriba);
- **imagen** → **Reemplazar** (archivo local) o **Quitar**.

Las ediciones se **descargan** en el HTML y **persisten en servidor** para que
**"Regenerar audio"** las conserve.

---

## 2. Invariantes (NO romper)

1. **El deck descargado queda limpio**: nunca debe contener chrome del editor
   (`contenteditable`, `spellcheck`, atributos `data-ed-*`, la barra, ni el `<style>` del
   editor). La limpieza ocurre en la serialización.
2. **El editor vive en `public/`** y manipula `iframe.contentDocument`. El iframe es
   *same-origin* (blob creado por el parent) → `contentDocument` es accesible.
   - *Fallback si algún entorno bloquea el acceso al blob:* cambiar la preview a
     `preview.srcdoc = html` en vez de `blobUrl` (también same-origin). No cambia nada más.
3. **`fillSlots` es idempotente** sobre HTML ya rellenado (no quedan `data-img`/`data-avatar`).
   Por eso se puede guardar el HTML editado de vuelta en `slide.html` y re-renderizar sin
   alterarlo. **No modificar `fillSlots`.**
4. **La extracción de slides lee solo `innerHTML` de `#stage .slide`** (sin el
   `<aside class="notes">`). No toca `slideClass`, `notes` ni `narration`.
5. **No cambiar** la firma pública de `renderSlides` ni el contrato de `/api/generate` /
   `/api/audio` existentes.

### Anclas del código actual (verificar antes de editar)

- Preview e IDs de resultado: [public/index.html](public/index.html) (`#result-area`,
  `.result-header`, `#preview`, `#download-btn`).
- Estado y flujos cliente: [public/app.js](public/app.js) (`currentDeckId`, `generatedHtml`,
  `blobUrl`, `preview`, `showResult()`, `hideResult()`, handler de `#download-btn`).
- Render y `fillSlots`: [src/services/slides.ts](src/services/slides.ts).
- Store: [src/services/deck-store.ts](src/services/deck-store.ts) (`getDeck`, `putDeck`,
  `DeckContext`).
- Rutas: [src/routes/generate.ts](src/routes/generate.ts) (`generateRoutes(app)`).
- Deck runtime (IIFE de audio/nav): [src/templates/deck.ts](src/templates/deck.ts) (`DECK_JS`).

---

## 3. Tareas

### T1 — Servidor: `updateDeckSlides` en el store

**Archivo:** [src/services/deck-store.ts](src/services/deck-store.ts)

Añadir helper que sobrescribe el HTML de las slides de un deck existente (respetando TTL vía
`getDeck`). No toca `slideClass`/`notes`/`narration`.

```ts
/** Sobrescribe el html de cada slide del deck (respeta TTL). false si no existe/expiró. */
export function updateDeckSlides(id: string, htmls: string[]): boolean {
  const ctx = getDeck(id)            // reutiliza el chequeo de TTL
  if (!ctx) return false
  ctx.slides.slides.forEach((s, i) => {
    if (typeof htmls[i] === 'string') s.html = htmls[i]
  })
  return true
}
```

**Aceptación:** `npm run typecheck` pasa. La longitud se valida en la ruta (T2), no aquí.

---

### T2 — Servidor: endpoint `PUT /api/deck/:id/slides`

**Archivo:** [src/routes/generate.ts](src/routes/generate.ts) (dentro de `generateRoutes`)

**Contrato:**
- **Método/ruta:** `PUT /api/deck/:id/slides`
- **Body (JSON):** `{ "slides": string[] }` — `innerHTML` limpio de cada slide, en orden.
- **`bodyLimit` de la ruta:** `25 * 1024 * 1024` (las slides pueden llevar imágenes base64;
  el default de Fastify es 1 MB y se quedaría corto). Pásalo en las opciones de la ruta.
- **Respuestas:**
  - `200 { ok: true, count }` si actualiza.
  - `400 { error }` si `slides` no es array **o** su longitud ≠ nº de slides del deck.
  - `404 { error }` si el deck no existe/expiró (mismo mensaje que `/api/audio`).

```ts
app.put('/api/deck/:id/slides', { bodyLimit: 25 * 1024 * 1024 }, async (req, reply) => {
  const { id } = req.params as { id: string }
  const body = req.body as { slides?: unknown }
  const slides = body?.slides
  if (!Array.isArray(slides) || !slides.every((s) => typeof s === 'string')) {
    return reply.status(400).send({ error: 'Body inválido: se espera { slides: string[] }.' })
  }
  const ctx = getDeck(id)
  if (!ctx) {
    return reply.status(404).send({ error: 'El deck ya no está disponible. Vuelve a generarlo.' })
  }
  if (slides.length !== ctx.slides.slides.length) {
    return reply.status(400).send({
      error: `Nº de slides no coincide (recibidas ${slides.length}, esperadas ${ctx.slides.slides.length}).`,
    })
  }
  updateDeckSlides(id, slides as string[])
  return reply.send({ ok: true, count: slides.length })
})
```

Añadir `updateDeckSlides` al `import` desde `../services/deck-store.js`.

**Aceptación:** `npm run typecheck` pasa. Con un deck válido, `PUT` responde `200`; con id
inexistente `404`; con longitud errónea `400`.

---

### T3 — Deck runtime: hook para pausar audio (adición mínima y segura)

**Archivo:** [src/templates/deck.ts](src/templates/deck.ts) — dentro del IIFE `DECK_JS`,
al final (antes de `render();`).

Expone una función global para que el editor pueda **pausar** la narración al entrar en
edición (los objetos `Audio` viven en el closure y no son accesibles desde fuera).

```js
  // Hook para el editor externo (no afecta al comportamiento normal del deck).
  window.__deckAudioPause = function () {
    audioOn = false;
    if (prevAudio) prevAudio.pause();
    if (typeof syncBtns === 'function') syncBtns();
  };
```

Es inocuo (una función colgada de `window`; el deck no la llama). Con `audioOn=false`,
`playCurrent()` no reanudará al navegar. **No** cuenta como chrome del editor (es del deck),
así que puede quedar en la descarga.

**Aceptación:** un deck generado define `window.__deckAudioPause`; el comportamiento de
reproducción/navegación no cambia si nadie la llama.

---

### T4 — `public/editor.js` (nuevo): motor del editor

Módulo global (script clásico, sin bundler; coherente con `app.js`). Expone un objeto
`window.DeckEditor` con esta **API**:

```
DeckEditor.enter(iframe)                  // entra en modo edición sobre el doc del iframe
DeckEditor.exit(iframe)                   // sale, restaura presentación
DeckEditor.isActive()                     // bool
DeckEditor.serializeCleanHtml(iframe)     // -> string: deck completo, SIN chrome del editor
DeckEditor.extractSlides(iframe)          // -> string[]: innerHTML limpio de cada .slide
```

Constantes internas:

```js
// Bloques de texto editables dentro de .slide (contenteditable a nivel de bloque).
const TEXT_SEL = 'h1,h2,h3,h4,p,li,blockquote,.lead,.kicker,.eyebrow,.tag,.stat,.num,.brand'
// Atributos/clases que hay que retirar SIEMPRE al serializar/extraer.
const ED_ATTRS = ['contenteditable', 'spellcheck', 'data-ed-editable', 'data-ed-img']
const ED_CLASSES = ['ed-hover', 'ed-selected']
const ED_STYLE_ID = 'ed-style'
const ED_TOOLBAR_ID = 'ed-toolbar'
const ED_IMG_POP_ID = 'ed-imgpop'
```

#### 4.1 `enter(iframe)`

1. `const doc = iframe.contentDocument`. Si no hay `doc` → `console.warn` y return.
2. `iframe.contentWindow.__deckAudioPause?.()` (pausa narración; opcional/seguro).
3. Inyecta `<style id="ed-style">` en `doc.head` con:
   - `.slide [contenteditable]{ outline:none; }`
   - `.ed-hover{ outline:2px dashed rgba(108,99,255,.7); outline-offset:2px; cursor:text; }`
   - `.ed-selected{ outline:2px solid #6c63ff; outline-offset:2px; }`
   - imágenes editables: `.slide [data-ed-img]{ cursor:pointer; }` + `.ed-hover` reutiliza outline.
   - estilos de `#ed-toolbar` y `#ed-imgpop` (fixed, z-index alto, tema oscuro morado como
     el chrome de [public/index.html](public/index.html); NO marca Awakelab).
4. **Texto:** para cada `.slide` y cada match de `TEXT_SEL` dentro de ella, si **ningún
   ancestro dentro de la slide** ya es `contenteditable` (evita anidar editables):
   `el.setAttribute('contenteditable','true'); el.setAttribute('spellcheck','false');
   el.setAttribute('data-ed-editable','')`.
5. **Imágenes:** en cada `.slide`:
   - `img[src]` → `img.setAttribute('data-ed-img','img')`.
   - `[style*="background-image"]` → `el.setAttribute('data-ed-img','bg')`.
6. Construye e inserta la **barra** (`#ed-toolbar`, T5) y el **popover de imagen**
   (`#ed-imgpop`, T6) en `doc.body`.
7. **Guarda de teclado** (evita que las flechas/espacio naveguen mientras se escribe):
   listener en **captura** sobre `iframe.contentWindow`:
   ```js
   function keyGuard(e){
     const a = doc.activeElement
     if (a && a.isContentEditable &&
         ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key)) {
       e.stopPropagation() // el handler del deck (fase burbuja) no se ejecuta
     }
   }
   iframe.contentWindow.addEventListener('keydown', keyGuard, true)
   ```
   Guardar la referencia (p. ej. en `iframe.__edKeyGuard`) para poder quitarla en `exit`.
8. Hover: delegación de eventos en `doc` para poner/quitar `.ed-hover` sobre editables/imágenes.
9. Marca estado activo (`this._active = true`).

> Se marcan **todas** las slides (no solo la activa) para que navegar en modo edición
> funcione sin re-inicializar.

#### 4.2 `exit(iframe)`

Quita: `#ed-toolbar`, `#ed-imgpop`, `#ed-style`, el listener `keyGuard`
(`removeEventListener(..., true)`), los delegados de hover; retira `ED_ATTRS` y `ED_CLASSES`
de todo el doc. `this._active = false`.

#### 4.3 `serializeCleanHtml(iframe)`

```
1. clone = iframe.contentDocument.documentElement.cloneNode(true)
2. En el clon: eliminar #ed-toolbar, #ed-imgpop, #ed-style.
3. Retirar ED_ATTRS de todos los elementos; quitar ED_CLASSES (y class="" vacío).
4. return '<!doctype html>\n' + clone.outerHTML
```

**No** debe quedar ni un `contenteditable` ni la barra. (Verificable con
`.includes('contenteditable')` === false.)

#### 4.4 `extractSlides(iframe)`

```
sections = iframe.contentDocument.querySelectorAll('#stage .slide')
return [...sections].map(sec => {
  const c = sec.cloneNode(true)
  c.querySelectorAll('.notes').forEach(n => n.remove())   // notes las re-añade el render
  // retirar ED_ATTRS y ED_CLASSES en c y descendientes
  return c.innerHTML
})
```

El orden del DOM coincide con el de `renderSlides` → índice i ↔ `slides[i]`.

**Aceptación T4:** cargar un deck en el iframe, `DeckEditor.enter(preview)` marca textos e
imágenes; `serializeCleanHtml` no contiene `contenteditable` ni `#ed-toolbar`;
`extractSlides` devuelve un array con tantos strings como `.slide` hay.

---

### T5 — Barra de formato (dentro de `editor.js`)

Barra `#ed-toolbar` con botones. **Contrato de comandos:**

| Botón | Implementación |
|-------|----------------|
| **B / I / U** | `doc.execCommand('bold'\|'italic'\|'underline')` |
| **Color** | `doc.execCommand('styleWithCSS',false,true)` y luego `doc.execCommand('foreColor',false,color)` |
| **Alineación** | `doc.execCommand('justifyLeft'\|'justifyCenter'\|'justifyRight')` |
| **Limpiar** | `doc.execCommand('removeFormat')` |
| **A+ / A−** | sobre el **bloque editable con el caret** (no la selección): leer `getComputedStyle(block).fontSize`, ±2px, clamp `[10px, 96px]`, set `block.style.fontSize` |

Detalles:
- Antes de comandos de color, activar `styleWithCSS` → se aplica como estilo inline
  (persistible y limpio), no como `<font>`.
- **Swatches de color** = leer tokens del tema desde
  `getComputedStyle(doc.documentElement)`: `--primary`, `--primary-600`, `--ink`,
  `--ink-soft`, `--muted`, `--card` + un `<input type="color">` para color libre. Filtrar
  swatches vacíos.
- **Posición:** mostrar la barra al haber selección/caret dentro de un editable; posicionar
  con `doc.getSelection().getRangeAt(0).getBoundingClientRect()` → `fixed`,
  `top = rect.top - toolbarH - 8` (si negativo, `rect.bottom + 8`), `left` clamped al ancho
  del iframe. Ocultar cuando el foco sale de un editable.
- `A+/A−`: localizar el bloque = ancestro `[data-ed-editable]` del `doc.getSelection().anchorNode`.
- La barra vive en `doc.body` (fuera de `#stage .slide`) → no la captura `extractSlides` ni
  `serializeCleanHtml` (que además la elimina explícitamente).

**Aceptación T5:** seleccionar texto y pulsar B lo pone en negrita; color aplica
`style="color:…"` inline; A+/A− cambia el `font-size` del bloque; la barra aparece junto a
la selección y desaparece al deseleccionar.

---

### T6 — Edición de imágenes (dentro de `editor.js`)

Click en elemento con `[data-ed-img]` → popover `#ed-imgpop` junto a la imagen con
**Reemplazar** y **Quitar**.

**Embudo único (para que en el futuro se puedan enchufar más fuentes — ver §7):**
todo "reemplazar" termina en un solo helper, independientemente del origen del data URI.

```js
// Único punto donde se hornea la imagen en la slide. En esta iteración la fuente es
// un archivo local; en el futuro puede venir de Pexels/stock (mismo destino).
function applyImage(target, dataUri) {
  if (target.getAttribute('data-ed-img') === 'bg') {
    target.style.backgroundImage = "url('" + dataUri + "')"   // conserva size/position ya inline
  } else {
    target.src = dataUri
  }
}
```

- **Reemplazar (archivo local):** `<input type="file" accept="image/*">` (oculto) →
  `FileReader.readAsDataURL` → `applyImage(target, dataURL)`.
  - Validación **no bloqueante**: si `file.size > 3 MB`, avisar (base64 infla el HTML) pero
    permitir continuar.
- **Quitar:** si `="img"` → `target.remove()`; si `="bg"` →
  `target.style.backgroundImage = 'none'`.
- El data URI queda embebido → se descarga y se persiste.
- Posicionar el popover con `target.getBoundingClientRect()` (fixed). Cerrarlo al hacer click
  fuera o al elegir acción.

**Aceptación T6:** click en imagen abre popover; Reemplazar cambia la imagen mostrada; Quitar
la elimina; tras `serializeCleanHtml` el nuevo `src`/`background` está presente y no hay
atributos `data-ed-img`.

---

### T7 — UI: toggle Presentar/Editar + Guardar (`index.html` + `app.js`)

**`public/index.html`** — en `.result-header`, junto a `#download-btn`, añadir:

```html
<button id="edit-toggle-btn" type="button">✎ Editar</button>
<button id="save-btn" type="button" style="display:none">Guardar</button>
<span id="edit-indicator" aria-live="polite"></span>
```
Cargar el editor antes de `app.js`: `<script src="editor.js"></script>` (o `app.js` primero
si prefieres, pero `DeckEditor` debe existir al pulsar el toggle). Estilos coherentes con el
chrome oscuro morado actual.

**`public/app.js`** — nuevo estado y wiring:

- `let editing = false`.
- Referencias: `$('edit-toggle-btn')`, `$('save-btn')`, `$('edit-indicator')`.
- **Toggle:**
  - Entrar: `DeckEditor.enter(preview)`, `editing=true`, botón → "▶ Presentar",
    `save-btn` visible.
  - Salir: `DeckEditor.exit(preview)`, `editing=false`, botón → "✎ Editar",
    `save-btn` oculto, y **auto-guardar** (`await syncSlides()`).
- **`syncSlides()`** (nuevo):
  ```js
  async function syncSlides() {
    if (!currentDeckId || !DeckEditor.isActive?.() && !editing) { /* usar estado adecuado */ }
    const slides = DeckEditor.extractSlides(preview)
    setEditIndicator('Guardando…')
    try {
      const res = await fetch(`/api/deck/${currentDeckId}/slides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides }),
      })
      if (res.status === 404) { setEditIndicator('El deck expiró; vuelve a generarlo'); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setEditIndicator('Guardado ✓')
    } catch (e) { setEditIndicator('Error al guardar') }
  }
  ```
  (Extrae las slides **antes** de `DeckEditor.exit` si sales, o llama a `syncSlides` antes de
  `exit`. Simplifica: en "salir", primero `syncSlides()` con el editor aún activo, luego `exit`.)
- **Botón Guardar** (explícito): `syncSlides()` sin salir de edición.
- **Descarga** (modificar handler de `#download-btn`): serializar el iframe (WYSIWYG, incluye
  audio y ediciones), con fallback a `generatedHtml`:
  ```js
  downloadBtn.addEventListener('click', () => {
    let html = null
    try { if (window.DeckEditor && preview.contentDocument) html = DeckEditor.serializeCleanHtml(preview) } catch {}
    if (!html) html = generatedHtml
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const a = document.createElement('a'); a.href = url; a.download = 'presentacion.html'; a.click()
    URL.revokeObjectURL(url)
  })
  ```
- **`hideResult()`**: si `editing`, salir de edición primero
  (`DeckEditor.exit(preview); editing=false`) y resetear botones/indicador. Ocultar
  `edit-toggle-btn`/`save-btn` cuando no hay deck.
- **`showResult(html)`**: al mostrar un deck nuevo, asegurar `editing=false`, botón en
  "✎ Editar", `save-btn` oculto, indicador vacío. El toggle solo debe estar operativo con
  `#result-area` visible.

**Aceptación T7:** con un deck generado, "Editar" activa edición; "Guardar" hace `PUT` y
muestra "Guardado ✓"; "Presentar" auto-guarda y vuelve a presentación; "Descargar" baja un
HTML con las ediciones y **sin** `contenteditable`.

---

### T8 — Integración con "Regenerar audio"

**Sin cambios de código** en `/api/audio`: al re-renderizar lee `ctx.slides` (ya
actualizado por el `PUT`), así que hereda las ediciones (invariante §2.3).

**Verificar el flujo:** editar → Guardar (`PUT`) → Regenerar audio → el HTML devuelto
(que `showResult` vuelve a pintar) **mantiene** las ediciones y trae el audio nuevo. Al
re-entrar en edición sigue siendo editable.

**Aceptación T8:** las ediciones persisten tras "Regenerar audio".

---

## 4. Verificación (manual)

1. `npm run typecheck` — sin errores.
2. `npm run dev` → `http://127.0.0.1:3000`. Generar un deck (PDF + tema; requiere API key).
3. **Texto:** Editar → click en un título → escribir; seleccionar → B/I/U, color, A+/A−,
   alineación, limpiar. La barra aparece junto a la selección.
4. **Teclado:** con el caret en un texto, las flechas mueven el cursor (no cambian de slide);
   fuera de un editable, las flechas navegan.
5. **Imágenes:** click en imagen → Reemplazar (archivo local) y Quitar funcionan.
6. **Guardar:** botón "Guardar" → "Guardado ✓". "Presentar" auto-guarda.
7. **Descargar:** el HTML descargado abre bien, refleja las ediciones y **no** contiene
   `contenteditable`, `#ed-toolbar` ni `data-ed-*` (búsqueda de texto en el archivo).
8. **Persistencia:** editar → Guardar → "Regenerar audio" → las ediciones siguen ahí + audio.
9. **Robustez:** reiniciar el server y pulsar Guardar → indicador "El deck expiró; vuelve a
   generarlo" (`404`), sin romper la UI; la descarga sigue funcionando.

---

## 5. Definición de "hecho"

- [ ] T1–T8 implementadas; `npm run typecheck` limpio.
- [ ] Descarga WYSIWYG y **limpia** (invariante §2.1).
- [ ] Formato: B/I/U, tamaño, color (paleta+libre), alineación, limpiar.
- [ ] Imágenes: reemplazar (archivo) y quitar.
- [ ] Guardado auto (al salir) + botón explícito; `PUT /api/deck/:id/slides` OK.
- [ ] Las ediciones sobreviven a "Regenerar audio".
- [ ] Guarda de teclado activa en `contenteditable`.
- [ ] Casos 404/expiración manejados sin romper.

---

## 7. Extensión futura — búsqueda de imágenes (Pexels/stock)

**No** es parte de esta iteración, pero el diseño de T6 la deja lista: "reemplazar" pasa por
el embudo único `applyImage(target, dataUri)`, así que un proveedor nuevo es **aditivo**.

Para añadir Pexels (u otro stock) más adelante:

1. **Servidor (proxy, gated por `PEXELS_API_KEY` en `.env` — mismo patrón que ElevenLabs):**
   - `GET /api/images/search?q=…&page=…` → llama a Pexels con la key **en el servidor**
     (nunca en el cliente) y devuelve `[{ id, thumb, url, alt, photographer }]`.
   - `GET /api/images/fetch?url=…` (o `POST` con el id) → **descarga los bytes en el servidor**
     y los devuelve como data URI (o binario). Esto evita CORS y mantiene el deck
     **autocontenido**.
2. **Cliente:** en `#ed-imgpop`, junto a "Reemplazar (archivo)", una pestaña **"Buscar"** con
   input + rejilla de resultados. Al elegir → pedir el data URI al proxy → `applyImage(target, dataUri)`.

**Decisión de diseño a preservar:** hornear la imagen **inline como data URI** (proxy la
descarga), no referenciar la URL remota. Mantiene el invariante "todo embebido/offline" del
proyecto y evita URLs que caducan. (Un modo "URL remota" ligero sería opcional.)

**Atención a la licencia:** Pexels es de uso libre pero pide/recomienda atribución al autor
en ciertos contextos → guardar `photographer`/`url` para mostrar crédito si se necesita.

Ningún cambio de T1–T8 se ve afectado por esto: solo se suman endpoints y UI de búsqueda.

---

## 8. Notas de riesgo (contexto para quien implemente)

- `document.execCommand` está **deprecado** pero es suficiente y pragmático aquí (tool local,
  navegador moderno). Plan B: manipular `Range`/`Selection` a mano si hiciera falta más control.
- **Peso**: imágenes reemplazadas van en base64 → HTML grande. Aviso no bloqueante (T6) y
  `bodyLimit` alto en el `PUT` (T2).
- **TTL/reinicio** del store (2 h / reinicio) → `PUT` da 404; la descarga (cliente) no depende
  del server.
- **Undo**: se apoya en el undo nativo por `contenteditable` (Cmd/Ctrl+Z). Undo global
  multi-campo queda fuera.
- **Estilo de la barra**: sigue el chrome oscuro morado de la app, **no** la guía de marca
  Awakelab (es chrome de herramienta, no un entregable visual).
