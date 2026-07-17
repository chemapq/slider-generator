# PLAN-HEYGEN.md — Avatar en vídeo (HeyGen) en intro y outro

> **Cuarto plan.** Complementa a [PLAN.md](PLAN.md) (generación), [PLAN-VOZ.md](PLAN-VOZ.md)
> (voz/subtítulos) y [PLAN-EDITOR.md](PLAN-EDITOR.md) (editor visual). Sustituye la **foto
> estática del avatar-tutor** (`.tutor .photo img[data-avatar]`, presente solo en la primera y
> última slide) por un **vídeo de avatar parlante generado con HeyGen**, con lip-sync sobre la
> narración de esa slide. Escrito para implementarse tarea a tarea (H1 → H7).

---

## 0. Cómo usar este documento

- Implementa en el orden **H1 → H7**. Cada tarea tiene: *objetivo, archivos, contrato,
  criterio de aceptación*.
- Tras cada tarea que toque `src/`: `npm run typecheck` debe pasar.
- Verificación al final (§8) con la skill `verify` (Chromium headless, sin gastar APIs) +
  una pasada manual real con las tres claves configuradas.
- **No** rompas los invariantes de §2. Si algo obliga a hacerlo, para y anótalo.

### Decisiones (recomendadas por defecto; cambiables antes de empezar)

| Tema | Decisión |
|------|----------|
| **API** | **HeyGen v3** (`api.heygen.com/v3/…`). La v2 queda descatalogada el **31-oct-2026** (~3 meses): no tiene sentido empezar en v2. |
| **Personaje** | **Avatar de estudio HeyGen** vía `HEYGEN_AVATAR_ID` (env) como modo base. Animar la foto subida por el usuario (modo `image` con base64) queda como **extensión opcional H8** — ver §7 riesgos (consentimiento/moderación). |
| **Voz del vídeo** | **El mismo mp3 de ElevenLabs** de esa slide, subido como asset a HeyGen (`audio_asset_id`) → lip-sync con la voz que narra el resto del deck y los cues de subtítulos siguen siendo válidos. **Requiere voz activada**: sin narración TTS no hay avatar en vídeo. |
| **Empaquetado** | **mp4 descargado y embebido como data URI** en el HTML (autocontenido). El `video_url` de HeyGen caduca a los **7 días** → embeber no es opcional, es obligatorio. |
| **Formato del vídeo** | `aspect_ratio: "1:1"`, `resolution: "720p"`, `output_format: "mp4"`, `fit: "cover"`. Va dentro del círculo `.tutor .photo` (máscara circular), así que no hace falta webm con alfa. |
| **Qué slides** | Las que contengan el slot `<img data-avatar>` (por contrato del prompt: solo `intro` y `outro`). No se hardcodea "primera y última": el slot manda. |
| **Fallos** | **Aislados, como Unsplash/TTS**: timeout o error de HeyGen → esa slide conserva la **foto estática** y se emite `X-Avatar-Warning`. Nunca tumba la generación. |
| **UI** | Checkbox "Avatar en vídeo (HeyGen)" en el panel de sonido, solo habilitado si voz=on y el servidor reporta HeyGen configurado (`GET /api/heygen`). |

### Fuera de alcance

Avatar en slides intermedias, streaming/interactive avatar (LiveAvatar), plantillas de HeyGen,
webm transparente, editar el vídeo desde el editor visual, regenerar el vídeo al editar texto,
persistencia en disco.

---

## 1. Objetivo

Hoy: `PDF → Claude → slides JSON → (Unsplash) → (ElevenLabs TTS) → deck HTML autocontenido`,
y en intro/outro el renderer inyecta la foto del avatar en `<img data-avatar>`.

Con este plan, si el usuario activa "Avatar en vídeo":

```
TTS listo (mp3 por slide)
  └─ para cada slide con <img data-avatar> (intro, outro):
       1. POST /v3/assets            ← sube el mp3 de esa slide          → audio_asset_id
       2. POST /v3/videos            ← avatar_id + audio_asset_id + 1:1  → video_id
       3. GET  /v3/videos/{id}       ← poll hasta completed/failed
       4. fetch(video_url)           ← descarga el mp4 (caduca en 7 días)
       5. data:video/mp4;base64,…    ← se embebe; sustituye al <img data-avatar>
```

En el deck, esas slides reproducen **el vídeo** (que ya contiene el audio) en lugar del mp3;
subtítulos, anillo de cuenta atrás, play/pausa, mute y auto-avance funcionan idénticos.

---

## 2. Invariantes (no romper)

1. **HTML único autocontenido**: nada de URLs remotas en el deck final (el `video_url` caduca).
2. **Fallo aislado**: HeyGen caído/lento/sin créditos → deck válido con foto estática + warning.
3. **Deck sin avatar-vídeo = byte-idéntico al actual**: si el toggle está off o no hay clave,
   ninguna ruta de código nueva altera el HTML generado (mismo criterio que `__DECK_AUDIO__`).
4. **Autoplay**: el vídeo NO arranca solo; obedece el mismo `unlock()` por gesto del usuario.
5. **Una sola fuente de sonido por slide**: en slides con vídeo, el mp3 de ElevenLabs **no** se
   embebe también en `__DECK_AUDIO__` (evita doble audio y ~MBs duplicados); los `cues` sí.
6. El editor visual sigue funcionando; el `<video>` no es editable (su selector ya solo marca
   `img[src]`, verificar en H7).

---

## 3. Hechos clave (API HeyGen v3 — verificados 2026-07-15)

- **Auth:** header `x-api-key: <HEYGEN_API_KEY>` (Settings → API en app.heygen.com).
- **Subir asset:** `POST https://api.heygen.com/v3/assets`, multipart/form-data, campo `file`
  (binario; MIME autodetectado). Soporta mp3/wav/png/jpeg/mp4… **Máx 32 MB.**
  Respuesta: `{ asset_id, url, mime_type, size_bytes }`. Header opcional `Idempotency-Key`
  (ventana de 24 h) — útil en reintentos.
- **Crear vídeo:** `POST https://api.heygen.com/v3/videos`. Body (modo avatar + audio):
  ```json
  {
    "type": "avatar",
    "avatar_id": "<HEYGEN_AVATAR_ID>",
    "audio_asset_id": "<asset del mp3>",
    "resolution": "720p",
    "aspect_ratio": "1:1",
    "fit": "cover",
    "output_format": "mp4",
    "title": "deck <deckId> · slide <n>"
  }
  ```
  `audio_asset_id`/`audio_url` son **mutuamente excluyentes** con `script`+`voice_id`.
  Respuesta: `{ data: { video_id, status: "waiting", … } }`.
  Errores: 400 (params), 401 (clave), 429 (rate limit, trae `Retry-After`), 409 (idempotencia).
  Motores: `avatar_iii` / `avatar_iv` (default) / `avatar_v`.
- **Estado:** `GET https://api.heygen.com/v3/videos/{video_id}` → poll hasta
  `status: "completed"` (trae `video_url`) o `"failed"`. **El `video_url` caduca a los 7 días**
  (cada consulta de estado regenera la firma) → descargar inmediatamente.
- **Duración de generación:** minutos por vídeo (cola de HeyGen, no controlable). Presupuestar
  **~1–5 min por vídeo**; intro y outro se lanzan **en paralelo** (2 vídeos).
- **v2 legacy** (`/v2/video/generate`, `/v1/video_status.get`) soportada solo hasta
  **31-oct-2026**. No usar.
- **Coste:** se factura en créditos de API por duración de vídeo generado; el trial de API da
  créditos limitados (vídeos de prueba con marca de agua). Verificar cuota del plan en
  https://www.heygen.com/api-pricing antes de iterar — **no regenerar decks enteros para probar**
  (mismo criterio que la cuota free de ElevenLabs en PLAN-VOZ).
- **Catálogo de avatares:** endpoint de listado de avatares (para elegir `HEYGEN_AVATAR_ID` una
  vez, a mano, o para un selector futuro). No se integra selector en este plan.

---

## 4. Arquitectura: archivos nuevos y cambios

```
slider-generator/
  .env / .env.example          # + HEYGEN_API_KEY, HEYGEN_AVATAR_ID
  src/
    services/heygen.ts         # NUEVO: upload asset → create video → poll → download → base64
    services/slides.ts         # CAMBIA: DeckVideos; <img data-avatar> → <video data-avatar-video>;
                               #         __DECK_AUDIO__ con src:null en slides con vídeo
    services/deck-store.ts     # CAMBIA: DeckContext guarda audio y videos (para re-render)
    templates/deck.ts          # CAMBIA: CSS .photo video + motor: getAudio() devuelve el <video>
    routes/generate.ts         # CAMBIA: orquestación en /api/generate y /api/audio; GET /api/heygen
  public/
    index.html                 # CAMBIA: checkbox "Avatar en vídeo (HeyGen)" en panel de sonido
    app.js                     # CAMBIA: envía avatarVideo=on; fase "Generando avatar…"; warnings
    editor.js                  # VERIFICA: el <video> queda fuera del modo edición
```

Tipo central (en `heygen.ts`, espejo de `DeckAudio`):

```ts
export interface SlideVideo {
  /** mp4 en base64, SIN prefijo data:. */
  videoBase64: string
  mime: 'video/mp4'
  durationSec: number
}
/** Alineado por índice con data.slides. null = slide sin vídeo de avatar. */
export type DeckVideos = (SlideVideo | null)[]
```

---

## 5. Tareas

### H1 — Servicio `src/services/heygen.ts`

**Objetivo:** encapsular todo el ciclo HeyGen con el mismo estilo que `tts.ts` (fetch nativo,
retry/backoff propio, fallos por-slide aislados).

**Contrato:**

```ts
export function isHeygenConfigured(): boolean  // HEYGEN_API_KEY && HEYGEN_AVATAR_ID

/**
 * Genera un vídeo de avatar por cada índice presente en `jobs`, lip-sync con su mp3.
 * Devuelve un array alineado con la longitud del deck; null = sin vídeo (no pedido o fallo).
 * NUNCA lanza por un fallo individual; solo lanza si falta configuración.
 */
export async function generateAvatarVideos(
  slideCount: number,
  jobs: { index: number; audioBase64: string }[],
  opts?: { avatarId?: string },
): Promise<DeckVideos>
```

Internos:
- `uploadAudioAsset(mp3Buffer)` → `asset_id`. Reusar el patrón `fetchWithRetry` de `tts.ts`
  (reintenta 429/5xx/red con backoff+jitter; 4xx no-429 lanza ya). En 429 respetar `Retry-After`.
- `createVideo(assetId, avatarId)` → `video_id`.
- `pollVideo(videoId)` → poll `GET /v3/videos/{id}` cada **5 s**, timeout duro **10 min**
  (`HEYGEN_POLL_TIMEOUT_MS` opcional). `failed` o timeout → error de esa slide (→ null + warn).
- `downloadVideo(videoUrl)` → Buffer → base64. Si el mp4 supera **~24 MB** (≈32 MB en base64),
  log + null: no inflamos el HTML sin límite.
- Los dos jobs (intro/outro) corren **en paralelo** (`Promise.all` de workers, como el pool de
  `tts.ts`; con 2 jobs no hace falta pool).

**Aceptación:** `npm run typecheck` pasa; con `HEYGEN_API_KEY` inválida, `generateAvatarVideos`
devuelve `[null,…]` y loguea `[heygen] …` sin lanzar.

---

### H2 — Renderer: `slides.ts` acepta vídeos

**Objetivo:** que `renderSlides` reciba `videos?: DeckVideos` y los materialice.

**Contrato:**
- Firma: `renderSlides(data, theme, images?, audio?, opts?, videos?)` (o fusionar `videos` en un
  objeto de opciones — a criterio del implementador, pero sin romper llamadas existentes).
- En `fillSlots`, **por slide**: si `videos[i]` existe, el reemplazo de `<img data-avatar>` emite
  en su lugar:
  ```html
  <video data-avatar-video preload="auto" playsinline
         poster="<data URI de la foto avatar, si existe>"
         src="data:video/mp4;base64,…"></video>
  ```
  Sin `autoplay`, sin `controls`, sin `loop` (lo gobierna el motor del deck). Si `videos[i]` es
  null → comportamiento actual (foto o nada).
- En `buildAudioScript`: para slides con vídeo, la entrada de `__DECK_AUDIO__` pasa a
  `{ src: null, cues }` (invariante §2.5 — el audio va dentro del mp4). El tipo de la entrada
  cambia a `{ src: string | null, cues }`.

**Aceptación:** unit-check rápido (script o fixture): render con un `DeckVideos` fake (mp4
mínimo en base64) contiene `<video data-avatar-video` en intro/outro, no contiene el mp3 de esas
slides, y un render con `videos` vacío es **idéntico** al actual.

---

### H3 — Motor del deck: `templates/deck.ts`

**Objetivo:** que el vídeo se comporte como el audio de su slide, con cero divergencia de UX.

**Contrato:**
- CSS en `BASE_CSS`:
  ```css
  .tutor .photo video[data-avatar-video] { width:100%; height:100%; object-fit:cover; display:block; }
  ```
  (el recorte circular ya lo aporta `.photo` del tema).
- JS: `getAudio(i)` se generaliza a `getMedia(i)`:
  1. Si la slide `i` contiene `video[data-avatar-video]` → devolver **ese elemento** (cachearlo).
  2. Si no, comportamiento actual (`new Audio(src)` desde `__DECK_AUDIO__[i].src`).

  `HTMLVideoElement` y `Audio` comparten la API que usa el motor (`play/pause/currentTime/
  duration/muted/onended/ontimeupdate/onloadedmetadata`), así que `playCurrent()`, el anillo
  `#audio-timer`, los subtítulos (cues de `__DECK_AUDIO__[i].cues` sobre `media.currentTime`),
  `toggleMute` (itera la cache) y el auto-avance **no cambian**.
- `hasAudio` pasa a: hay alguna entrada de `__DECK_AUDIO__` **o** algún `video[data-avatar-video]`
  en el DOM.
- Al salir de la slide, el reset actual (`pause() + currentTime=0`) ya aplica al vídeo (misma
  referencia `prevAudio`). Verificar que el póster no “parpadea” al resetear; si molesta, basta
  no resetear `currentTime` hasta `ended`.

**Aceptación:** con la skill `verify`: en un deck fixture con vídeo, al primer gesto el vídeo se
reproduce, el anillo cuenta atrás con su duración, los subtítulos aparecen, `m` lo silencia, y
con "Reproducir todo" el `ended` del vídeo avanza de slide.

---

### H4 — Orquestación en `POST /api/generate`

**Objetivo:** integrar HeyGen tras el TTS, con fallo aislado.

**Contrato:**
- Nuevo campo del form: `avatarVideo` → `"on"`. Solo actúa si **además** `voice=on`, hay
  `ELEVENLABS_API_KEY`, `isHeygenConfigured()` y el TTS produjo audio.
- Tras `synthesizeDeck`: detectar índices de slides cuyo `html` contenga `data-avatar` (regex
  sobre `slides.slides[i].html`, mismo patrón que `fillSlots`). Para cada índice con
  `audio[i] !== null`, montar `jobs` y llamar `generateAvatarVideos`.
- Fallos: `try/catch` alrededor de todo el bloque + nulls por-slide dentro → si no hay ningún
  vídeo, header `X-Avatar-Warning: "No se pudo generar el avatar en vídeo; se usa la foto."`.
- `renderSlides(…, videos)` y **guardar en el store** (H5) para re-render.

**Aceptación:** petición con `avatarVideo=on` y HeyGen roto → 200, deck con foto estática y
header presente. Con HeyGen ok → deck con `<video>` en intro/outro. Sin el campo → flujo actual
intacto (invariante §2.3).

---

### H5 — `deck-store.ts` y `POST /api/audio`

**Objetivo:** que re-locutar no deje vídeos con lip-sync de una voz antigua.

**Contrato:**
- `DeckContext` gana `audio?: DeckAudio` y `videos?: DeckVideos` (se rellenan en /api/generate).
  Nota: sube el peso por entrada; `MAX_DECKS=20` puede bajarse a 10 si preocupa la RAM.
- `POST /api/audio` acepta `avatarVideo?: boolean`:
  - `true` → tras sintetizar el nuevo audio, **regenerar** los vídeos con HeyGen (mismos slots),
    coste real de créditos; fallos aislados como en H4.
  - `false`/omitido → re-render **sin** vídeos (foto estática) aunque el deck los tuviera, +
    `X-Avatar-Warning` explicando que la nueva voz descartó el avatar en vídeo.
  Nunca reutilizar vídeos viejos con audio nuevo (desincronía labial garantizada).
- `PUT /api/deck/:id/slides` (editor): sin cambios de contrato — el HTML editado ya llega con el
  `<video>` materializado dentro (data URI), igual que hoy llega el `src` de las imágenes.

**Aceptación:** re-locutar con otra voz sin marcar avatar → deck con foto + warning; marcándolo
→ vídeos nuevos. `npm run typecheck`.

---

### H6 — UI: `index.html` + `app.js` + `GET /api/heygen`

**Objetivo:** exponer el toggle solo cuando puede funcionar.

**Contrato:**
- `GET /api/heygen` → `{ configured: boolean }` (clave + avatar id presentes).
- Panel de sonido: checkbox **"Avatar en vídeo (HeyGen)"**, deshabilitado (con tooltip) si voz
  está off o `configured=false`. `app.js` añade `avatarVideo=on` al FormData y al body de
  `/api/audio`.
- Progress circle: nueva fase textual "Generando avatar en vídeo…" tras "Generando voz…"
  (aprox.; el progreso sigue siendo estimado como hasta ahora).
- Mostrar `X-Avatar-Warning` con el mismo mecanismo que `X-Voice-Warning`/`X-Image-Warning`.

**Aceptación:** sin claves HeyGen el checkbox aparece deshabilitado; con ellas, el flujo completo
funciona desde la UI.

---

### H7 — Editor visual + verificación de regresión

**Objetivo:** confirmar que el editor ignora el vídeo.

**Contrato:** `editor.js` marca imágenes con `slide.querySelectorAll('img[src]')`
([editor.js:156](public/editor.js#L156)) — el `<video>` no matchea. Añadir guarda defensiva:
al entrar en modo edición, ningún `ED_ATTRS` debe aplicarse a `video[data-avatar-video]` ni a
sus ancestros `.tutor` (si `.tutor` tuviera background-image, excluirlo del marcado `bg`).
Pausar el vídeo al entrar en edición (ya existe `window.__deckAudioPause`; cubrirá el vídeo al
generalizarse `getMedia` en H3 — verificar).

**Aceptación:** en modo edición, click sobre el avatar-vídeo no abre popover ni toolbar; el
texto de intro/outro sigue siendo editable; guardar y descargar conserva el `<video>`.

---

### H8 (opcional, decisión aparte) — Animar la foto subida

Modo `image` de v3 (`type:"image"`, `image: <base64>` + `audio_asset_id`): el avatar en vídeo
sería **la propia foto del tutor subida**, hablando. Encaja perfecto con el flujo actual, pero:
HeyGen aplica **moderación y requisitos de consentimiento** a rostros subidos (fotos de terceros
sin permiso → rechazo o baneo de cuenta), y la calidad del lip-sync sobre foto (Avatar IV)
varía con el encuadre. Si se aborda: `HEYGEN_AVATAR_ID` pasa a fallback y la foto subida tiene
prioridad; el resto del pipeline (H1–H7) no cambia — solo el body de `createVideo`.

---

## 6. Variables de entorno (`.env.example`)

```bash
# HeyGen (avatar en vídeo para intro/outro). https://app.heygen.com → Settings → API
HEYGEN_API_KEY=
HEYGEN_AVATAR_ID=            # avatar de estudio a usar (catálogo en la app/API de HeyGen)
# HEYGEN_POLL_TIMEOUT_MS=600000
```

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| **Latencia**: +1–5 min por vídeo en /api/generate | Solo 2 vídeos, en paralelo; fase visible en el progress circle; timeout de 10 min → foto estática. |
| **Peso del HTML**: 2 mp4 720p de 30–90 s ≈ 2–8 MB c/u (+33% en base64) | 720p 1:1 (no 1080p); tope de 24 MB por vídeo (H1); el mp3 de esas slides ya no se embebe (§2.5). Si el outro narra medio PDF, avisar en log del tamaño final. |
| **Desfase cues↔labios**: HeyGen puede añadir padding inicial (~décimas de s) al mp4 | Los cues vienen del mp3 original; desfase esperado < 0,5 s — aceptable para subtítulos. Si en pruebas es mayor: offset constante medible restando `durationSec` (mp3) a la duración del mp4 y desplazando los cues. |
| **Créditos**: cada iteración de prueba quema créditos de API | Desarrollar H1–H3 con fixtures (mp4 diminuto en base64); solo H4+ toca la API real, con PDFs de 2–3 slides. |
| **Cola de HeyGen saturada / 429** | `Retry-After` + backoff en H1; timeout duro → degradación a foto. |
| **`video_url` caducado** (7 días) | Nunca se persiste la URL: descarga inmediata tras `completed`. |
| **Autoplay bloqueado** | Ya resuelto: `unlock()` por gesto gobierna también el vídeo (H3). |

---

## 8. Verificación

1. `npm run typecheck` limpio tras cada tarea.
2. **Sin gastar APIs** (skill `verify` + fixtures): deck fixture con `DeckVideos` fake →
   comprobaciones de H2/H3/H7 en Chromium headless; deck sin vídeos → HTML idéntico al de master
   (diff vacío).
3. **Real** (una sola pasada, PDF corto de 2–3 slides, claves Claude+ElevenLabs+HeyGen):
   - Generar con voz + avatar → intro y outro muestran el avatar hablando con la voz de
     ElevenLabs, subtítulos sincronizados, anillo con la duración del vídeo, auto-avance ok.
   - Re-locutar con otra voz sin re-marcar avatar → foto estática + warning.
   - Editar texto de la intro en el editor, guardar, descargar → el vídeo sobrevive.
4. Registrar el peso del HTML final antes/después (esperable: +3–15 MB).
