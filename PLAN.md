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

> **La demo de referencia (ground truth):**
> `/Users/chema/Downloads/awk-video-test/presentacion-growth-revops.html` (19 slides, hecho a
> mano con Claude). **El objetivo de este reajuste es que la salida de la app se parezca a esa
> demo.** Cada decisión de diseño de abajo está calcada de ese archivo.

---

## Diagnóstico: por qué la salida actual NO se parece a la demo

La demo es un artefacto **bespoke y riquísimo**. La implementación actual de la app no puede
reproducirlo por **tres motivos estructurales** (no es un retoque, es un cambio de enfoque):

1. **El sistema de diseño del tema es pobre.** La demo tiene ~30 tokens y ~20 componentes con
   variantes, iconos y decoración; el tema `timely-ai` actual solo tiene ~8 clases planas
   (`.card`, `.media`, `.pill`, `.tag`, `.split`, `.stack`, `.grid-cards`). Faltan, entre otros:
   `.brandbar`/`.brand`/`.kicker`, `.tag` con `.pip`, `.btn` con `.circ`+SVG, `.card` con `.ico`
   (icono) y `.num-badge` (número gigante tenue), variantes `.card.dark`/`.card.violet` con
   degradado, `.imgbox`+`.ph-badge`, `.tutor` animado (anillos `pulse` + badge "en directo"
   parpadeante), `.blob`, número de sección gigante (~420px), el **funnel AARRR**, el **flujo de
   pasos con flechas**, `.stat`.

2. **El prompt prohíbe lo que da la riqueza.** Dice *"usa SOLO estas clases"* + *"No generes
   CSS"*. La demo está **llena de `style="..."` a medida** (splits 47/53, badges flotantes en
   `position:absolute`, las barras del funnel que se estrechan, el "01" a 420px) y de **iconos
   SVG inline en casi cada tarjeta**. Con las reglas actuales el modelo no puede componer nada
   de eso.

3. **El "chrome" (navegación) difiere.** Demo: barra de progreso **degradada arriba** + nav
   flotante tipo cristal (chevrons SVG, contador `01 / 18`, puntos que se **alargan** al activarse)
   + hint en una esquina + **transición fade/scale** entre slides, todo **fuera** del escenario
   1280×720. App: una barra sólida **dentro** del escenario (se come 48px de slide), puntos
   planos, contador `1 / 19`, sin transiciones, sin hint. Además el avatar de la demo es un
   `.tutor` **animado**; el de la app es un `<img>` estático.

### Estrategia del reajuste (confirmada con el usuario, 2026-06-22)

- **Fidelidad por _tokens + libertad inline_** (opción elegida frente a "solo clases"): el tema
  aporta un **contrato de tokens `:root`** + un **catálogo de componentes base** (brandbar,
  card+ico, tutor, blob, funnel, flow…), y **el modelo compone cada slide con estilos inline +
  iconos SVG a medida, anclados a esos tokens** — exactamente como se hizo la demo. Máxima
  fidelidad; a cambio, cada deck sale algo distinto y consume algo más por generación (asumido).
- **El tema por defecto `timely-ai` pasa a SER el sistema de diseño de la demo** (portado 1:1,
  renombrando `--violet*` → `--primary*` para que el contrato de tokens sea neutral de marca).
- **El chrome se rehace** para calcar el de la demo (overlays fijos fuera del escenario).
- **Alcance de esta sesión:** solo PLAN.md. La implementación viene después.

---

### Decisiones (confirmadas)

- **Stack:** Node + TypeScript (Fastify).
- **Salida:** **deck HTML propio, autocontenido** — un único `.html` con **CSS + JS inline**,
  slides 16:9, **navegación** por teclado/flechas, **barra de progreso degradada**, **contador**,
  **puntos**, **transición fade/scale** y **auto-reescalado**. Sin dependencias externas salvo la
  fuente (Google Fonts). **NO** se usa reveal.js.
- **Entradas** (multipart):
  1. **PDF** (obligatorio): contenido literal de las slides.
  2. **Imágenes placeholder** (opcional, varias): se distribuyen por las slides según
     orientación (horizontal/vertical). Reemplazables en producción.
  3. **Avatar-tutor** (opcional, 1 imagen): retrato dentro del componente `.tutor` con anillos
     animados + badge "en directo"; aparece **solo en intro y conclusión**.
  4. **Imágenes de referencia de estilo** (opcional, varias): refuerzan el estilo en esa
     generación concreta.
- **Estilo (temas):** sistema de **temas JSON** (`themes/*.json` = tokens + CSS) cocinados con
  fidelidad a partir de las referencias. En runtime se usa el JSON (barato, sin imágenes). El
  tema define el **contrato de tokens** y los **componentes base**; el modelo añade composición
  inline + SVG anclada a esos tokens. Si el usuario adjunta imágenes en una generación, esa vez
  se envían como bloques `image` de refuerzo.
- **Modelo:** `claude-opus-4-8`.
- **Empaquetado (ZIP/LEEME/CONVERSACION):** fuera de alcance; la app devuelve **solo el HTML**.

### Hechos clave (API de Claude)

- **Claude lee PDFs nativamente** (bloque `document` base64, `media_type: "application/pdf"`).
- **Claude acepta imágenes** (bloques `image` base64). Se usan al **crear un tema** (builder) y,
  opcionalmente, al **reforzar** una generación con referencias.
- **Salida estructurada** vía `output_config.format` con `zodOutputFormat` (Zod).

### Imágenes en el deck: data URIs

El entregable es **un único HTML**, así que las imágenes (placeholders y avatar) se **incrustan
como data URIs** (base64) directamente en el HTML.

### Arquitectura objetivo (sin cambios de archivos respecto al plan previo)

```
slider-generator/
  package.json  tsconfig.json  .env  .env.example  .gitignore
  references/                # imágenes de estilo (slide01-03.png)
  themes/                    # temas (JSON: tokens + CSS) — se consumen en runtime
    timely-ai.json           #  ← se REGENERA con el sistema de diseño de la demo
  scripts/
    build-theme.ts           # builder de temas: descifra imágenes -> tema JSON (+ preview)
  src/
    server.ts                # Fastify + estáticos + rutas
    routes/generate.ts       # POST /api/generate (multipart) + GET /api/themes
    services/claude.ts       # PDF + manifiesto (+refs) + tema -> JSON de slides
    services/slides.ts       # JSON de slides + tema + imágenes -> deck HTML autocontenido
    services/images.ts       # lee imágenes subidas: orientación + data URI + manifiesto
    services/themes.ts       # carga/lista themes/
    services/references.ts   # lee imágenes de references/ a bloques image base64
    config/schema.ts         # esquema Zod del contenido de slides
    config/theme-schema.ts   # esquema Zod del tema
    templates/deck.ts        # shell del deck propio (CSS+JS inline) — ← chrome REHECHO
  public/
    index.html  app.js       # UI de subida + tema
```

---

## Contrato de tokens (lo definen TODOS los temas; el prompt los da por hechos)

El builder garantiza que el `:root` del CSS de cada tema define **este set canónico** (neutral de
marca). El prompt de generación los lista para que el modelo los use en sus estilos inline:

| Token | Demo (timely-ai) | Uso |
|---|---|---|
| `--bg` | `#fff` | fondo de slide de contenido |
| `--text` / `--ink` | `#16131F` | texto principal / titulares |
| `--ink-soft` | `#2A2636` | texto destacado sobre claro |
| `--muted` / `--muted-2` | `#6B6880` / `#8E8BA0` | texto secundario / etiquetas tenues |
| `--primary` | `#6C4CF1` | acento de marca (era `--violet`) |
| `--primary-600` | `#5B3CE0` | acento oscuro (era `--violet-600`) |
| `--primary-300` | `#A78BFF` | acento claro (anillos, kicker en oscuro) |
| `--primary-soft` | `#F4F1FF` | fondos suaves de marca |
| `--card` / `--card-2` | `#F2F1F6` / `#ECEAF3` | fondos de tarjeta claros |
| `--dark` / `--black` | `#0C0B10` | tarjetas/secciones oscuras |
| `--grad` | `linear-gradient(135deg,#7C5CFC,#5B3CE0 60%,#3F27B8)` | degradado de marca |
| `--grad-soft` | `linear-gradient(135deg,#EFEAFF,#E2D8FF)` | degradado suave |
| `--shadow-sm` / `--shadow` / `--shadow-lg` | (ver demo) | sombras |
| `--radius` / `--radius-sm` | `26px` / `16px` | redondeos |
| `--avatar-ring` | `--primary-300` | color del anillo del tutor |

> **Nota de port:** el CSS de la demo usa `--violet*`. Al portarlo, renombrar a `--primary*`
> (búsqueda/reemplazo) para que el contrato sea neutral; los **valores** son idénticos a la demo.

---

## Catálogo de componentes (portado de la demo)

El tema estiliza estas clases; el modelo las usa y las **enriquece con estilos inline**. Convención
de variantes **calcada de la demo** (p. ej. `.card.dark`, no `.card--dark`).

- **Texto:** `h1` (900, marca, hasta ~56px), `h2` (800), `h3` (800), `p` (muted, 1.55),
  `.lead` (destacado 16–18px), `b/strong` (ink, 700), `.vio` (span en color de marca),
  `.kicker` (MAYÚS, tracking, tenue o marca), `.eyebrow` (alias de kicker).
- **Marca / cabecera:** `.brandbar` (absolute top, izq/der), `.brand` (logo `.dot` con `::after`
  + nombre), `.brand.light` (sobre fondo oscuro), `.num` (etiqueta de sección a la derecha).
- **Chips / botones:** `.tag` + `.pip` (pastilla con punto), `.btn` + `.circ` (CTA negro con
  círculo blanco + chevron SVG).
- **Tarjetas:** `.card`, `.card.dark`, `.card.violet` (degradado), `.card .ico` (caja de icono
  46px con SVG), `.card .num-badge` (número gigante tenue en la esquina).
- **Imágenes:** `.imgbox` (contenedor con degradado de fondo) > `<img>` + `.ph-badge`
  ("Imagen · placeholder").
- **Avatar-tutor:** `.tutor` (> `.ring`, `.ring.r2` [anillos `@keyframes pulse`], `.photo`>`img`,
  `.live`>`.blink` [`@keyframes blink`]).
- **Decoración / datos:** `.blob` (círculo difuminado posicionado inline), `.stat` (cifra grande),
  `.section-num` (número de divisor gigante, ~420px, posicionado inline a la derecha).
- **Recetas compuestas (con inline, NO clases nuevas):** funnel AARRR (filas con `width`
  decreciente y `align-self:flex-end`), flujo de pasos (cards + `→`), portada con imagen enmarcada
  (borde dashed + badges flotantes en absolute), quote (comilla gigante + `h2`), cierre en
  degradado centrado.

---

## Estado actual del repo (qué se reaprovecha y qué cambia)

Reaprovechable tal cual: **Fase 0** (andamiaje), **Fase 1** (servidor + estáticos),
`services/images.ts`, `services/themes.ts`, `services/references.ts`, `config/theme-schema.ts`
(quizá con tokens extra), el esqueleto de `claude.ts`/`slides.ts`/`generate.ts` y la UI base.

**Cambia (núcleo del reajuste):**
- `themes/timely-ai.json` y `scripts/build-theme.ts` → **CSS portado de la demo** (sistema de
  diseño completo, tokens canónicos, todos los componentes).
- `src/templates/deck.ts` → **chrome rehecho** (overlays fijos, progreso degradado, nav cristal,
  puntos que se alargan, contador `01/NN`, hint, transición fade/scale).
- `src/services/claude.ts` → **prompt nuevo**: contrato de tokens + catálogo + **permiso explícito
  de estilos inline y SVG** + recetas de layout + reglas de estructura/densidad de la demo.
- `src/config/schema.ts` → documentación del vocabulario + set canónico de `slideClass`.
- `src/services/slides.ts` → relleno de slots para `.tutor` (img interno) y `.imgbox`/`<img>`.

---

## Fase 0 — Andamiaje ✅  (sin cambios)

## Fase 1 — Servidor base y estáticos ✅  (sin cambios)

---

## Fase R2 — Esquema y `slideClass` canónicos

**Objetivo:** dejar `schema.ts` describiendo el vocabulario nuevo y fijar los `slideClass` que el
tema estiliza con fondo completo.

Pasos:
1. `SlidesSchema` se mantiene (`title`, `subtitle?`, `slides[{ slideClass?, html, notes? }]`). El
   campo `html` ya admite cualquier HTML (incl. inline + SVG): **no se restringe**.
2. Documentar en el comentario el **catálogo de componentes** y los **tokens** (resumen del
   contrato de arriba) y el set canónico de `slideClass`:
   - `"cover"` — portada (split degradado/blanco + imagen enmarcada + badges flotantes).
   - `"intro"` — bienvenida con `.tutor`.
   - `""` (vacío) — slide de contenido (fondo blanco; el modelo añade `.brandbar` + layout).
   - `"section-divider"` — fondo **negro** + `.section-num` gigante + `.blob`.
   - `"outro"` — conclusión con `.tutor`.
   - `"closing"` — fondo **degradado**, centrado.
   - Los fondos de `section-divider`/`closing` los pone el **tema** (`.slide.section-divider`,
     `.slide.closing`); las áreas de color de `cover/intro/outro` son columnas internas con
     `style="background:var(--…)"` que compone el modelo.

**Verificación:** `tsc --noEmit` sin errores.

---

## Fase R3 — Tema = sistema de diseño de la demo (`build-theme.ts` + `timely-ai.json`)

**Objetivo:** que `timely-ai` reproduzca la demo, y que el modo "descifrar" extraiga temas igual
de ricos.

Pasos:
1. **Portar el CSS de la demo** a `TIMELY_AI_CSS` en `build-theme.ts`:
   - Copiar el bloque `<style>` de `presentacion-growth-revops.html` (líneas ~11–170).
   - **Renombrar** `--violet*` → `--primary*` (y exponer alias del contrato de tokens).
   - **Quitar del tema** lo que pasa a ser del deck (chrome): `#stage`, `.slide{position…}`,
     `#progress`, `#nav`, `#dots`, `#counter`, `.hint`, `body`. El tema **solo** aporta tipografía,
     colores y los componentes (`.brandbar`, `.tag`, `.btn`, `.card.*`, `.ico`, `.num-badge`,
     `.imgbox`, `.ph-badge`, `.tutor` + keyframes, `.blob`, `.stat`, `.section-num`, `h1..h3`,
     `p`, `.lead`, `.muted`, `.kicker`, `.vio`) y los fondos por `slideClass`
     (`.slide.section-divider{background:var(--black)}`, `.slide.closing{background:var(--grad)}`).
   - Mantener `@import` de **Inter** al inicio (la demo usa Inter, no Plus Jakarta Sans → corregir
     la `typography` del tema a Inter).
2. **Actualizar `palette`/`typography`** del `TIMELY_AI_THEME` a los valores de la demo (Inter;
   `primary #6C4CF1`, etc.).
3. **Modo "descifrar"** (`buildFromImages`): reescribir el `USER_TEXT` para pedir el **catálogo
   completo** (todos los componentes + el contrato de tokens) y dejar claro qué selectores son
   estructurales del deck (no tocarlos: chrome, tamaño de `.tutor`/anillo, `.section-num` tamaño).
4. **`checkCssCompleteness`**: actualizar `required[]` al vocabulario nuevo
   (`.brandbar`, `.kicker`, `.tag`, `.pip`, `.btn`, `.card`, `.card.dark`, `.card.violet`, `.ico`,
   `.num-badge`, `.imgbox`, `.ph-badge`, `.tutor`, `.ring`, `.live`, `.blob`, `.stat`,
   `.section-num`, `section-divider`, `closing`, `outro`).
5. **`SAMPLE_SLIDES`**: rehacerlas para ejercitar TODO (portada con imagen enmarcada, intro con
   tutor, contenido con brandbar + cards con `.ico`/`.num-badge`, divisor con número gigante +
   blob, funnel, flujo de pasos, quote, conclusión con tutor, cierre en degradado) → el preview
   debe verse ~ como la demo.

**Verificación:** `npx tsx scripts/build-theme.ts` genera `timely-ai.json` + `preview.generated.html`;
abrir el preview **junto a la demo** y comparar a ojo (paleta, tarjetas, tutor, divisores, nav).
`--from-images` (consume tokens) debe producir un CSS que pase `checkCssCompleteness`.

---

## Fase R4 — Chrome del deck rehecho (`templates/deck.ts`)

**Objetivo:** que la navegación, el escalado y las transiciones calquen la demo.

`BASE_CSS` (estructura; el tema NO lo toca), portado de la demo:
- `body{ background:#0E0C16; display:flex; center; overflow:hidden }`.
- `#stage{ position:relative; width:1280px; height:720px; transform-origin:center }`.
- `.slide{ position:absolute; inset:0; width:1280px; height:720px; display:flex; opacity:0;
  pointer-events:none; transform:scale(.985); transition:opacity .5s, transform .5s }`
  `.slide.active{ opacity:1; pointer-events:auto; transform:scale(1); z-index:2 }`
  `.slide.prev{ opacity:0; transform:scale(1.01) }`. **El fondo de `.slide` lo pone el tema.**
- `#progress{ fixed top; height:4px; background:var(--grad,#6C4CF1); transition:width .4s }`.
- `#nav{ fixed bottom-center; cristal: rgba(255,255,255,.10)+blur(14px)+borde; pill }`,
  botones redondos con **chevrons SVG**, `#counter` con **cero a la izquierda** (`01 / 18`),
  `#dots .d` 7px que al activarse (`.on`) pasa a `width:22px; border-radius:999px`.
- `.hint{ fixed bottom-right; "← / → · barra espaciadora" }`.

`DECK_JS` (portar el de la demo, líneas ~591–637):
- construir dots, `render()` (toggle `.active`/`.prev`, dots `.on`, contador `pad(cur)/pad(total-1)`,
  `#progress.width = cur/(total-1)*100%`), `go/next/prev`, teclado
  (`→ ↓ PageDown Space` / `← ↑ PageUp` / `Home` / `End`), `fit()` (escala = `min(w/1280,h/720)`),
  init. **El chrome vive FUERA de `#stage`** (overlays fijos), no dentro como ahora.

`renderDeck({title, css, slides})`:
- markup: `#progress` + `#stage`(slides) + `#nav`(prev, counter, dots, next) + `.hint`.
- `<style>` = `BASE_CSS` + `theme.css`. `<link>`/`@import` de fuentes del tema.
- **El chrome lee tokens del tema** con fallback (`var(--grad, …)`, `var(--primary-300, …)`) para
  adaptarse a cualquier tema.

**Verificación:** alimentar `renderDeck` con `SAMPLE_SLIDES` (vía build-theme) y abrir: nav cristal
abajo, progreso degradado arriba, puntos que se alargan, contador `01/NN`, transición al cambiar,
reescalado al redimensionar. Comparar el chrome con la demo lado a lado.

---

## Fase R5 — Prompt de generación (`services/claude.ts`)

**Objetivo:** que Claude componga slides con la **misma riqueza y estructura** que la demo.

`buildSystemPrompt(theme, manifest, hasAvatar)` debe incluir:
1. **Rol:** "diseñador senior de presentaciones corporativas; construyes un deck HTML 16:9 a
   medida, denso y pulido, en el idioma del PDF".
2. **Contrato de tokens** (lista las variables `:root` disponibles, ver tabla) + **catálogo de
   componentes** (clases) — generados desde `theme.palette` para que sea estable entre temas.
3. **PERMISO EXPLÍCITO (clave):** *"Puedes y debes usar `style="..."` inline para afinar layout
   (anchos de columnas, posiciones `absolute`, tamaños) e **iconos SVG inline** dentro de `.ico` y
   `.btn .circ`. Ancla SIEMPRE colores/sombras/radios a los tokens (`var(--primary)`, `var(--grad)`,
   `var(--ink)`, `var(--muted)`, `var(--card)`, `var(--black)`…), nunca hardcodees hex de marca."*
4. **Recetas de layout** (describir, con la estructura de la demo, sin pegar todo el HTML):
   portada (`cover`: split ~47/53, columna izquierda `background:var(--grad)` con imagen enmarcada
   en borde dashed + 2 badges flotantes; derecha kicker+h1+lead+`.btn`+`.tag`); intro/outro con
   `.tutor`; contenido con `.brandbar` arriba (nombre + etiqueta de sección en `.num`); agenda =
   3 `.card` con `.num-badge` (1.1/1.2/1.3) + `.ico`; divisor = fondo negro, kicker+h1, `.section-num`
   gigante a la derecha + `.blob`; concepto = split con `.imgbox`; funnel AARRR (5 filas degradado
   con `width` decreciente y `align-self:flex-end`); flujo de pasos (cards + `→`); casos con `.stat`;
   competencias en `.grid-cards`; quote (comilla gigante + `h2` + `.tag`s); cierre (`closing`:
   degradado, centrado, `.blob`s).
5. **Reglas de estructura/densidad (de la demo):**
   - `.brandbar` en **todas** las slides de contenido, con la etiqueta de sección a la derecha.
   - Un **icono** (`.ico` + SVG) en casi cada tarjeta; `.num-badge` en tarjetas enumeradas.
   - **`.blob`** decorativo en portada, divisores y cierre; **`.ph-badge`** en cada `.imgbox`.
   - **`.tutor` SOLO** en `intro` y `outro` (y solo si `hasAvatar`).
   - Número de sección gigante en cada divisor.
   - **Densidad:** ~1 slide por idea del guion (este PDF → ~17–19 slides). No amontonar.
6. **Reglas de contenido:** texto **literal** del PDF (no inventar cifras), conciso, mismo idioma;
   devolver **solo** el HTML interno del `<section>` + `slideClass` (sin la etiqueta `<section>`).
7. **Reglas de imágenes:** `data-img="<id>"` respetando orientación (manifiesto); estructura
   `.imgbox > <img data-img="…"> + .ph-badge`; sin imágenes → degradados.

`generateSlides(...)`: igual que ahora (`messages.stream`, `thinking:{type:'adaptive'}`,
`output_config:{ effort:'high', format: zodOutputFormat(SlidesSchema) }`, `cache_control` en el
system, manejo de `stop_reason`). Subir `max_tokens` si hace falta para ~19 slides densas.

**Verificación (consume tokens):** script temporal con `.env`, el PDF de `awk-video-test`, las
imágenes de su carpeta `images/`, `avatar.jpg` y `loadTheme('timely-ai')` → render con `slides.ts`
→ abrir el HTML **junto a la demo** y comparar slide a slide.

---

## Fase R6 — Renderer de slots (`services/slides.ts`)

**Objetivo:** rellenar los slots del vocabulario nuevo.

Pasos:
1. **Avatar/tutor:** el modelo emite la estructura `.tutor` con un `<img … data-avatar>` interno.
   El renderer fija el `src` de ese `<img>` (regex actual ya sirve). Sin avatar, `hasAvatar=false`
   hace que el prompt no emita `.tutor` (no quedan anillos huérfanos).
2. **Imágenes:** soportar `data-img` tanto en `<img>` (fijar `src`) como en un `div` (inyectar
   `background-image`). Estructura preferida `.imgbox > <img data-img>`. Id desconocido → se deja
   el degradado del `.imgbox`/`.media` (fallback, nunca se rompe).
3. Envolver cada slide en `<section class="slide {slideClass}">{html}{notes}</section>` (igual) y
   pasar a `renderDeck`.

**Verificación:** fixture `Slides` (1 cover, 1 contenido con brandbar+cards+ico, 1 divisor, 1 intro
con tutor) + tema + 1–2 imágenes + avatar → abrir: imágenes y tutor incrustados, fallback OK.

---

## Fase R7 — Endpoint y UI (ajuste menor)

`POST /api/generate` y la UI **no cambian de contrato** (PDF + images[] + avatar + references[] +
theme). Revisar solo que `max_tokens`/tiempos aguanten ~19 slides y que la vista previa en
`<iframe>` muestre bien el chrome nuevo (overlays fijos). README al final.

**Verificación E2E:** `http://localhost:3000` → subir el PDF + imágenes + avatar de `awk-video-test`,
tema `timely-ai`, generar → navegar el deck en el iframe → descargar `.html` → **comparar con la
demo**.

---

## Orden de ejecución sugerido

Fase 0 ✅ → 1 ✅ → **R2 → R3 → R4 → R5 → R6 → R7**. R2/R4/R6 se validan con fixtures sin gastar API;
R3 (`--from-images`) y R5 consumen tokens.

**Criterio de "hecho":** abrir la salida de la app **al lado** de
`presentacion-growth-revops.html` y que un revisor no las distinga en estilo: misma paleta y
tipografía, brandbar, tarjetas con iconos y números, tutor animado, divisores con número gigante,
funnel/flujos, y el mismo chrome (progreso degradado + nav cristal + puntos que se alargan).

---

## Notas / pendientes

- Posible futuro: crear/refinar temas desde el frontend; aviso de PDF demasiado grande; modo
  presentador (las `notes` ya viajan ocultas); salida con `images/` relativas + ZIP como el
  entregable original (hoy fuera de alcance).
- La demo usa **Inter** (no Plus Jakarta Sans): corregir la tipografía del tema al portarlo.
