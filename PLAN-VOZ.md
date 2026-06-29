# Plan por fases (2): Narración por voz + subtítulos en el deck

> Segundo plan, **independiente** de `PLAN.md` (fidelidad visual a la demo). Aquí se añade una
> **capa de audio**: el deck narra el **texto íntegro del PDF**, troceado de modo que **cada slide
> reproduce su tramo correspondiente**, con **subtítulos sincronizados** opcionales.

## Contexto

Hoy la app hace: `PDF → Claude → JSON de slides → deck HTML autocontenido` (ver `PLAN.md`). El
deck ya reserva labels de **"Voz en off"** en `intro`/`outro`, así que la narración encaja con la
visión original (el proyecto nace de `awk-video-test`, un test de **vídeo**).

Objetivo de este plan: que el deck **hable**. A partir del **texto íntegro del PDF** (no solo el
texto condensado que se ve en cada slide), se genera una **narración por slide**, se sintetiza a
audio con **ElevenLabs**, y el deck reproduce el tramo de cada slide con **subtítulos** opcionales.

---

## Decisiones (confirmadas con el usuario, 2026-06-24)

1. **Motor TTS: ElevenLabs.** Mejor voz en español y, sobre todo, devuelve **timestamps a nivel de
   carácter** (`/with-timestamps`) → subtítulos **sincronizados con precisión**. Requiere una API
   key nueva (**la disponible para test es del plan GRATUITO** — ver límites en "Hechos clave").
   Claude **no** hace TTS, así que es un servicio externo nuevo.
2. **Texto narrado: limpieza ligera del texto íntegro del PDF.** Claude usa el texto **íntegro y
   literal** del PDF pero quita ruido (números de página, encabezados/pies repetidos, guiones de
   corte de palabra, viñetas sueltas) y lo **trocea por slide**. No se reescribe el contenido ni se
   inventan transiciones. La **unión de todos los tramos = texto íntegro del PDF** (en orden).
3. **Reproducción: manual + auto con toggle.** Navegación manual normal (al entrar en una slide se
   reproduce su tramo) **más** un botón **"Reproducir todo"** que activa **auto-avance** tipo vídeo
   (al terminar el audio de una slide, pasa a la siguiente). Controles: play/pausa, mute, CC.
4. **Empaquetado: HTML único con audio embebido (base64).** Se mantiene **un solo archivo**. A
   cambio el `.html` pesará varios MB; se mitiga con un bitrate de mp3 moderado (ver Fase V3).
5. **Subtítulos:** activados por defecto, **toggle CC** en el chrome. Texto = la narración de la
   slide, troceada en *cues* (frases) con `start/end` derivados de los timestamps de ElevenLabs.

---

## Hechos clave (API de ElevenLabs)

- **Endpoint con timestamps:** `POST /v1/text-to-speech/{voice_id}/with-timestamps`.
  - Headers: `xi-api-key`, `Content-Type: application/json`.
  - Body: `{ text, model_id, output_format, voice_settings? }`.
  - Respuesta JSON: `{ audio_base64, alignment, normalized_alignment }`, donde `alignment` =
    `{ characters: string[], character_start_times_seconds: number[], character_end_times_seconds:
    number[] }`. Cada carácter del texto de entrada lleva su `start/end` en segundos → de ahí
    salen los *cues* de subtítulos.
- **Modelo:** `eleven_multilingual_v2` (calidad alta en español) por defecto; `eleven_turbo_v2_5`
  como alternativa más barata/rápida (también multilingüe y con timestamps). Configurable por env.
- **Límite de caracteres por petición** (según modelo, ~5.000–10.000). La narración de una slide
  rara vez lo supera; si lo hace, se **trocea** y se **concatena** el audio desplazando los
  timestamps del segundo trozo por la duración del primero (ver Fase V3).
- **Formato de salida (`output_format`):** mp3. Para no inflar el HTML embebido, usar
  `mp3_44100_64` (64 kbps) por defecto — buen equilibrio voz/tamaño; configurable.
- **Coste:** se factura por carácter sintetizado. El texto íntegro de un PDF largo son varios miles
  de caracteres → del orden de céntimos a ~1 € por deck según plan. Asumido.
- **Clave de test = plan GRATUITO de ElevenLabs (free tier).** Implicaciones a tener presentes:
  - **Cuota mensual de caracteres baja** (~10k créditos/mes en el free tier). El texto íntegro de
    un PDF son varios miles de caracteres → **caben muy pocos decks completos al mes**. Para iterar,
    usar PDFs cortos / pocas slides; no quemar la cuota regenerando el deck entero.
  - **Concurrencia muy limitada** (free tier ≈ 2 peticiones simultáneas) → en V3 paso 7, pool de
    **2 en paralelo** (no 3–4).
  - **Atribución:** el plan gratuito puede exigir mencionar a ElevenLabs. Irrelevante para el deck
    embebido, pero tenerlo en cuenta si se publica.
  - El endpoint `with-timestamps` y `eleven_multilingual_v2`/`turbo` **sí** están disponibles en
    free tier: la funcionalidad se puede probar entera; el único cuello es la **cuota**.
- **No determinista:** dos generaciones de la misma narración no dan audio idéntico. Irrelevante.

---

## Arquitectura: archivos nuevos y cambios

```
slider-generator/
  .env / .env.example          # + ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID
  package.json                 # (opcional) + @elevenlabs/elevenlabs-js  — o fetch nativo
  src/
    config/schema.ts           # CAMBIA: Slide.narration (texto íntegro troceado, limpieza ligera)
    services/claude.ts         # CAMBIA: prompt emite narration cubriendo el PDF íntegro; +max_tokens
    services/tts.ts            # NUEVO: ElevenLabs with-timestamps → audio base64 + cues por slide
    services/slides.ts         # CAMBIA: recibe audio[] y lo embebe (window.__DECK_AUDIO__)
    templates/deck.ts          # CAMBIA: motor de audio + controles + overlay de subtítulos + CSS
    routes/generate.ts         # CAMBIA: toggle voz/subtítulos; orquesta TTS; aísla fallos
  public/
    index.html / app.js        # CAMBIA: checkboxes "Añadir voz" y "Subtítulos" (+ selector de voz)
```

---

## Modelo de datos

### Schema (lo que devuelve Claude) — `src/config/schema.ts`

```ts
const Slide = z.object({
  slideClass: z.string().optional(),
  html: z.string(),
  notes: z.string().optional(),
  // NUEVO: tramo del texto ÍNTEGRO del PDF que corresponde a esta slide,
  // con limpieza ligera (sin nº de página / encabezados / cortes de palabra).
  // La unión de todas las narraciones, en orden, = texto íntegro del PDF.
  // Puede omitirse en slides sin texto asociado (p.ej. divisor puramente decorativo),
  // pero NO se puede tirar contenido del PDF: se empuja a la slide de contenido más cercana.
  narration: z.string().optional(),
})
```

### Tipos internos (servidor, no van en el schema de Claude)

```ts
// services/tts.ts
export interface Cue { start: number; end: number; text: string }     // subtítulo
export interface SlideAudio {
  audioBase64: string        // mp3 en base64 (sin prefijo data:)
  mime: string               // 'audio/mpeg'
  durationSec: number
  cues: Cue[]
}
// Alineado por índice con data.slides; null = slide sin narración/sin audio.
type DeckAudio = (SlideAudio | null)[]
```

### Embebido en el deck (lo lee el JS del navegador)

```js
window.__DECK_AUDIO__ = [
  { src: "data:audio/mpeg;base64,…", cues: [{start, end, text}, …] },  // slide 0
  null,                                                                 // slide 1 (sin audio)
  …
]
```

---

## Fase V0 — Config, dependencias y clave

**Objetivo:** dejar el entorno listo sin tocar lógica.

Pasos:
1. `.env.example` (y `.env` local): añadir
   ```
   # ElevenLabs (texto a voz). https://elevenlabs.io
   ELEVENLABS_API_KEY=
   ELEVENLABS_VOICE_ID=        # id de la voz por defecto (es-ES/es-LA)
   ELEVENLABS_MODEL_ID=eleven_multilingual_v2
   ```
2. **Dependencia:** decidir entre `@elevenlabs/elevenlabs-js` (SDK oficial, retries incluidos) o
   `fetch` nativo (cero deps, control total del cuerpo `with-timestamps`). **Recomendado: `fetch`
   nativo** en un wrapper fino (`tts.ts`) — el endpoint es simple y evita acoplarse a la API del
   SDK. **Ojo con el retry:** `claude.ts` **NO** tiene un bucle de reintentos que copiar (delega en
   el SDK con `new Anthropic({ maxRetries: 5 })`). Como `tts.ts` usa `fetch` crudo (sin SDK),
   escribe tú el bucle: 3 intentos, backoff exponencial + jitter, sobre 429/5xx; para clasificar el
   error reutiliza la idea de `isTransientApiError` (`routes/generate.ts`).
3. Verificar que `tsx`/Node ≥ 18 (hay `fetch` global). Ya se cumple.

**Verificación:** `tsc --noEmit` sin errores; arranque del server sigue OK (sin usar TTS aún).

---

## Fase V1 — Schema: narración por slide

**Objetivo:** que cada slide pueda transportar su tramo del texto íntegro.

Pasos:
1. Añadir `narration: z.string().optional()` a `Slide` (ver Modelo de datos).
2. Documentar en el comentario del schema: qué es `narration`, la regla de **cobertura íntegra**
   (unión = PDF completo, en orden, sin perder contenido) y la diferencia con `notes` (las `notes`
   son para el presentador y NO se locutan; `narration` SÍ).

**Verificación:** `tsc --noEmit`; un fixture `Slides` con `narration` parsea con el schema.

---

## Fase V2 — Prompt: Claude emite la narración íntegra troceada

**Objetivo:** que en la **misma** llamada estructurada Claude devuelva, por slide, su tramo del
texto íntegro del PDF con limpieza ligera.

Pasos (en `services/claude.ts`, `buildSystemPrompt`):
1. Nueva sección **"## Narración (voz en off)"** con reglas:
   - "Por cada slide, además del `html`, devuelve `narration`: el **fragmento del texto ÍNTEGRO y
     literal del PDF** que corresponde a esa slide."
   - "La **concatenación en orden de todas las `narration` = el texto íntegro del PDF**. No
     resumas, no inventes, no añadas frases de transición que no estén en el PDF, **no te dejes
     contenido**. Si un fragmento no encaja en ninguna slide concreta, asígnalo a la slide de
     contenido más próxima en el orden del guion."
   - **Limpieza ligera permitida (y solo esta):** quitar números de página, encabezados/pies
     repetidos, marcas de viñeta sueltas y **unir palabras partidas por guion de fin de línea**;
     normalizar espacios. **No** cambiar el orden ni la redacción del contenido.
   - "`narration` es **texto plano** (sin HTML, sin Markdown): se va a locutar."
   - "Distíntela del `html` visible (que sí es condensado) y de `notes` (que NO se locuta)."
   - Slides sin texto asociado (p. ej. un `section-divider` puramente decorativo): `narration`
     puede ir vacío/omitido, **pero** el texto que iría ahí se empuja a la slide vecina (no se
     pierde).
2. **Subir `MAX_TOKENS`.** La narración ≈ duplica el tamaño de salida (todo el texto del PDF, otra
   vez). Subir el tope y vigilar `stop_reason: max_tokens`.
3. **Contingencia documentada (no implementar de entrada):** si con PDFs largos la respuesta se
   trunca, separar en **dos pasadas** — (A) slides como ahora; (B) segunda llamada que recibe el
   PDF (cacheado) + los títulos/orden de las N slides y devuelve **solo** `string[]` de N
   narraciones. Mantiene el riesgo de tokens aislado. Decisión: empezar **en una sola llamada**;
   pasar a dos pasadas solo si se observa truncamiento.

**Verificación (consume tokens):** generar con el PDF de `awk-video-test`; comprobar a mano que
(a) cada `narration` es texto plano, (b) concatenadas reconstruyen el guion del PDF sin huecos ni
resúmenes, (c) no truncó (`stop_reason` ≠ `max_tokens`).

---

## Fase V3 — Servicio TTS (`services/tts.ts`)

**Objetivo:** narración (texto) → audio mp3 + duración + *cues*, por slide.

API del módulo:
```ts
export async function synthesizeDeck(
  narrations: (string | undefined)[],   // alineado con slides
  opts?: { voiceId?: string; modelId?: string; outputFormat?: string },
): Promise<(SlideAudio | null)[]>       // null para slides sin narración
```

Pasos:
1. **Cliente `fetch`** a `/v1/text-to-speech/{voiceId}/with-timestamps` con `xi-api-key`. Body:
   `{ text, model_id, output_format: 'mp3_44100_64' }`. Voz/modelo desde env con override por
   `opts`. **Retry/backoff** propio (3 intentos, backoff exponencial + jitter) en 429/5xx — bucle
   escrito a mano en `tts.ts`; no hay uno en `claude.ts` que reutilizar (ver V0 paso 2).
2. Por cada narración no vacía:
   - **Trocear si excede el límite de caracteres** del modelo (cortar por frase/espacio, nunca a
     mitad de palabra). Sintetizar cada trozo.
   - **Troceo/concatenación = punto frágil; no improvisar.** La fusión naíf de varios mp3 (cada
     trozo con sus propios headers de frame) reproduce con duración/seek poco fiables en `<audio>`.
     Para **v1**, asumir que la narración de una slide **cabe en una sola petición** (lo normal: el
     plan ya dice que "rara vez supera el límite") → **una síntesis = un `audioBase64`**. Si una
     narración **sí** excede el límite: **PARAR y ESCALAR** (decidir con el modelo fuerte si se hace
     mux real con librería o se reproducen segmentos encadenados con el evento `ended`) y **loguear**
     la slide afectada. **No** concatenar buffers mp3 a mano.
   - **Desplazar timestamps** del trozo *n+1* sumando la duración acumulada de los trozos previos.
3. **Construir `cues`** desde `alignment` (función pura `buildCues(alignment): Cue[]`):
   - Recorrer `characters` acumulando texto; **cerrar un cue** al encontrar fin de frase
     (`. ! ? …` seguido de espacio) **o** al superar ~120 caracteres (para que quepa en ~2 líneas).
   - `cue.start` = `character_start_times_seconds` del primer carácter del cue; `cue.end` =
     `character_end_times_seconds` del último. `cue.text` = texto del tramo, *trim*.
4. `durationSec` = último `character_end_times_seconds` (+ offset por troceo).
5. **`audioBase64`** = `audio_base64` de la respuesta (o el del buffer concatenado).
6. **Aislamiento de fallos:** si una slide falla tras los reintentos, devolver `null` para esa
   posición (slide queda **muda**) y loguear; **no** tumbar el deck entero.
7. **Concurrencia limitada:** lanzar las peticiones con un *pool* (preservando el orden por índice)
   para no chocar con el rate limit. **Con la clave free tier: máx. 2 en paralelo** (límite de
   concurrencia del plan gratuito); en planes de pago, 3–4. Configurable.

**Verificación (consume API):** script temporal: 2–3 narraciones de prueba → `synthesizeDeck` →
guardar mp3s a disco y abrirlos (se oyen en español), e imprimir `cues` (tiempos crecientes,
texto correcto, troceo por frase). Probar una narración larga (> límite) → audio continuo + cues
con tiempos bien desplazados.

---

## Fase V4 — Subtítulos: *cues* listos para el deck

**Objetivo:** dejar la generación de subtítulos cerrada y verificada como **función pura**.

Pasos:
1. `buildCues(alignment)` (de la Fase V3) queda aislada y testeable sin red.
2. Decisión de granularidad: **por frase** (no karaoke palabra-a-palabra) en v1 — más legible y
   robusto. (Karaoke/resaltado por palabra = mejora futura; los datos por carácter ya lo permiten.)
3. Garantizar *cues* **no solapados y ordenados**; *clamp* del último `end` a `durationSec`.

**Verificación:** tests de `buildCues` con un `alignment` de ejemplo: frases bien partidas, sin
solapes, tiempos monótonos.

---

## Fase V5 — Deck: motor de audio + controles + subtítulos (`templates/deck.ts`)

**Objetivo:** que el deck reproduzca el tramo de cada slide, con auto-avance opcional y subtítulos.

### Markup nuevo (dentro del chrome fijo, fuera de `#stage`)
- **Overlay de subtítulos** `#captions` (fixed, abajo-centro, **encima** del `#nav`): caja oscura
  semitransparente, texto blanco, `max-width` ~70%, 1–2 líneas, oculto si no hay cue activo o CC off.
- **Controles** integrados en `#nav` (mismo estilo cristal): botón **play/pausa**, botón **mute**,
  botón **CC** (subtítulos on/off), botón **"Reproducir todo"** (auto-avance on/off). Iconos SVG
  de línea, como los chevrons actuales.

### CSS (en `BASE_CSS`)
- `#captions { position:fixed; bottom:84px; left:50%; transform:translateX(-50%);
  max-width:70vw; background:rgba(8,7,14,.72); color:#fff; padding:10px 18px; border-radius:12px;
  font-size:18px; line-height:1.4; text-align:center; z-index:55; backdrop-filter:blur(6px);
  opacity:0; transition:opacity .2s }` + `#captions.show{opacity:1}`.
- Estados activos de los botones toggle (CC / Reproducir todo) reusando el look del `#nav`.

### JS (`DECK_JS`) — motor de audio
- Leer `window.__DECK_AUDIO__` y `window.__DECK_OPTS__` (opciones inyectadas por el servidor).
  Estado: `audioOn` (reproducir al entrar), `autoAdvance`,
  `subtitlesOn = (window.__DECK_OPTS__ && window.__DECK_OPTS__.subtitles) !== false`, `muted=false`,
  `unlocked=false` (política de autoplay).
- **Audio perezoso:** `getAudio(i)` crea `new Audio(src)` la primera vez y lo cachea (no instanciar
  los N audios a la vez por memoria/peso). Slides con `null` → sin audio.
- **`playCurrent()`** (en cada `render()`/`go(i)`): pausar y `currentTime=0` del audio anterior;
  enganchar el actual; si `audioOn && unlocked` → `audio.play()` (capturar el *reject* de autoplay).
  Enganchar `timeupdate` → actualizar `#captions` buscando el cue cuyo `[start,end]` contiene
  `currentTime` (mostrar/ocultar según `subtitlesOn`). Enganchar `ended` → si `autoAdvance`:
  `next()` (en la última slide, parar).
- **Política de autoplay:** el sonido no suena hasta un **gesto** del usuario. El primer click en
  play (o en "Reproducir todo", o una tecla de navegación) marca `unlocked=true` y dispara
  `playCurrent()`. Antes de eso, el deck está en silencio aunque `audioOn` sea true.
- **Controles:** play/pausa togglea `audioOn` y reproduce/pausa el actual; mute togglea
  `audio.muted` global; CC togglea `subtitlesOn` (oculta `#captions`); "Reproducir todo" togglea
  `autoAdvance` y, si lo activa, arranca la reproducción desde la slide actual.
- **Teclado (añadir a los handlers existentes):** `p` play/pausa, `m` mute, `c` subtítulos.
- **Sin audio:** si `__DECK_AUDIO__` está vacío/ausente (deck sin voz), **no** renderizar controles
  de audio ni `#captions` (el deck se comporta como hoy).

**Verificación:** alimentar `renderDeck` (vía fixture) con 2–3 slides + audio de prueba: al navegar
suena el tramo correcto; subtítulos aparecen/ocultan sincronizados; CC los apaga; "Reproducir todo"
avanza solo y para al final; mute funciona; un deck **sin** audio se ve y navega igual que hoy.

---

## Fase V6 — Renderer: embeber audio + cues (`services/slides.ts`)

**Objetivo:** inyectar el audio en el HTML autocontenido.

Pasos:
1. `renderSlides(data, theme, images?, audio?, opts?)` y `renderDeck({…, audio, opts})`: nuevo
   parámetro opcional `audio: DeckAudio` alineado por índice con `data.slides`, y
   `opts?: { subtitles?: boolean }` para el estado inicial de subtítulos (ver paso 2 y V7 paso 6).
2. Construir `window.__DECK_AUDIO__` como JSON: por cada slide, `null` o
   `{ src: "data:" + mime + ";base64," + audioBase64, cues }`. Inyectarlo en un
   `<script>window.__DECK_AUDIO__ = …;</script>` **antes** de `DECK_JS`.
   - En el mismo `<script>` (o uno contiguo, también antes de `DECK_JS`), inyectar
     `window.__DECK_OPTS__ = { subtitles: <bool> }` con el valor del checkbox "Subtítulos" del form
     (ver V7 paso 6). El JS del deck lo lee al arrancar; si no se inyecta, asume `true`.
   - **Tamaño:** este es el grueso del peso del `.html`. Escapar correctamente y no duplicar.
3. Si `audio` es `undefined` (voz desactivada): no inyectar nada → deck como hoy.

**Verificación:** render con fixture + audios → abrir el `.html` **directamente (file://, sin
servidor)** y comprobar que suena (audio embebido, sin red).

---

## Fase V7 — Endpoint y UI (`routes/generate.ts`, `public/`)

**Objetivo:** exponer la opción de voz y orquestar TTS.

Pasos (backend):
1. Nuevos campos del form: `voice` ("on"/ausente), `subtitles` (default on, en realidad es runtime
   del deck — basta con generar siempre los cues), opcional `voiceId`.
2. Flujo en `/api/generate`:
   - `generateSlides(...)` como hoy.
   - Si `voice` activo **y** hay `ELEVENLABS_API_KEY`: `narrations = slides.slides.map(s =>
     s.narration)` → `audio = await synthesizeDeck(narrations, { voiceId })` → `renderSlides(slides,
     theme, deckImages, audio)`.
   - Si voz desactivada o sin key: `renderSlides(...)` sin audio (comportamiento actual).
3. **Errores de TTS:** envolver `synthesizeDeck` en try/catch propio; si falla del todo, **devolver
   el deck sin audio** + cabecera/aviso (no romper la generación visual ya pagada a Claude). Mapear
   429/5xx persistentes a un aviso "servicio de voz saturado, deck generado sin audio".
4. **Latencia/tope:** la petición ya es larga (Claude). TTS añade segundos × slides (paralelizado).
   Revisar timeouts de Fastify/cliente. (Futuro: respuesta por *job* + progreso; fuera de alcance.)

Pasos (UI — `public/index.html` + `app.js`):
5. Checkbox **"Añadir narración por voz"** (y nota: requiere ElevenLabs configurado).
6. Checkbox **"Subtítulos"** (default on) — controla el estado inicial `subtitlesOn` del deck. El
   valor viaja servidor→deck: la ruta lo pasa a `renderSlides(..., { subtitles })`, que lo inyecta
   como `window.__DECK_OPTS__ = { subtitles }` (ver V6 paso 2); el JS del deck lo lee al arrancar.
7. (Opcional) selector de voz si se quiere exponer varias `voiceId`.
8. Enviar los campos nuevos en el `FormData`. La vista previa en `<iframe>` debe poder reproducir
   (gesto del usuario dentro del iframe lo permite).

**Verificación:** desde la UI, generar **sin** voz (igual que hoy) y **con** voz; comprobar el
toggle de subtítulos inicial.

---

## Fase V8 — E2E y criterio de "hecho"

> ✅ **E2E realizado por el usuario (2026-06-29).** Fases V0–V8 funcionalmente cerradas;
> queda **consolidar** (commit + code-review) — ver "Próximos pasos".

**Verificación E2E:** `http://localhost:3000` → subir el PDF de `awk-video-test` (+ imágenes +
avatar), tema `timely-ai`, marcar **voz** + **subtítulos** → generar → en el iframe: pulsar play,
oír la narración **en español** de cada slide; los **subtítulos** aparecen sincronizados y se
apagan con **CC**; **"Reproducir todo"** avanza solo y para al final; **navegación manual**
reproduce el tramo correcto de cada slide. Descargar el `.html` y **abrirlo sin servidor** (file://)
→ sigue sonando (audio embebido).

> ⚠️ **Cuota free tier:** el PDF de `awk-video-test` es largo y un E2E completo puede consumir buena
> parte de la cuota mensual gratuita de ElevenLabs. Iterar primero con un PDF corto / pocas slides y
> reservar este E2E completo para cuando lo demás esté verificado.

**Criterio de "hecho":**
- La **concatenación de las narraciones** reproduce el **texto íntegro del PDF** (limpieza ligera),
  no un resumen.
- Cada slide reproduce **su** tramo; los subtítulos van **sincronizados** con la voz.
- Funcionan los dos modos (manual y "Reproducir todo") y los controles (play/pausa, mute, CC).
- El deck sigue siendo **un solo `.html`** y funciona offline.
- Un deck generado **sin** voz se comporta exactamente como hoy.

---

## Orden de ejecución sugerido

V0 → **V1 → V2 → V3 → V4 → V5 → V6 → V7 → V8**.
- Sin gastar API: V0, V1, V4 (tests de `buildCues`), V5 y V6 (con audios de fixture), parte de V7.
- Consumen API: V2 (Claude con narración) y V3 (ElevenLabs).

## Riesgos y consideraciones

- **Tokens (V2):** narración ≈ duplica la salida → riesgo de truncado en PDFs largos. Mitigación:
  subir `MAX_TOKENS`; contingencia: dos pasadas (slides / narraciones).
- **Peso del HTML (V3/V6):** audio embebido → varios MB. Mitigación: `mp3_44100_64`; si se vuelve
  excesivo, reconsiderar el empaquetado en carpeta/ZIP (hoy descartado por decisión 4).
- **Autoplay (V5):** los navegadores bloquean sonido sin gesto del usuario → primer click/te­cla
  desbloquea. Documentar el comportamiento en la UI.
- **Coste y rate limits (V3):** ElevenLabs factura por carácter; concurrencia limitada y retries.
- **Sincronía exacta:** *cues* por frase (no karaoke). Suficiente y robusto; karaoke = mejora futura.
- **Fallo aislado:** una slide muda nunca debe tumbar el deck; voz desactivada/clave ausente →
  comportamiento actual intacto.

## Próximos pasos

Con V0–V8 cerradas, el trabajo se divide en **consolidar** lo hecho y luego **construir**
sobre ello. Orden recomendado:

### Paso 0 — Consolidar (antes de añadir nada)

La feature de voz completa está **sin commitear** (`src/services/tts.ts` untracked + 6 archivos
modificados). Antes de seguir:

1. **Commit de V0–V8.** Aislar la feature de voz en uno o varios commits con mensaje claro.
2. **Code-review del diff** (recomendado antes del commit). Vigilar los puntos que el propio plan
   marcó como frágiles: el bucle de **retry/backoff escrito a mano** en `tts.ts` (V0 paso 2 / V3
   paso 1), el **aislamiento de fallos por slide** (V3 paso 6: una slide muda no tumba el deck) y
   el **troceo de narraciones largas**, que en v1 quedó como "PARAR y ESCALAR" (V3 paso 2) — no
   concatenar buffers mp3 a mano.

### Mejoras por orden de valor

1. **Regenerar SOLO el audio sin re-llamar a Claude.** Ataca directamente el dolor del free tier:
   hoy cambiar de voz re-genera el deck entero y re-gasta tokens de Claude. Desacoplar la pasada de
   narración (favorecido ya por el diseño de la Fase V2) permite iterar voces gastando únicamente
   cuota de ElevenLabs. **Mayor impacto inmediato.**
2. **Export MP4 y/o `.vtt`/`.srt`.** Cierre temático: el proyecto nace de `awk-video-test`, un test
   de **vídeo**. Con audio + cues sincronizados ya en mano, renderizar a vídeo (o exportar los
   subtítulos como pista aparte) es el destino natural.
3. **Generación por *job* con barra de progreso.** La suma Claude + TTS es lenta y hoy bloquea una
   request larga. Mejora la UX; es más fontanería que valor de producto.

### Pulido posterior

- **Karaoke** (resaltado palabra a palabra) usando los timestamps por carácter ya disponibles.
- **Selector de varias voces** / ajustes de `voice_settings` (estabilidad, similaridad) desde la UI.
