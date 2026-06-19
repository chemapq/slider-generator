# Plan por fases: Generador de presentaciones HTML a partir de PDF + assets con Claude

## Contexto

Esta app **automatiza** el proceso que se hizo a mano en el proyecto anterior
(`awk-video-test`, ver `CONVERSACION.md` y `LEEME.md`): a partir de un **PDF** (guion con el
texto literal de las slides), un set de **imágenes placeholder**, una foto de **avatar-tutor**
y unas **referencias de estilo**, Claude genera una **presentación corporativa en HTML** —un
**deck propio autocontenido** (no reveal.js)— con layouts creativos y variados que mantienen
una imagen corporativa consistente.

El usuario sube los recursos a un backend, este habla con **Claude**, y devuelve el deck HTML
listo para previsualizar y descargar.

### Decisiones (confirmadas)

- **Stack:** Node + TypeScript (Fastify).
- **Salida:** **deck HTML propio, autocontenido** — un único `.html` con **CSS + JS inline**,
  slides 16:9, **navegación** por teclado/flechas, **barra de progreso**, **contador**,
  **puntos** y **auto-reescalado** a cualquier pantalla. Sin dependencias externas salvo la
  fuente (Google Fonts). **NO** se usa reveal.js.
- **Entradas** (multipart):
  1. **PDF** (obligatorio): contenido literal de las slides.
  2. **Imágenes placeholder** (opcional, varias): se distribuyen por las slides según
     orientación (horizontal/vertical). Reemplazables en producción.
  3. **Avatar-tutor** (opcional, 1 imagen): retrato con **máscara circular** y anillo
     "en directo"; aparece **solo en intro y conclusión**.
  4. **Imágenes de referencia de estilo** (opcional, varias): refuerzan el estilo en esa
     generación concreta (ver más abajo).
- **Estilo (temas):** se usa un sistema de **temas JSON** (`themes/*.json` = tokens + CSS),
  pero **cocinados con la mayor fidelidad posible a partir de las imágenes de referencia** (el
  builder envía las imágenes a Claude UNA vez para "descifrarlas" a un tema). En runtime se usa
  el JSON (barato, sin imágenes). **Decisión técnica:** NO es imprescindible enviar imágenes en
  cada generación —un tema JSON con la paleta exacta + tipografía + **CSS de componentes**
  reproduce el aspecto con fidelidad—; la creatividad de layout la aporta el modelo + el
  vocabulario de componentes. Si el usuario **adjunta** imágenes de referencia en una
  generación, **esa vez sí** se envían como bloques `image` para reforzar.
- **Modelo:** `claude-opus-4-8`.
- **Empaquetado (ZIP/LEEME/CONVERSACION):** fuera de alcance; la app devuelve **solo el HTML**.

### Hechos clave (API de Claude)

- **Claude lee PDFs nativamente** (bloque `document` base64, `media_type: "application/pdf"`),
  sin librería de parseo.
- **Claude acepta imágenes** (bloques `image` base64, PNG/JPEG/WebP/GIF). Se usan al **crear
  un tema** (builder) y, opcionalmente, al **reforzar** una generación con referencias.
- **Salida estructurada** vía `output_config.format` con `zodOutputFormat` (Zod).

### Imágenes en el deck: data URIs

Como el entregable es **un único HTML** (sin ZIP ni carpeta `images/`), las imágenes
(placeholders y avatar) se **incrustan como data URIs** (base64) directamente en el HTML. Así
el archivo es autocontenido: se ve igual en el `<iframe>` de previsualización y al descargarlo
y abrirlo con doble clic. (Tradeoff: el archivo pesa más y "reemplazar el placeholder en
producción" implica regenerar; aceptable dado "solo el HTML").

### Arquitectura objetivo

```
slider-generator/
  package.json  tsconfig.json  .env  .env.example  .gitignore
  references/                # imágenes de estilo (para cocinar temas por defecto)
  themes/                    # temas derivados (JSON: tokens + CSS) — se consumen en runtime
    timely-ai.json
  scripts/
    build-theme.ts           # builder de temas: descifra imágenes -> tema JSON (+ preview)
  src/
    server.ts                # Fastify + estáticos + rutas
    routes/generate.ts       # POST /api/generate (multipart) + GET /api/themes
    services/claude.ts       # PDF + manifiesto de imágenes (+refs) + tema -> JSON de slides
    services/slides.ts       # JSON de slides + tema + imágenes -> deck HTML autocontenido
    services/images.ts       # lee imágenes subidas: orientación + data URI + manifiesto
    services/themes.ts       # carga/lista themes/
    services/references.ts   # lee imágenes de references/ a bloques image base64
    config/schema.ts         # esquema Zod del contenido de slides (con slots de imagen/avatar)
    config/theme-schema.ts   # esquema Zod del tema
    templates/deck.ts        # shell del deck propio (CSS+JS inline) con {{TITLE}}/{{CSS}}/{{SLIDES}}
  public/
    index.html  app.js       # UI: zonas de subida (PDF, imágenes, avatar, refs) + tema
```

---

## Estado actual del repo (qué se reaprovecha)

Hecho y reutilizable: **Fase 0** (andamiaje) y **Fase 1** (servidor + estáticos). Existe ya un
tema `timely-ai`, un `ThemeSchema`/`SlidesSchema` base, `services/themes.ts`,
`services/references.ts`, una integración `claude.ts` (solo PDF), un renderer y un shell de
**reveal.js**, y una UI base de subida de un solo PDF.

**Cambia respecto al plan viejo (reveal.js → deck propio + multi-asset):**
- `src/templates/reveal.ts` → se sustituye por `src/templates/deck.ts` (deck propio).
- El **CSS de los temas** deja de apuntar a `.reveal …` y pasa a la estructura del deck propio.
- `claude.ts`, `slides.ts`, `generate.ts` y la UI se amplían para los nuevos assets.
- Se añade `services/images.ts`.

---

## Fase 0 — Andamiaje ✅

Estructura, dependencias y TypeScript compilando (`npm init`, Fastify, `@fastify/multipart`,
`@fastify/static`, `@anthropic-ai/sdk`, `zod`, `dotenv`; dev: `typescript`, `tsx`,
`@types/node`). `tsconfig` strict, `"type": "module"`, scripts `dev`/`build`/`start`/`typecheck`.

**Nueva dependencia a añadir:** `image-size` (detección ligera de dimensiones para clasificar
las imágenes placeholder en horizontal/vertical sin decodificarlas enteras).

---

## Fase 1 — Servidor base y estáticos ✅

Fastify con `@fastify/multipart` (límite ~25 MB) y `@fastify/static` sirviendo `public/`.

---

## Fase 2 — Esquemas y vocabulario de componentes (REHACER)

**Objetivo:** definir los contratos de datos del **deck propio** y el vocabulario de
componentes (incluyendo **slots de imagen** y **avatar**) antes de tocar Claude.

Pasos:
1. `src/config/theme-schema.ts`: mantener `ThemeSchema` (`name`, `label?`, `description?`,
   `source?`, `palette`, `typography`, `css`). Ajustar el comentario: el `css` ahora estiliza
   el **deck propio** (no `.reveal`). Opcional: añadir tokens de avatar (color de anillo).
2. `src/config/schema.ts`: `SlidesSchema` del **contenido** (el estilo lo da el tema). Cada
   slide:
   ```ts
   const Slide = z.object({
     slideClass: z.string().optional(), // "title-slide" | "section-divider" | "outro" | ...
     html: z.string(),                  // HTML interno con clases del vocabulario y slots
     notes: z.string().optional(),
   })
   export const SlidesSchema = z.object({
     title: z.string(),
     subtitle: z.string().optional(),
     slides: z.array(Slide),
   })
   ```
   **Convención de slots dentro de `html`** (las rellena el renderer, no Claude):
   - Imagen placeholder: `<div class="media" data-img="h1"></div>` (o `data-img="v2"`), donde
     el id viene del **manifiesto** de imágenes subidas. Si el id no existe, el renderer deja
     el `.media` como degradado (fallback) — nunca se rompe.
   - Avatar-tutor: `<div class="avatar" data-avatar></div>` — solo en intro/outro.
3. **Vocabulario de componentes** (documentado en `claude.ts`, ver Fase 4): h1/h3, `.lead`,
   `.muted`, `.eyebrow`, `.split`, `.stack`, `.grid-cards`, `.card`/`.card--purple`/`.card--dark`,
   `.media`/`.media--dark` (con `data-img`), `.avatar` (con `data-avatar`), `.pill`, `.tag`, y
   slides especiales por `slideClass`: `title-slide` (portada), `section-divider` (divisor con
   número grande), `outro`/cierre.

**Verificación:** `tsc --noEmit` sin errores.

---

## Fase 3 — Temas fieles desde imágenes (`scripts/build-theme.ts`) (REHACER)

**Objetivo:** "cocinar" un tema JSON **fiel a las imágenes de referencia** y generar un preview
con el **deck propio**.

Pasos:
1. Modo **descifrar**: el builder envía las imágenes de `references/` a Claude como bloques
   `image` con `output_config.format = zodOutputFormat(ThemeSchema)`, pidiéndole extraer
   paleta exacta, tipografía y un **CSS de componentes** que reproduzca el aspecto sobre la
   estructura del **deck propio**. Valida con `ThemeSchema` y escribe `themes/<name>.json`.
2. Modo **a mano** (fallback sin tokens): mantener un tema definido en código (el actual
   `timely-ai`) pero **migrando su CSS** de `.reveal …` a los selectores del deck propio.
3. Generar `preview.generated.html` con `renderDeck(...)` y unas slides de muestra para
   comparar a ojo.

**Verificación:** `npx tsx scripts/build-theme.ts` genera el JSON y el preview; abrir el
preview y comprobar que el aspecto coincide con `references/`.

---

## Fase 4 — Integración con Claude (`services/claude.ts`) (REHACER)

**Objetivo:** `generateSlides({ pdfBase64, theme, imageManifest, hasAvatar, referenceImages? })`
que devuelve un `Slides` validado, con layouts creativos y assets bien asignados.

Pasos:
1. **System prompt** (rol "diseñador de presentaciones corporativas", `cache_control`):
   - Vocabulario de componentes (Fase 2) + paleta del tema.
   - Reglas de contenido del proyecto anterior: **texto literal del PDF** (no inventar),
     **portada** + **bienvenida con avatar** + **agenda** + **divisores de sección** +
     contenido en tarjetas/rejillas + **conclusión con avatar** + cierre; layouts **variados y
     creativos** manteniendo coherencia corporativa; texto conciso; idioma del PDF.
   - **Reglas de imágenes:** asignar `data-img` **respetando la orientación** indicada en el
     manifiesto (horizontal→`.media` ancho, vertical→`.media` alto/columna); no repetir en
     exceso; si no hay imágenes, usar `.media` como degradado.
   - **Regla de avatar:** usar `data-avatar` **solo** en la slide de bienvenida (intro) y en la
     de conclusión, y solo si `hasAvatar`.
2. **Mensaje `user`:** bloque `document` (PDF) + **manifiesto** de imágenes en texto
   (`h1 (horizontal), v1 (vertical), …; avatar: sí/no`) + (si el usuario adjuntó referencias)
   los bloques `image` de refuerzo + instrucción de generar la presentación.
3. `client.messages.stream({ model: 'claude-opus-4-8', max_tokens: 64000,
   thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: zodOutputFormat(SlidesSchema) } })`.
4. `.finalMessage()`: comprobar `stop_reason` (`refusal`/`max_tokens` → error claro) y devolver
   `parsed_output`.

**Verificación (consume tokens):** script temporal con `.env`, un PDF de prueba, un par de
imágenes y `loadTheme('timely-ai')`; `console.log` del `Slides` y revisar que referencia los
`data-img`/`data-avatar` esperados.

---

## Fase 5 — Renderizado al deck propio (`services/slides.ts` + `templates/deck.ts`) (REHACER)

**Objetivo:** convertir `(Slides, Theme, imágenes)` en un **deck HTML autocontenido**.

Pasos:
1. `src/templates/deck.ts`: `renderDeck({ title, css, slides })` que devuelve un HTML con:
   - `<style>` = **CSS base del deck** (escenario 1280×720 centrado y **escalado por transform**
     al viewport manteniendo 16:9; visibilidad de `.slide`; barra de progreso; puntos; contador;
     estilos de `.avatar` con máscara circular + anillo "en directo") **+** `theme.css`.
   - markup: `<div class="stage"><div class="deck">{{SLIDES}}</div></div>` + controles `‹`/`›`
     + barra de progreso + puntos + contador.
   - `<script>` inline: índice de slide, mostrar/ocultar, **teclado** (`→ ↓ Space`, `← ↑`,
     `Home`/`End`), botones, clic en puntos, actualización de progreso/contador, y **resize →
     recálculo de escala**. Sin dependencias externas (salvo fuentes del tema).
2. `src/services/slides.ts`: `renderSlides(data, theme, images)`:
   - por cada slide → `<section class="slide {slideClass}">{html}</section>`,
   - **sustituir slots**: `data-img="<id>"` → fija `background-image: url(<dataUri>)` (o un
     `<img>`); `data-avatar` → inserta el avatar (dataUri) con la clase `.avatar`. Fallback a
     degradado si el id no existe.
   - notas en `<aside class="notes">` (ocultas; opcionalmente modo presentador más adelante),
   - inyectar `title`, `theme.css` y el markup en `renderDeck`.
3. Borrar/retirar `src/templates/reveal.ts`.

**Verificación:** alimentar `renderSlides` con un `Slides` fixture + tema + 1–2 imágenes;
escribir el HTML y abrirlo: navega con teclado/flechas, barra de progreso y contador funcionan,
se reescala, y las imágenes/avatar aparecen incrustados.

---

## Fase 6 — Endpoint `POST /api/generate` (REHACER)

**Objetivo:** unir todo en la ruta HTTP con **multipart de varios archivos**.

Pasos:
1. `src/services/images.ts`: dado el conjunto de buffers subidos, devolver
   `{ id, orientation: 'h'|'v', mime, dataUri }[]` (orientación con `image-size`) y un
   **manifiesto** legible para el prompt. Avatar aparte (id fijo `avatar`).
2. `src/routes/generate.ts`: handler que recorre las partes multipart:
   - `file` (PDF, obligatorio) → validar PDF → base64.
   - `images[]` (placeholders) → `services/images.ts` (manifiesto + data URIs).
   - `avatar` (1, opcional) → data URI.
   - `references[]` (opcional) → bloques `image` de refuerzo.
   - `theme` (campo) → `loadTheme(name)` (por defecto `timely-ai`).
   - `generateSlides(...)` → `renderSlides(...)` → responder `text/html`.
3. Manejo de errores: 400 si falta/!PDF; 413 si excede tamaño; 502/500 con mensaje claro si
   Claude falla o `stop_reason` problemático.
4. `GET /api/themes` (ya existe) para el selector.

**Verificación:** `curl` con `-F file=@muestra.pdf -F images=@a.jpg -F images=@b.jpg
-F avatar=@avatar.jpg` → `out.html`; abrir y navegar. Probar no-PDF → 400.

---

## Fase 7 — UI de subida (`public/`) (REHACER)

**Objetivo:** página para aportar todos los recursos y ver/descargar el deck.

Pasos:
1. `public/index.html`: zona **drag & drop del PDF** + **zona de imágenes placeholder**
   (múltiples, con miniaturas) + **avatar** (1) + **referencias** (opcional, múltiples) +
   **selector de tema** (`GET /api/themes`) + botón "Generar" + `<iframe>` de vista previa +
   "Descargar HTML" + estado de carga/errores. (Existe una UI base de un solo PDF que se amplía.)
2. `public/app.js`: arma un `FormData` con `file`, `images[]`, `avatar`, `references[]`, `theme`;
   `fetch('/api/generate', { method:'POST', body })`; muestra el HTML en el `<iframe>` vía Blob
   URL y permite descargarlo como `.html`.

**Verificación:** abrir `http://localhost:3000`, aportar PDF + imágenes + avatar, elegir tema,
generar, navegar el deck en el iframe y descargar el `.html`.

---

## Fase 8 — Pulido y robustez (opcional)

- **Crear/refinar temas desde el frontend:** subir imágenes → Claude las descifra a un
  `ThemeSchema` → guardar en `themes/` (reutiliza el modo "descifrar" de la Fase 3).
- Mejorar estética del deck y la UI.
- Aviso si el PDF es demasiado grande para el contexto (no truncar en silencio).
- Modo presentador / notas visibles, atajos extra.
- (Posible futuro) salida con `images/` relativas + **ZIP** descargable, como el entregable
  original — hoy fuera de alcance.
- `README.md` con instrucciones de uso.

---

## Orden de ejecución sugerido

Fase 0 ✅ → 1 ✅ → **2 → 3 → 4 → 5 → 6 → 7 → (8)**. Las fases 2, 5 y 7 se validan con fixtures
sin gastar API; las fases 3 y 4 consumen tokens (necesitan `.env` con clave).

**Estado:** Fases 0–7 hechas y verificadas. Prueba end-to-end OK (servidor real: PDF + imágenes
+ avatar → deck HTML de 10 slides con title-slide/section-divider/outro, imágenes y avatar
incrustados como data URIs, CSS+JS del deck propio). El tema `timely-ai` está cocinado desde las
referencias con `--from-images`. Pendiente: **Fase 8** (pulido opcional): crear temas desde el
frontend, aviso de PDF grande, modo presentador, README de uso.
