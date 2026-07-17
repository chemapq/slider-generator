# Imágenes automáticas desde Unsplash

> Documento de estudio de la funcionalidad implementada el **2026-07-13**.
> Objetivo: cuando el usuario **no sube imágenes de apoyo**, la IA elige y coloca
> fotos apropiadas buscándolas en Unsplash, de forma automática.

---

## 1. Idea en una frase

Si no hay imágenes placeholder subidas y existe una `UNSPLASH_ACCESS_KEY`,
Claude marca los huecos de imagen con una **consulta de búsqueda** en vez de un id
de placeholder, y el servidor resuelve esas consultas descargando fotos reales de
Unsplash y embebiéndolas en el deck.

La clave del diseño: **reutilizar el pipeline existente**. Una foto de Unsplash
acaba convertida en el mismo `data-img="ID"` + data URI en el mapa de placeholders
que ya usaban las imágenes subidas. Así, render, editor visual, re-síntesis de audio
y `deck-store` funcionan **sin ningún cambio**.

---

## 2. Los dos "modos" de imagen

Antes de hoy existían dos situaciones:

| Situación | Qué recibía Claude | Qué hacía |
|-----------|--------------------|-----------|
| Se suben imágenes | manifiesto de ids (`h1`, `v2`…) | insertaba `data-img="h1"` |
| No se suben imágenes | "usa solo texto y tarjetas" | sin imágenes |

Hoy se añade un **tercer camino** para el segundo caso:

| Situación | Qué recibe Claude | Qué hace |
|-----------|-------------------|----------|
| No se suben imágenes **+ hay clave Unsplash** | "hay búsqueda automática disponible" | inserta `data-img-query="..."` |

Es decir, el modo Unsplash **solo se activa cuando no hay placeholders subidos**.
Si el usuario sube aunque sea una imagen, se usa el flujo de placeholders de siempre.

---

## 3. El contrato: atributos que genera Claude

Claude marca cada hueco de foto con estos atributos (en un `<img>` o en un
`<div class="media">`):

```html
<img data-img-query="team meeting office" data-img-orient="landscape" alt="">
```

- **`data-img-query`** — 2 a 5 palabras **en inglés**, con un sujeto visual
  **concreto y fotografiable** (ej: `"solar panels aerial"`, `"hands typing laptop"`).
  Se evitan conceptos abstractos (`"synergy"`, `"innovation"`) porque no dan buenas
  fotos.
- **`data-img-orient`** — `"landscape"` (huecos anchos) o `"portrait"` (columnas
  estrechas). Por defecto `landscape`.

Reglas que se le piden en el prompt:
- Consulta **distinta** en cada slot (no repetir la misma búsqueda).
- **No** en todas las slides: solo donde aporte (portada, conceptos con imagen,
  citas, casos). ~4–8 fotos por deck.
- **No** añadir `.ph-badge` ni pie de foto: son fotos reales, no placeholders.
- **No** usar `data-img="ID"`: no hay placeholders subidos.

---

## 4. Flujo de datos completo

```
navegador (sin imágenes)
   │  POST /api/generate  (multipart, sin campo "images")
   ▼
generate.ts
   │  placeholders.length === 0 && isUnsplashConfigured()  →  unsplashEnabled = true
   ▼
claude.ts  generateSlides({ ..., unsplashEnabled: true })
   │  el system prompt incluye la rama "búsqueda automática"
   │  Claude devuelve slides con <img data-img-query="...">
   ▼
generate.ts  resolveUnsplashSlots(htmls, deckImages.placeholders)
   │  1. recoge los slots
   │  2. busca en Unsplash (en paralelo, consultas únicas)
   │  3. asigna una foto a cada slot (sin repetir)
   │  4. descarga las fotos → data URI → placeholders.set("u1", ...)
   │  5. reescribe el HTML: data-img-query  →  data-img="u1"
   │  6. quita cualquier .ph-badge
   ▼
   slides.slides[i].html  se sobrescribe con el HTML resuelto
   ▼
putDeck(...)  →  renderSlides(...)  →  fillSlots() inyecta el src desde data-img="u1"
   ▼
HTML final con las fotos embebidas en base64
```

El punto importante: para cuando el HTML llega a `renderSlides` / `fillSlots`
(en [slides.ts](src/services/slides.ts)), ya no quedan `data-img-query`, solo
`data-img="uN"`, que es lo que ese código ya sabía resolver.

---

## 5. El servicio nuevo: `src/services/unsplash.ts`

### API pública

```ts
isUnsplashConfigured(): boolean
resolveUnsplashSlots(htmls: string[], placeholders: Map<string,string>): Promise<UnsplashResolution>
pickUnsplashPhoto(query, orientation, excludeIds?): Promise<UnsplashPick | null>  // editor visual
```

`resolveUnsplashSlots`:
- **muta** el `Map` de placeholders (añade `u1`, `u2`… con sus data URIs),
- **devuelve** `{ htmls, resolved, failed }` con el HTML reescrito (mismo orden de
  entrada) y los contadores.

### Los 5 pasos internos

1. **Recoger slots** en orden de documento con el regex `SLOT_RE`
   (`data-img-query`). De cada slot se extrae query, orientación y si es `<img>` o no.

2. **Búsquedas únicas en paralelo.** Se deduplican por `orientación|query`, así dos
   slots que casualmente pidieran lo mismo hacen **una sola** llamada a la API.
   Endpoint: `GET /search/photos` con `content_filter=high`.

3. **Asignar foto a cada slot** evitando repetir la misma foto en el deck
   (`usedPhotoIds`). Si no quedan fotos nuevas, cae al primer resultado.

4. **Descargar las fotos únicas en paralelo** → `data:image/…;base64,…`, y
   registrarlas en el `Map` con ids `u1`, `u2`…
   Se llama al `download_location` (requisito de las *guidelines* de Unsplash).

5. **Reescribir el HTML.** `String.replace` recorre los matches en el mismo orden
   que `matchAll`, así que una **cola por slide** alinea cada tag con su slot:
   - éxito → se quita `data-img-orient` y se inyecta `data-img="uN"` +
     `data-img-id="<id de la foto>"`. **`data-img-query` se conserva**: es la
     memoria que usa el editor visual para "regenerar" la foto (§10);
   - fallo → el `<img>` se **elimina**; el `<div>` conserva `data-img-query`
     (queda el degradado de fallback del tema, pero el editor puede reintentarlo).
   Finalmente se elimina cualquier `<span class="ph-badge">…</span>`.

### Detalles clave

- **Nunca lanza.** Cada búsqueda/descarga va en su `try/catch`; un slot que falla
  degrada con elegancia. Un fallo total no tumba la petición de generación.
- **Timeout** de 15 s por petición vía `AbortSignal.timeout()`.
- **Atribución** al fotógrafo en el atributo `alt` (`"Foto de <nombre> en Unsplash"`),
  invisible en pantalla pero presente por las *guidelines*. Si el `alt` ya trae texto
  no vacío, se respeta.

### Regex importantes

```ts
// Tag completo (img o div) que lleva data-img-query
const SLOT_RE = /<[a-zA-Z][^>]*\bdata-img-query\s*=\s*"[^"]*"[^>]*>/g

// Badge de placeholder — se elimina porque las fotos son reales
const PH_BADGE_RE = /<span\b[^>]*\bclass\s*=\s*"[^"]*\bph-badge\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi
```

---

## 6. Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| **`src/services/unsplash.ts`** *(nuevo)* | Todo el servicio: búsqueda, descarga, dedup, reescritura, atribución, strip de badge. |
| **`src/services/claude.ts`** | `unsplashEnabled` en `GenerateOptions`; nueva rama en `buildImageRules`; se pasa a `buildSystemPrompt` y al `generateSlides`. Instrucción de **no** añadir `.ph-badge`. |
| **`src/routes/generate.ts`** | Calcula `unsplashEnabled = placeholders.length === 0 && isUnsplashConfigured()`; tras generar, llama a `resolveUnsplashSlots` y sobrescribe `slides.slides[i].html`; cabecera `X-Image-Warning` si falla. |
| **`public/app.js`** | Muestra el aviso combinando `X-Voice-Warning` **o** `X-Image-Warning`. |
| **`public/index.html`** | Hint del dropzone: "sin ellas, la IA busca fotos en Unsplash". |
| **`.env.example`** | Nueva variable `UNSPLASH_ACCESS_KEY` documentada. |

---

## 7. Decisiones de diseño (el "por qué")

- **Reescribir a `data-img` en vez de inyectar `src` directamente.** Mantiene un
  único punto de verdad (`fillSlots`) y hace que el editor visual y el `deck-store`
  no necesiten enterarse de Unsplash.
- **Resolver en el servidor, no en el navegador.** La clave de Unsplash no se expone
  al cliente, y la foto queda **embebida en base64** en el HTML → el deck sigue siendo
  un único archivo autocontenido descargable (igual que el audio TTS).
- **Consultas en inglés y concretas.** Unsplash indexa sobre todo en inglés; los
  sujetos concretos ("team meeting office") devuelven mejores fotos que los abstractos.
- **Fallos aislados y silenciosos.** Una foto que no se encuentra nunca debe romper
  el deck: se deja el degradado de fallback que el tema ya define para `.imgbox`/`.media`.
- **Sin pie de foto.** Se pidió explícitamente. Doble red: (1) el prompt le dice a
  Claude que no ponga `.ph-badge`; (2) el servidor lo elimina igualmente por si acaso,
  porque la regla general de densidad seguía empujando a ponerlo.

---

## 8. Cómo probarlo

1. Crear una app en <https://unsplash.com/developers> y copiar el **Access Key**.
2. Ponerlo en `.env`: `UNSPLASH_ACCESS_KEY=...`
3. `npm run dev`, subir un PDF **sin** imágenes placeholder y generar.
4. Verificar que las slides traen fotos reales y **sin** pie "Foto · Unsplash".

Sin la clave, el comportamiento es el de antes (solo texto y tarjetas).

> **Límite del modo demo de Unsplash:** 50 peticiones/hora. Cada foto consume una
> búsqueda + una descarga, así que da para varios decks. Para producción hay que
> solicitar el paso a producción en el dashboard de Unsplash.

---

## 9. Posibles mejoras futuras

- Cachear búsquedas/descargas entre decks para no gastar cuota repitiendo consultas.
- Permitir al usuario **elegir** entre modo Unsplash y modo solo-texto (hoy es
  automático según haya clave o no).
- Añadir un enlace de atribución **visible** si se quiere cumplir la versión más
  estricta de las guidelines (hoy va solo en el `alt`).

---

## 10. Regenerar fotos desde el editor visual *(añadido 2026-07-16)*

En modo edición, el popover de imagen ofrece dos opciones nuevas (solo si el
servidor tiene clave de Unsplash — la UI lo consulta en `GET /api/unsplash`):

- **⟳ Regenerar foto** — repite la búsqueda que trajo esa foto (`data-img-query`)
  y aplica otra distinta. Solo aparece si el elemento recuerda su query.
- **🔍 Buscar en Unsplash…** — despliega un input (precargado con la query actual)
  donde el usuario escribe su propia búsqueda; Enter o "Ir" la lanzan. Disponible
  para **cualquier** imagen del deck, también las subidas como placeholder.

### Endpoint

```
POST /api/unsplash/photo
body:      { query, orientation?: 'landscape'|'portrait', excludeIds?: string[] }
respuesta: { id, dataUri, photographer }
errores:   400 sin query · 404 sin resultados · 409 sin configurar · 502 API caída
```

El servidor (`pickUnsplashPhoto`) busca, filtra los `excludeIds`, elige **al azar**
entre el resto (variedad al pulsar ⟳ repetidas veces; si el usuario ya lo vio todo,
recicla) y descarga la foto como data URI, registrando el `download_location`.

### Detalles del cliente (editor.js)

- La **orientación** se deduce del aspecto del elemento en pantalla.
- Cada elemento acumula en memoria los ids ya mostrados (`WeakMap`) y lleva la
  foto actual en `data-img-id`; ambos van en `excludeIds`.
- Al aplicar: se actualizan `src`/`background-image`, `data-img-query` (pasa a ser
  la búsqueda manual si la hubo), `data-img-id` y el `alt` de atribución.
- Se **elimina `data-img`** del elemento: apuntaba al placeholder anterior y un
  re-render posterior (p. ej. `/api/audio`) volvería a pisar la foto nueva.
- El input de búsqueda aísla **todo** el teclado de los atajos del deck
  (`p`/`m`/`c`/flechas) vía la guarda de captura en `window`; Enter lanza la búsqueda.
- La persistencia es la del editor: al **Guardar**, el HTML con la foto horneada
  va al deck-store por `PUT /api/deck/:id/slides`.
