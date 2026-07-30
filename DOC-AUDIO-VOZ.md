# Cómo funciona el audio (ElevenLabs) y los subtítulos

> Explicación de punta a punta del flujo de narración por voz del deck:
> quién genera el texto, cómo se manda a ElevenLabs, quién crea los subtítulos
> y cómo se sincroniza todo con cada slide.

## Resumen en una línea

El texto **no** se manda entero: se manda **por chunks, uno por slide**. Claude trocea el
PDF en un campo `narration` por slide, el servidor sintetiza cada tramo con una petición HTTP
independiente a ElevenLabs, y de los timestamps a nivel de carácter que devuelve ElevenLabs el
**servidor** deriva los subtítulos. Todo se embebe en el HTML y el motor JS del deck sincroniza
cada audio con su slide en el navegador.

---

## 1. Quién genera el texto narrado — Claude, troceado por slide

En la **misma** llamada estructurada que produce las slides, Claude devuelve por cada slide un
campo `narration` con el fragmento **íntegro y literal** del PDF que le corresponde.

La regla clave del prompt (`src/services/claude.ts:301-320`):

> "La **concatenación en orden de todas las `narration`** debe reproducir el texto íntegro del PDF."

O sea: la unión de todos los chunks = el PDF completo. Es texto plano (sin HTML), y es distinto de:

- el `html` visible (que sí va condensado),
- las `notes` (para el presentador, **no** se locutan).

Esto ya da el troceado "gratis" — no hay un paso separado de segmentación.

---

## 2. Cómo se manda a ElevenLabs — una petición por slide, en pool de 2

En `src/routes/generate.ts:161` se extrae:

```ts
const narrations = slides.slides.map((s) => s.narration)
audio = await synthesizeDeck(narrations, { ...voiceIdOverride, ...modelIdOverride })
```

En `src/services/tts.ts:206-254`, `synthesizeDeck`:

- Filtra solo las slides con narración no vacía.
- Lanza un **pool de 2 workers concurrentes** (`MAX_CONCURRENCY = 2`, por el free tier de
  ElevenLabs — `tts.ts:23`).
- Cada worker llama a `synthesizeOne()` → **una petición HTTP por slide** a
  `POST /v1/text-to-speech/{voiceId}/with-timestamps` (`tts.ts:172-199`).

Devuelve un `DeckAudio` = array **alineado por índice** con las slides; `null` para slides sin audio.

### Por qué por chunks y no entero

- El endpoint `/with-timestamps` da timestamps por carácter → se necesitan **por slide** para
  saber qué audio va con qué slide.
- Permite auto-avance tipo vídeo (cada slide tiene su propio `<audio>`).
- Aísla fallos: si una slide falla o excede `MAX_CHARS = 9000`, esa slide queda **muda** (`null`)
  y el resto del deck sigue funcionando (`tts.ts:232-246`). Nunca se concatena audio a mano.

---

## 3. Quién genera los subtítulos — el servidor, a partir del alignment

**Ni Claude ni ElevenLabs generan los subtítulos directamente.** ElevenLabs devuelve
`alignment` = `{ characters[], character_start_times_seconds[], character_end_times_seconds[] }`
(tiempo de inicio/fin de **cada carácter**).

La función pura `buildCues()` (`tts.ts:75-117`) agrupa esos caracteres en *cues* (frases de subtítulo):

- Cierra un cue al final de frase (`.!?…` seguido de espacio) **o** al superar ~120 caracteres.
- `start` = tiempo del primer carácter del cue; `end` = tiempo del último.
- Ordena por `start` y corrige solapamientos (defensivo).

Cada slide acaba con un objeto `SlideAudio`:

```ts
{ audioBase64, mime, durationSec, cues[] }
```

---

## 4. Cómo se embebe — base64 en el HTML

En `src/services/slides.ts:102-117`, `buildAudioScript` inyecta un `<script>` con:

```js
window.__DECK_AUDIO__ = [
  { src: "data:audio/mpeg;base64,…", cues: [{ start, end, text }, …] },  // slide 0
  null,                                                                   // slide 1 sin audio
  …
]
window.__DECK_OPTS__ = { subtitles: true }
```

Es **un solo archivo HTML** autocontenido (mp3 a 64 kbps para no inflarlo).

> Nota de seguridad: escapa `</` → `<\/` para que el JSON no cierre el `<script>` antes de tiempo.

---

## 5. Cómo se sincroniza en el navegador — por slide y por timestamp

El motor de audio vive en `src/templates/deck.ts:248-403`, como bloque condicional (si
`__DECK_AUDIO__` no existe, todo son no-ops y el deck funciona como antes):

- **Audio ↔ slide:** `getAudio(i)` crea/cachea un `new Audio()` por índice de slide. Al navegar,
  `playCurrent()` para el audio anterior y reproduce el de la slide actual (`deck.ts:289-343`).
- **Subtítulos ↔ audio:** en `audio.ontimeupdate` recorre los `cues` y muestra en el overlay
  `#captions` el cue cuyo `[start, end]` contiene el `currentTime` actual (`deck.ts:318-332`).
  Así el subtítulo va sincronizado al carácter.
- **Auto-avance (modo vídeo):** `audio.onended` → si `autoAdv` está activo, salta a la siguiente
  slide (`deck.ts:334-340`).
- **Autoplay:** no arranca hasta el primer gesto del usuario (`unlock()`, política de navegadores
  — `deck.ts:345-349`).
- **Controles:** play/pausa, mute, CC (subtítulos) y "reproducir todo" (auto) — `deck.ts:390-400`.

---

## Flujo completo

```
PDF ──▶ Claude ──▶ slides[] con .narration (chunk literal por slide)
                        │
                        ▼  narrations = slides.map(s => s.narration)
              synthesizeDeck()  ── pool de 2 ──▶ ElevenLabs /with-timestamps
                        │                         (1 request por slide)
                        │◀── { audio_base64, alignment }
                        ▼
              buildCues(alignment)  ── el SERVIDOR crea los subtítulos
                        │
                        ▼
        window.__DECK_AUDIO__ = [{src:data-uri, cues}, null, …]  (embebido)
                        │
                        ▼  navegador
    playCurrent() por slide  +  ontimeupdate → muestra el cue del instante actual
```

---

## Extra: re-sintetizar sin volver a llamar a Claude

Existe `POST /api/audio` que re-sintetiza el audio de un deck ya generado (cambiar de voz,
reactivar subtítulos) **sin** volver a llamar a Claude: recupera las narraciones del `deck-store`
y repite solo el paso de TTS. Útil para no quemar tokens de Claude ni cuota de ElevenLabs
regenerando todo.

---

## 6. Editar el guion y regenerar solo lo que cambió

El texto que locuta cada slide se puede leer y reescribir desde la UI sin volver a generar el deck:
el botón **🗣 Guion de voz** de la vista previa abre un panel con **una fila por slide** (nº, titular
de la slide, clase, contador de caracteres, aviso si supera los 9 000 de `MAX_CHARS`, y `Ver slide`
para saltar la preview a esa slide vía el hook `window.__deckGo`). Las slides sin audio salen
marcadas `sin audio`.

Endpoints (`src/routes/generate.ts`):

| Endpoint | Qué hace |
| --- | --- |
| `GET /api/deck/:id/narrations` | Devuelve `{ index, label, slideClass, narration, hasAudio }` por slide |
| `PUT /api/deck/:id/narrations` | Guarda el guion editado en el `deck-store` (`""` → slide sin narrar). **No** sintetiza |
| `POST /api/audio` | Re-sintetiza y devuelve el deck con el audio nuevo embebido |

### Síntesis parcial: solo se paga por lo que cambió

El `deck-store` retiene, junto al deck, el **último audio** sintetizado y con qué se hizo
(`audio`, `audioKey` = voz+modelo+formato, `audioNarrations` = la narración normalizada de cada
slide). Al regenerar, `/api/audio` compara y decide slide a slide:

```
narración igual + ya tenía audio + misma voz/modelo  ──▶  se reutiliza (0 peticiones)
narración editada  ·  slide antes muda por un fallo  ──▶  se sintetiza
voz o modelo distintos                               ──▶  caché entera inválida: todo de nuevo
```

Las slides reutilizadas se saltan pasando `undefined` a `synthesizeDeck`, que ya ignora las
narraciones vacías → ni petición ni cuota. La respuesta lleva
`X-Audio-Synth: synthesized=N;reused=M;failed=K`, que la UI muestra como
*"Audio actualizado ✓ (1 sintetizada · 9 reutilizadas)"*.

Una slide que falló queda `null` (muda) y **no** se reutiliza: volver a pulsar *Regenerar audio*
es su reintento. El aviso va en `X-Voice-Warning`.

### La voz del deck manda

Un deck tiene UNA voz: si al regenerar una slide se usara otra, el resto del audio no se
podría reutilizar y el deck acabaría con dos voces. Por eso:

- El `deck-store` guarda `audioVoiceId` / `audioModelId` (ya resueltos por `resolveVoice`)
  junto al audio, y `/api/audio` los usa **cuando el body no trae voz** — antes caía al
  default del entorno, así que regenerar tras editar una slide podía cambiar la voz del
  deck entero sin querer (y pagar todas las slides).
- La respuesta lleva `X-Audio-Voice` / `X-Audio-Model` (también en `/api/generate`), y la UI
  deja el selector de *Regenerar audio* en esa voz. Si la voz ya no está en
  `ELEVENLABS_VOICES` se le añade una opción "Voz del deck (…)" para no perderla.
- Solo un **cambio explícito del usuario** en el selector cambia la voz; entonces se avisa
  en el panel de que se sintetizarán TODAS las slides, no solo las editadas.

---

## Archivos implicados

| Archivo | Rol |
| --- | --- |
| `src/services/claude.ts` | Prompt que hace a Claude emitir `narration` por slide (texto íntegro troceado) |
| `src/config/schema.ts` | Campo `narration` en el schema de cada `Slide` |
| `src/services/tts.ts` | Cliente ElevenLabs `with-timestamps` + `buildCues()` (subtítulos) + `voiceCacheKey()` |
| `src/services/deck-store.ts` | Guarda narraciones editadas y la caché de audio por slide |
| `src/routes/generate.ts` | Orquesta TTS, aísla fallos, endpoints de guion y `/api/audio` (síntesis parcial) |
| `src/services/slides.ts` | Embebe `window.__DECK_AUDIO__` / `__DECK_OPTS__` en el HTML |
| `src/templates/deck.ts` | Motor de audio en el navegador: reproducción, subtítulos, auto-avance, hook `__deckGo` |
| `public/index.html` · `public/app.js` | Panel "Guion de voz": edición por slide, guardado y regeneración |
