# PLAN-MOTION.md — Capa SVG de movimiento por tema

> **Quinto plan.** Complementa a [PLAN.md](PLAN.md) (generación), [PLAN-VOZ.md](PLAN-VOZ.md)
> (voz/subtítulos), [PLAN-EDITOR.md](PLAN-EDITOR.md) (editor visual) y
> [PLAN-HEYGEN.md](PLAN-HEYGEN.md) (avatar en vídeo). Convierte la decoración animada que hoy
> está **hardcodeada e idéntica para todos los temas** (`#flow` + `#decor-fg` en
> [deck.ts](src/templates/deck.ts)) en una **capa SVG propia de cada tema** —con SVG libre
> saneado o con presets del catálogo—, le da una **transición de slide propia** y una **cortina
> que reacciona a la dirección de navegación**. Escrito para implementarse tarea a tarea (M1 → M9).

---

## 0. Cómo usar este documento

- Implementa en el orden **M1 → M9**. Cada tarea tiene: *objetivo, archivos, contrato, criterio
  de aceptación*.
- Tras cada tarea que toque `src/`: `npm run typecheck` debe pasar.
- Verificación (§9) con la skill `verify` (Chromium headless, **sin gastar Claude/ElevenLabs**):
  todo esto se prueba con temas y slides fixture. Solo M9 llama a la API.
- **No** rompas los invariantes de §2. Si algo obliga a hacerlo, para y anótalo.

### Decisiones tomadas

| Tema | Decisión | Alternativa descartada |
|------|----------|------------------------|
| **Quién escribe el SVG** | **El tema puede traer SVG libre** en `motion.svg`, que pasa por un **sanitizador allowlist** antes de tocar el HTML. Cada tema puede tener una firma visual única, no una de seis. | Solo presets con nombre (más seguro, cero variedad). El catálogo **sigue existiendo** para los temas que no quieran escribir SVG. |
| **Cómo se anima el SVG libre** | **Vocabulario de clases `mo-*`** (§4.2): el autor marca nodos (`.mo-draw`, `.mo-pop`, `.mo-spin`…) y el intérprete de confianza del deck sabe qué hacer con cada uno en el cambio de slide. | Que el tema declarase la coreografía paso a paso — sería reinventar `data-anim` con más superficie. |
| **Motor** | **CSS keyframes** para el movimiento ambiente + **GSAP core** (ya cargado) para la reacción a la transición. Si el CDN de GSAP cae, la capa sigue viva. | Todo GSAP (hoy: sin CDN la decoración se queda muerta entera). SMIL (`<animate>`) descartado: mal control de `reduced-motion` y difícil de sincronizar con la navegación. |
| **Transición entre slides** | **Cortina SVG por encima** (reacciona a la dirección) **+ transición de slide elegible por tema** (`push`/`fade`/`scale`/`rise`), como clase en `<body>`. | Wipe real con `clipPath` sobre el contenido: más vistoso, mucho más frágil y caro de pintar. |
| **Ámbito** | **Solo por tema.** Una firma coherente decidida una vez, en el JSON. | Selector de intensidad en la UI y override por slide (`data-motion`): descartados, no hay palanca por deck. |
| **Color** | Siempre por **token del tema** (`--primary`, `--primary-300`…) o `currentColor`; el sanitizador **no** prohíbe hex, pero el catálogo y el prompt usan tokens → cualquier firma encaja con cualquier paleta. | — |

### Fuera de alcance

Animación por slide (`anim` ya cubre la entrada del contenido); vídeo o canvas de fondo; plugins
de GSAP (DrawSVG/MorphSVG son de pago); lottie/three; transiciones 3D; editar la capa desde el
editor visual; control de movimiento desde la UI del generador.

---

## 1. Objetivo

**Hoy** todos los decks —Atelier editorial, Aurora Noir oscuro, Meridian suizo— llevan
literalmente la misma decoración: dos filetes horizontales, cuatro brackets de esquina, cuatro
destellos, tres orbes borrosos y un barrido diagonal
([deck.ts:793-812](src/templates/deck.ts#L793-L812)). Va bien, pero no distingue temas y la
transición entre slides se percibe plana: el contenido entra en cascada y poco más.

**Con este plan** cada tema declara su capa, con SVG propio o con un preset del catálogo:

```jsonc
// themes/aurora-noir.json — firma propia
"motion": {
  "svg": "<svg viewBox=\"0 0 1280 720\" preserveAspectRatio=\"none\">…<path class=\"mo-ribbon mo-shift\" d=\"…\"/>…</svg>",
  "transition": "wipe",
  "slideTransition": "fade",
  "intensity": 0.7,
  "speed": 1,
  "flow": true
}

// themes/meridian.json — del catálogo
"motion": { "overlay": "grid", "transition": "sweep", "slideTransition": "push", "intensity": 0.4 }
```

El deck monta, **por encima de las slides**, esa capa: (a) se mueve sola de forma sutil entre
transiciones (CSS del tema) y (b) **reacciona a cada cambio de slide** en la dirección de la
navegación, según las clases `mo-*` que lleven sus nodos.

```
tema (JSON)                                    carga                        render                      runtime
──────────                                     ─────                        ──────                      ───────
motion.svg  (SVG libre)          → themes.ts: sanitizeMotionSvg()  →  #mo (markup inline)      →  intérprete: onChange(dir)
motion.overlay (preset)          → motion.ts: OVERLAYS[name]       →  #mo (markup del repo)       según clases mo-*
motion.transition                → motion.ts: TRANSITIONS[name]    →  #mo-tx (cortina)         →  cortina en el eje de dir
motion.slideTransition           → deck.ts: body class="tx-fade"   →  reglas .slide            →  transición CSS
motion.intensity / speed         → window.__DECK_MOTION__          →  --mo-i / --mo-speed      →  ambiente CSS + tweens
```

---

## 2. Invariantes (no romper)

1. **Ningún SVG de tema llega al HTML sin pasar por el sanitizador.** Es el límite de seguridad
   de este plan: `<script>`, `on*`, `foreignObject`, `<image>`, `href` externos y `<style>` se
   descartan siempre. El sanitizador es **fail-closed**: si el resultado no es un `<svg>` válido,
   se cae al preset `frame` y se registra un warning.
2. **El deck sigue sin ejecutar código del LLM.** El tema aporta *markup declarativo* y *números
   clampados*; las rutinas de animación viven en el repo y se enganchan por vocabulario de clases.
3. **Deck sin `motion` declarado = HTML byte-idéntico al actual.** Es un test, no una intención
   (§9.2). Los 5 temas del repo declaran su firma en M7, no antes.
4. **La revisión visual no ve la capa.** `renderSlideStandalone`
   ([deck.ts:819](src/templates/deck.ts#L819)) sigue emitiendo solo la slide, sin `#flow`,
   `#decor-fg` ni `#mo`. Si la capa entrara en la captura, el revisor de
   [review.ts](src/services/review.ts) la leería como "imagen teñida" o "solape" y reescribiría
   slides sanas.
5. **Nunca tapa el contenido.** `pointer-events: none`, `aria-hidden="true"`, opacidad efectiva
   ≤ 0,18 sobre fotos y ≤ 0,22 en el pico de la cortina.
6. **`prefers-reduced-motion: reduce` congela todo**: sin ambiente, sin cortina, sin viaje de
   orbes, sin desplazamiento entre slides. La guarda va en `BASE_CSS` y cubre también el CSS que
   escriba el tema (§M1).
7. **Sin GSAP el deck sigue funcionando**: transición CSS y ambiente CSS no dependen del CDN; solo
   se pierde la reacción a la transición.
8. **Autocontenido**: nada de SVG externo, fuentes ni sprites remotos; todo inline en el HTML.
9. **El editor visual no la toca**: la capa vive fuera de los `<section>`, así que el guardado
   por-slide (`PUT /api/deck/:id/slides`) sigue viendo lo mismo que hoy.

---

## 3. Estado actual (lo que ya existe y se reaprovecha)

| Pieza | Dónde | Qué hace |
|---|---|---|
| `#flow` (3 orbes) | [deck.ts:86-90](src/templates/deck.ts#L86-L90), [793](src/templates/deck.ts#L793) | Glows persistentes que **viajan** a una posición determinista por índice de slide (`flowPos(i)`) → continuidad entre slides. Se conserva como flag `flow`. |
| `#decor-fg` | [deck.ts:96-114](src/templates/deck.ts#L96-L114), [801](src/templates/deck.ts#L801) | Filetes + brackets + destellos + barrido. Se convierte en el preset `frame` y la cortina `sweep`. |
| `animateAccents()` | [deck.ts:482-499](src/templates/deck.ts#L482-L499) | Re-trazado por `stroke-dasharray`, pop de destellos, barrido. Es el esqueleto del futuro `onChange(dir)` — y de hecho ya usa dos de las cinco reacciones del vocabulario. |
| `animateFlow()` | [deck.ts:504-511](src/templates/deck.ts#L504-L511) | Viaje de orbes con `overwrite:'auto'`. Se mantiene. |
| Intérprete `data-anim` | [deck.ts:402-476](src/templates/deck.ts#L402-L476) | Patrón a imitar: allowlist + `clampNum` + fallo silencioso por paso. |
| Transición de slide | [deck.ts:55-79](src/templates/deck.ts#L55-L79) | Push horizontal en tres reglas (`.slide`, `.active`, `.prev`) + bloque `reduced-motion`. Es la base sobre la que M6 añade variantes. |
| `render()` | [deck.ts:513-527](src/templates/deck.ts#L513-L527) | Punto único donde engancha `onChange`. **Le falta la dirección**: hoy `go(i)` no informa de si se avanza o se retrocede. |

---

## 4. Arquitectura

### 4.1 Archivos

```
slider-generator/
  src/
    templates/motion.ts        # NUEVO: catálogo de presets (CSS + markup + cortinas) y tipos
    services/sanitize-svg.ts   # NUEVO: allowlist + namespacing de ids; único camino del SVG de tema
    templates/deck.ts          # CAMBIA: renderDeck acepta `motion`; emite capa + cortina + body class;
                               #         DECK_JS gana el intérprete (ambient/onChange/dirección)
    config/theme-schema.ts     # CAMBIA: ThemeSchema.motion (svg | overlay, enums, números clampados)
    services/themes.ts         # CAMBIA: sanea `motion.svg` al cargar el tema (loadTheme/listThemes)
    services/slides.ts         # CAMBIA: renderSlides pasa theme.motion → renderDeck
    services/theme-builder.ts  # CAMBIA (M9): el prompt pide la firma de movimiento
  themes/*.json                # CAMBIA (M7): cada tema declara su `motion`
  package.json                 # CAMBIA (M2): + sanitize-html, + @types/sanitize-html
  README.md / LEEME.md         # CAMBIA: sección "Movimiento por tema" (catálogo + vocabulario mo-*)
```

Tipos centrales, en `motion.ts`:

```ts
export const OVERLAY_NAMES     = ['none','frame','grid','aurora','constellation','arcs','wave'] as const
export const TRANSITION_NAMES  = ['none','sweep','wipe','iris','stripes'] as const
export const SLIDE_TX_NAMES    = ['push','fade','scale','rise'] as const

export interface MotionPreset { css: string; html: string }

/** Config ya resuelta y clampada que viaja al runtime como DATOS. */
export interface ResolvedMotion {
  overlay: OverlayName          // 'custom' cuando el tema trae svg propio
  transition: TransitionName
  slideTransition: SlideTxName
  intensity: number             // 0..1   → opacidad/amplitud global (--mo-i)
  speed: number                 // 0.5..2 → multiplicador de duración (--mo-speed)
  flow: boolean                 // orbes persistentes
}

export const OVERLAYS:    Record<OverlayName, MotionPreset>
export const TRANSITIONS: Record<TransitionName, MotionPreset>
export const SLIDE_TX_CSS: Record<SlideTxName, string>
export function resolveMotion(m?: ThemeMotion): ResolvedMotion   // defaults + clamps
```

Contrato de runtime (mismo patrón que `__DECK_AUDIO__`, [slides.ts:176](src/services/slides.ts#L176)):

```html
<script>window.__DECK_MOTION__={"overlay":"custom","transition":"wipe","intensity":0.7,"speed":1,"flow":true};</script>
```

El SVG **no** viaja en ese JSON: va inline en el markup de `#mo`, ya saneado.

### 4.2 Vocabulario `mo-*` — el contrato entre el SVG del tema y el deck

El intérprete no puede conocer la estructura de un SVG libre, así que **el autor marca los nodos**
y el deck sabe qué hacer con cada marca en cada cambio de slide. Es la pieza clave del diseño: los
presets del repo se escriben con este mismo vocabulario, así que hay **una sola rutina** para
todos.

| Clase | Reacción en cada cambio de slide (`dir` = +1 avanzar / −1 retroceder) |
|---|---|
| `.mo-draw` | Re-trazado: `stroke-dasharray = getTotalLength()`, offset `len → 0` (0,9 s · speed). Para filetes, brackets, conectores, arcos. |
| `.mo-pop` | `scale 0,55 → 1` con `back.out(2)`, stagger 0,06. Para puntos, destellos, nodos. |
| `.mo-shift` | Salto de fase: `x += 120 · dir` con `power2.inOut`. Para cintas, bandas, ondas. |
| `.mo-spin` | `rotation += 18° · dir` con `back.out(1.4)`, origen en el centro del bbox. Para arcos y anillos. |
| `.mo-fade` | Pulso de opacidad (×1,6 y vuelta, 0,6 s). Para rejillas y tramas. |
| `.mo-scan` | Cruza el escenario en el eje de `dir` (`x: −10% → 110%`, o al revés). Para líneas de escaneo. |

Reglas para el SVG del tema:

- Todo `id` y toda `class` llevan prefijo **`mo-`**. El sanitizador **renombra los ids** que no lo
  lleven (y reescribe sus `url(#…)` / `href="#…"`), y **descarta las clases** sin prefijo. Motivo:
  las slides traen SVG escrito por Claude; un `id="grid"` duplicado rompe un `<pattern>` o un
  `<clipPath>` en silencio.
- El **ambiente** (deriva, respiración, rotación lenta) se escribe en `theme.css` con selectores
  `#mo .mo-…` y `@keyframes` propios. No hay campo `motion.css`: el tema ya trae CSS libre.
- Las custom properties `--mo-i` (intensidad) y `--mo-speed` están disponibles en `#stage`:
  `opacity: calc(var(--mo-i) * .18)`, `animation-duration: calc(18s * var(--mo-speed))`.

---

## 5. Tareas

### M1 — `src/templates/motion.ts`: registro + migración sin cambio visual

**Objetivo:** sacar la decoración actual de `deck.ts` a un registro de presets y fijar el
vocabulario, sin que el deck generado cambie ni un byte.

**Contrato:**
- `OVERLAYS.frame` = el CSS (`#decor-fg …`, [deck.ts:96-108](src/templates/deck.ts#L96-L108)) y el
  markup ([deck.ts:801-812](src/templates/deck.ts#L801-L812)) actuales, **reescritos con el
  vocabulario**: `.fg-line`/`.fg-bracket` → `+ .mo-draw`, `.glint` → `+ .mo-pop`. El resultado
  visual es el mismo; lo que cambia es quién dispara la animación.
- `TRANSITIONS.sweep` = `.sweep` ([deck.ts:110-114](src/templates/deck.ts#L110-L114)) + su `<div>`.
- `OVERLAYS.none` / `TRANSITIONS.none` = `{ css: '', html: '' }`.
- `#flow` sigue en `deck.ts` como pieza propia, gobernada por el flag `flow`.
- En `BASE_CSS`, guarda global que cubre también el CSS que escriba el tema:
  ```css
  @media (prefers-reduced-motion: reduce) {
    #mo *, #mo-tx *, #flow * { animation: none !important; transition: none !important; }
  }
  ```
- `resolveMotion(undefined)` → `{ overlay:'frame', transition:'sweep', slideTransition:'push', intensity:0.6, speed:1, flow:true }`.

**Aceptación:** `npm run typecheck`; `motion.ts` no importa nada de `deck.ts` (dependencia en un
solo sentido).

---

### M2 — `src/services/sanitize-svg.ts`: el límite de seguridad

**Objetivo:** que ningún SVG de tema pueda ejecutar nada ni salir a la red, y que no colisione con
el SVG de las slides.

**Dependencia:** `sanitize-html` (+ `@types/sanitize-html`). Es la única dependencia nueva del
plan: parser propio (htmlparser2), sin DOM, mantenido. Alternativa sin dependencia: tokenizador
allowlist a mano (~150 líneas) — más código sensible que auditar; se descarta salvo que se quiera
mantener `dependencies` intacto.

> **Gotcha obligatorio:** SVG es *case-sensitive* (`viewBox`, `patternUnits`, `stdDeviation`,
> `gradientTransform`). Hay que pasar `parser: { lowerCaseTags: false, lowerCaseAttributeNames: false }`.
> Sin eso, `viewBox` se convierte en `viewbox` y **todo el SVG se rompe en silencio**.

**Contrato:**

```ts
export interface SanitizeResult { svg: string; warnings: string[] }
/** Devuelve '' si el resultado no es utilizable (fail-closed → el llamador cae al preset). */
export function sanitizeMotionSvg(raw: string, opts?: { maxBytes?: number; maxNodes?: number }): SanitizeResult
```

- **Etiquetas permitidas:** `svg g defs path circle ellipse rect line polyline polygon pattern
  linearGradient radialGradient stop mask clipPath symbol use filter feGaussianBlur feOffset
  feBlend feColorMatrix feFlood feComposite feMerge feMergeNode`.
- **Prohibidas siempre:** `script style foreignObject image text animate animateTransform set
  iframe a` (y cualquier otra fuera de la lista).
- **Atributos permitidos:** geometría y presentación (`d cx cy r rx ry x y x1 y1 x2 y2 points
  width height viewBox preserveAspectRatio transform transform-origin fill fill-opacity fill-rule
  stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray
  stroke-dashoffset opacity filter mask clip-path clipPathUnits offset stop-color stop-opacity
  gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits patternTransform
  stdDeviation in in2 result mode type values operator dx dy flood-color flood-opacity
  mix-blend-mode class id`).
- **Prohibidos siempre:** todo `on*`, `style`, `xlink:href`; `href` solo si empieza por `#`.
- **Namespacing:** ids sin prefijo `mo-` se renombran a `mo-<id>` y se reescriben sus referencias
  (`url(#x)` en atributos y `href="#x"`). Clases sin prefijo `mo-` se descartan del atributo.
- **Topes:** `maxBytes` 16 KB, `maxNodes` 60. Excederlos → `''` + warning (fail-closed).
- **Salida vacía** si tras sanear no hay un `<svg …>` raíz.

**Aceptación:** batería de casos en un script fixture (no hace falta framework de test; basta un
`.mts` en el scratchpad, como hace la skill `verify`):
`<script>` inline y anidado, `onload=` / `onclick=`, `xlink:href="http://…"`, `href="//evil"`,
`<image href="data:…">`, `<foreignObject><iframe>`, `<use href="#x">` con `x` sin prefijo,
`style="background:url(http://…)"`, `viewBox` preservado con su capitalización, entidades
(`&lt;script&gt;`), comentarios `<!-- -->`, SVG de 20 KB, SVG con 200 nodos.
**Ninguno** debe producir salida con `script`, `on…=`, `href` no-fragmento ni `foreignObject`.

---

### M3 — Contrato de datos: `ThemeSchema.motion` → carga saneada → `__DECK_MOTION__`

**Objetivo:** que el tema declare su capa y que llegue al render ya validada y saneada.

**Contrato:**
- [theme-schema.ts](src/config/theme-schema.ts):
  ```ts
  motion: z.object({
    // Firma propia: SVG libre. Prevalece sobre `overlay` si ambos vienen.
    svg:             z.string().max(16384).optional(),
    overlay:         z.enum(OVERLAY_NAMES).optional(),
    transition:      z.enum(TRANSITION_NAMES).optional(),
    slideTransition: z.enum(SLIDE_TX_NAMES).optional(),
    intensity:       z.number().min(0).max(1).optional(),
    speed:           z.number().min(0.5).max(2).optional(),
    flow:            z.boolean().optional(),
  }).optional()
  ```
  Los enums vienen de `motion.ts` (fuente única; mismo criterio que `ANIM_EFFECTS` en
  [schema.ts:65](src/config/schema.ts#L65)).
- [themes.ts](src/services/themes.ts): tras `ThemeSchema.parse`, si hay `motion.svg` se pasa por
  `sanitizeMotionSvg`. Warnings → `console.warn('[motion] tema X: …')`. Resultado vacío →
  `motion.svg` se borra y el tema cae a `overlay` (o al default `frame`). **Este es el único
  camino por el que un tema llega al render** (`loadTheme` y `listThemes`), así que basta con
  hacerlo aquí.
- `renderDeck({ …, motion })` en [deck.ts:849](src/templates/deck.ts#L849):
  1. CSS: `SLIDE_TX_CSS[slideTransition]` + `OVERLAYS[o].css` + `TRANSITIONS[t].css` tras el CSS
     del tema (solo el elegido: nada de emitir los 7 presets).
  2. Markup: `<div id="mo" aria-hidden="true">…</div>` (SVG saneado o del preset) y
     `<div id="mo-tx" aria-hidden="true">…</div>` dentro de `#stage`, después de las slides.
  3. `<body class="tx-fade">` según `slideTransition`.
  4. `<script>window.__DECK_MOTION__=…</script>` antes de `DECK_JS`.
- `renderSlides` pasa `theme.motion` ([slides.ts:163](src/services/slides.ts#L163)).
- `renderSlideStandalone` **no cambia** (invariante §2.4).

**Aceptación:** tema sin `motion` → HTML **idéntico** al de `master` para el mismo input (test de
§9.2). Tema con `motion.svg` malicioso → el HTML no contiene nada del payload y sí el preset de
respaldo.

---

### M4 — Intérprete de movimiento en `DECK_JS`

**Objetivo:** una sola rutina, dirigida por el vocabulario `mo-*`, con dirección de navegación y
degradación limpia.

**Contrato:**
- Leer y clampar (reutilizando el `clampNum` que ya existe,
  [deck.ts:419](src/templates/deck.ts#L419)):
  ```js
  var M = window.__DECK_MOTION__ || {};
  var mI = clampNum(M.intensity, 0, 1, 0.6), mS = clampNum(M.speed, 0.5, 2, 1);
  stage.style.setProperty('--mo-i', mI); stage.style.setProperty('--mo-speed', mS);
  ```
- **Dirección**: `go(i)` calcula `dir = i > cur ? 1 : i < cur ? -1 : 0` y lo pasa a `render(dir)`.
  Es el único cambio en la navegación existente; `go(cur)` → `dir = 0` → la cortina no se dispara.
- **Reacción por vocabulario**: una función por clase (`moDraw`, `moPop`, `moShift`, `moSpin`,
  `moFade`, `moScan`), cada una sobre `#mo .mo-xxx` (cachear los `querySelectorAll` una vez al
  arrancar, no en cada transición). Las duraciones se multiplican por `mS`.
  `animateAccents()` desaparece: su cuerpo **es** `moDraw` + `moPop`.
- **Cortina**: `MOTION_TX[M.transition](dir)`, con guarda `typeof fn === 'function'`.
- **Ambiente**: nada en JS. Vive en el CSS del preset o del tema (decisión §0). En GSAP queda solo
  la reacción y el viaje de orbes (`animateFlow`, sin cambios).
- `prefers-reduced-motion`: el CSS ya lo apaga (§M1) y `motionOK` impide disparar la reacción.

**Aceptación:** con `verify`, en un deck fixture: avanzar dispara reacción y cortina en un sentido,
retroceder en el contrario; sin GSAP (CDN bloqueado) el ambiente CSS sigue animando y no hay
errores en consola; con `emulateMedia({ reducedMotion: 'reduce' })`, 200 ms después de cambiar de
slide no hay ninguna animación en curso.

---

### M5 — Catálogo de presets (para temas que no escriben SVG)

**Objetivo:** los 6 overlays y las 4 cortinas, todos escritos con el vocabulario de M4.

**Presupuesto por preset (obligatorio):** ≤ 24 nodos animados, ≤ 2 capas con `filter: blur()`,
tweens solo de `transform`/`opacity`/`stroke-dashoffset` (nada de `width`, `top` ni `box-shadow`),
`will-change` solo en los nodos que se mueven de verdad.

#### Overlays

| Preset | Markup (resumen) | Ambiente (CSS) | Marcas de reacción | Encaja con |
|---|---|---|---|---|
| **`frame`** *(default)* | 2 filetes + 4 brackets + 4 glints | respiración de opacidad de los glints (2,2 s) | `.mo-draw` en filetes/brackets, `.mo-pop` en glints | cualquiera |
| **`grid`** | `<pattern>` 80×80 + `rect` de escaneo | pulso de opacidad muy lento (12 s) | `.mo-fade` en la rejilla, `.mo-scan` en la línea | Meridian, Timely AI |
| **`aurora`** | 3 `path` curvos anchos, `blur(48px)`, `mix-blend-mode: screen` | deriva horizontal lenta y desfasada (18–26 s) | `.mo-shift` | Aurora Noir (solo fondos oscuros) |
| **`constellation`** | 12 `circle` + 14 `line` entre vecinos | deriva vertical mínima (14 s) | `.mo-draw` en las líneas, `.mo-pop` en los puntos | Aurora Noir, Timely AI |
| **`arcs`** | 3 arcos concéntricos (`circle` con dasharray parcial) | rotación continua lenta y alterna (30–45 s) | `.mo-spin` + `.mo-draw` | Atelier, Solstice |
| **`wave`** | 1–2 `path` de onda en el borde inferior | desplazamiento horizontal en bucle (20 s) | `.mo-shift` | Solstice |
| **`none`** | — | — | — | temas que quieran quietud |

Detalle de `grid` (patrón del resto, y plantilla para escribir un `motion.svg` propio):

```html
<div id="mo" aria-hidden="true">
  <svg viewBox="0 0 1280 720" preserveAspectRatio="none">
    <defs>
      <pattern id="mo-grid-p" width="80" height="80" patternUnits="userSpaceOnUse">
        <path d="M80 0H0V80" fill="none" stroke="currentColor" stroke-width="1"/>
      </pattern>
    </defs>
    <rect class="mo-grid-fill mo-fade" width="1280" height="720" fill="url(#mo-grid-p)"/>
    <rect class="mo-scan" width="1280" height="2"/>
  </svg>
</div>
```

```css
#mo { position:absolute; inset:0; z-index:3; pointer-events:none; overflow:hidden;
      color: var(--primary-300, #19F7F1); }          /* currentColor = token del tema */
#mo svg { position:absolute; inset:0; width:100%; height:100%; }
.mo-grid-fill { opacity: calc(var(--mo-i, .6) * .18);
                animation: mo-breathe calc(12s * var(--mo-speed, 1)) ease-in-out infinite; }
.mo-scan     { fill: currentColor; opacity: 0; }      /* la mueve el intérprete en onChange */
@keyframes mo-breathe { 0%,100% { opacity: calc(var(--mo-i,.6) * .12); }
                        50%     { opacity: calc(var(--mo-i,.6) * .22); } }
```

#### Cortinas (`#mo-tx`, `z-index: 4`, solo durante la transición)

| Preset | Qué hace | Duración |
|---|---|---|
| **`sweep`** *(default, actual)* | barrido diagonal de luz que cruza una vez | 1,05 s |
| **`wipe`** | banda de `var(--grad)` con `skewX(-12deg)` que cruza **en el sentido de `dir`** | 0,55 s |
| **`iris`** | anillo SVG que se expande desde el centro (`r` 0→900, `stroke-width` 40→0) | 0,7 s |
| **`stripes`** | 6 barras verticales que entran escalonadas (0,04 s) y salen por el lado contrario | 0,6 s |
| **`none`** | — | — |

**Aceptación:** capturas de `verify` a t=0 / +250 ms / +700 ms tras avanzar, para cada combo
overlay×cortina: nada tapa el texto, cero errores de consola, y la sonda de fps (§9.4) ≥ 50 fps
en el combo más caro (`aurora` + `wipe`).

---

### M6 — Transición de slide por tema

**Objetivo:** que el cambio de slide en sí, no solo la cortina, distinga a los temas.

**Contrato:**
- `SLIDE_TX_CSS` en `motion.ts`, una entrada por variante. Cada una redefine **las mismas tres
  reglas** que ya existen ([deck.ts:55-79](src/templates/deck.ts#L55-L79)), bajo `body.tx-*`:

  | Variante | `.slide` (por delante) | `.slide.active` | `.slide.prev` (por detrás) |
  |---|---|---|---|
  | `push` *(actual, default)* | `translateX(70px)` | `translateX(0)` | `translateX(-70px)` |
  | `fade` | sin transform, `opacity .5s` | opacidad 1 | sin transform |
  | `scale` | `scale(1.04)` | `scale(1)` | `scale(.97)` |
  | `rise` | `translateY(48px)` | `translateY(0)` | `translateY(-48px)` |

- **Cuidado con la especificidad**: el bloque `prefers-reduced-motion` actual
  ([deck.ts:77-79](src/templates/deck.ts#L77-L79)) usa `.slide, .slide.active, .slide.prev`, que
  **pierde** frente a `body.tx-scale .slide`. Hay que subirlo a `body[class] .slide, …` (o añadir
  `!important`) y verificarlo variante por variante — es el fallo más probable de esta tarea.
- **No** se toca el JS de navegación: `render()` sigue alternando las clases `active`/`prev`.
- La duración se mantiene en el rango actual (0,45–0,62 s) para no desincronizar la cortina.

**Aceptación:** las 4 variantes navegan adelante y atrás sin saltos ni slides visibles a medias;
con `reducedMotion: 'reduce'` ninguna desplaza nada (solo fundido); `verify` captura las 4.

---

### M7 — Asignación por tema

**Objetivo:** que cada tema del repo tenga una firma coherente con su descripción, ejercitando
**los dos caminos** (SVG propio y preset).

| Tema | Firma | `transition` | `slideTransition` | `intensity` | Por qué |
|---|---|---|---|---|---|
| `aurora-noir` | **`svg` propio** (cintas aurora con `mix-blend-mode: screen`) | `wipe` | `fade` | 0.7 | fondo medianoche: el blend luce y no ensucia; es el tema que justifica el SVG libre |
| `timely-ai` | preset `constellation` | `stripes` | `push` | 0.45 | fondo blanco: sin blur grande y con intensidad baja |
| `meridian` | preset `grid` | `sweep` | `push` | 0.4 | suizo/técnico: rejilla fina y sobria |
| `solstice` | preset `wave` | `iris` | `scale` | 0.55 | cálido y redondeado |
| `atelier` | **`svg` propio** (filete y arco fino, casi quieto) | `none` | `rise` | 0.35 | editorial: un solo gesto; ejercita el camino libre en un tema claro |

Regla para temas claros (`palette.background` claro): sin `mix-blend-mode: screen` y con
`intensity ≤ 0.5` — sobre blanco los glows se ven sucios en vez de luminosos.

**Aceptación:** los 5 temas cargan (`ThemeSchema.parse` + sanitizado sin warnings), `verify`
genera un deck por tema y las capturas se revisan a ojo.

---

### M8 — Guardarraíles y regresiones

**Objetivo:** que la capa no rompa nada de lo que ya funciona.

**Checklist:**
- **Revisión visual** ([review.ts](src/services/review.ts)): la salida de `renderSingleSlide`
  **no** contiene `id="mo`, `id="flow"` ni `id="decor-fg"` (invariante §2.4).
- **Fotos**: sobre `.imgbox`/`.media`, opacidad efectiva de la capa ≤ 0,18; pico de cortina
  ≤ 0,22. `intensity` multiplica, nunca sobrepasa.
- **Editor** ([editor.js](public/editor.js)): entrar en modo edición no marca nodos de la capa
  (vive fuera de los `<section>`); si algún selector fuese global, excluir `#mo, #mo-tx, #flow`.
- **Avatar en vídeo**: comprobar que `wipe`/`iris` no tiñen la cara del `<video>` de HeyGen.
- **Chrome fixed** (`#nav`, `#progress`, `#captions`, `#audio-timer`, z-index 50+) va fuera de
  `#stage`: la capa (z-index 3–4 dentro de `#stage`) nunca lo tapa. Verificar con captura.
- **Peso**: la firma elegida añade ≤ 16 KB al HTML (tope del sanitizador); los presets, ≤ 4 KB.

**Aceptación:** checklist entera verde en `verify` + una pasada a ojo del deck de ejemplo.

---

### M9 — `theme-builder`: que Claude diseñe la firma

**Objetivo:** que al derivar un tema de imágenes de referencia, Claude también proponga su
movimiento — incluido SVG propio.

**Contrato:**
- El prompt de [theme-builder.ts](src/services/theme-builder.ts) gana una sección con: el
  vocabulario `mo-*` (§4.2), el catálogo de `transition`/`slideTransition`, el tope de 16 KB / 60
  nodos, la lista de etiquetas permitidas, la obligación del prefijo `mo-` y la orden de usar
  `currentColor`/tokens en vez de hex. Y una regla: **si no se te ocurre una firma clara, elige un
  preset del catálogo** en vez de improvisar SVG.
- El SVG que devuelva Claude pasa por el mismo `sanitizeMotionSvg` **al escribir el JSON** (en
  `scripts/build-theme.ts`), no solo al cargarlo: así el tema queda guardado ya limpio y los
  warnings se ven en consola en el momento de crearlo.
- Regla para fondos claros en el prompt: `intensity ≤ 0.5`, sin `mix-blend-mode: screen`.

**Aceptación:** `npx tsx scripts/build-theme.ts` sobre unas imágenes de prueba devuelve un tema con
`motion` válido que sobrevive al sanitizador y se ve razonable en el deck.
**Coste:** una llamada a Claude — hacerlo una sola vez, al final.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **El sanitizador se deja algo** (es ahora el límite de seguridad real) | Allowlist estricta (no blocklist), batería de vectores en M2, fail-closed, tope de tamaño/nodos. Ojo: **CSP no es red de seguridad aquí** — el deck ya lleva JS inline y un CDN, así que la política tendría que permitir `unsafe-inline`. |
| **`lowerCaseAttributeNames` de htmlparser2** rompe `viewBox`/`stdDeviation` en silencio | Documentado en M2 como gotcha + caso de prueba explícito que compara la capitalización |
| **Coste de render**: blur grandes sobre 1280×720 tiran los fps | Presupuesto por preset (M5), tope también para el SVG libre (60 nodos), sonda de fps (§9.4) |
| **Ruido visual**: la capa compite con el contenido | `intensity` por tema, tope duro de opacidad (M8), presets `none`/`arcs` para temas sobrios |
| **Colisión de `id`** con el SVG que escribe Claude en las slides | Namespacing automático en el sanitizador (M2) + prefijo `mo-` obligatorio en los presets |
| **Especificidad de `reduced-motion`** frente a `body.tx-*` | Señalado en M6 como el fallo más probable; verificación variante por variante (§9.5) |
| **Regresión en la revisión visual** (el revisor "arregla" slides por culpa de la decoración) | Invariante §2.4 + test explícito en M8 |
| **CDN de GSAP caído** | Ambiente en CSS (decisión §0): la capa sigue viva; solo se pierde la reacción |
| **Temas antiguos / editados a mano** | `motion` opcional + `resolveMotion` clampa; nombre desconocido → default; SVG inválido → preset |
| **`deck.ts` creciendo sin control** | El catálogo vive en `motion.ts` y solo se emite lo elegido |

---

## 7. Orden sugerido de implementación

```
M1 (registro)  →  M2 (sanitizador)  →  M3 (contrato de datos)  →  M4 (intérprete)
   └─ aquí ya se puede verificar que master y la rama generan el MISMO HTML sin `motion`

M5 (catálogo)  →  M6 (transición de slide)  →  M7 (asignación)  →  M8 (guardarraíles)  →  M9 (theme-builder)
                                                                                            └─ única tarea con coste de API
```

M2 va pronto a propósito: hasta que el sanitizador exista y esté probado, ningún `motion.svg`
debería llegar al HTML.

---

## 8. Notas de implementación sueltas

- El SVG saneado se inyecta **como markup**, no dentro de un `<script>`: no hay que escapar `</`
  como en `buildAudioScript` ([slides.ts:190](src/services/slides.ts#L190)).
- `getTotalLength()` solo existe en elementos con geometría (`path`, `line`, `polyline`,
  `polygon`, `circle`, `ellipse`, `rect`). `moDraw` debe comprobarlo antes de llamar, como ya hace
  `animDrawLine` ([deck.ts:424](src/templates/deck.ts#L424)).
- `mix-blend-mode: screen` sobre `#mo` fuerza una capa de composición nueva: úsalo solo cuando el
  preset lo pida, no por defecto.
- `#mo` va **dentro** de `#stage`, así que hereda el `scale()` de `fit()`
  ([deck.ts:548-555](src/templates/deck.ts#L548-L555)): el SVG se escribe siempre en coordenadas
  1280×720, sin pensar en el tamaño de la ventana.
- Los `querySelectorAll` del vocabulario se cachean al arrancar; en cada transición solo se lanzan
  tweens sobre los arrays ya resueltos.

---

## 9. Verificación

Todo con la skill `verify` (Chromium headless, sin gastar Claude/ElevenLabs).

1. **Typecheck**: `npm run typecheck` limpio tras cada tarea.
2. **No-regresión byte a byte** (tras M3): fixture que renderiza el mismo `Slides` + tema **sin**
   `motion` en `master` y en la rama → `diff` vacío.
3. **Sanitizador** (tras M2): la batería de vectores de M2, con aserciones sobre la salida.
4. **Por preset** (tras M5): deck fixture de 4 slides por cada combo overlay×cortina; clic en
   `#next`, capturas a **t=0 / +250 ms / +700 ms**, y vuelta con `#prev` para comprobar que la
   dirección se invierte. Consola sin errores. Sonda de fps con `requestAnimationFrame` durante
   1 s: ≥ 50 fps en el combo más caro.
5. **Transiciones de slide** (tras M6): las 4 variantes, ida y vuelta, con y sin
   `reducedMotion: 'reduce'`; comprobar que en modo reduce `getComputedStyle(slide).transform`
   es `none` en las cuatro.
6. **Sin GSAP**: `page.route('**/gsap*', r => r.abort())` → el deck navega, el ambiente CSS se
   mueve, no hay excepciones.
7. **Aislamiento de la revisión**: `renderSingleSlide` no contiene `id="mo`/`#flow`/`#decor-fg`.
8. **A ojo**: un deck ya generado y guardado, re-renderizado con cada tema (sin llamar a las APIs),
   para juzgar si la firma acompaña o estorba. Es el único criterio que no se automatiza.

---

## 10. Notas de ejecución (M1 → M9 implementados)

**Verificación**: 50/50 en la batería del sanitizador y 316/316 en Chromium headless (los 35
combos overlay×cortina, dirección invertida al retroceder, 61 fps en `aurora`+`wipe`, las 4
transiciones de slide con y sin `reduced-motion`, sin GSAP, aislamiento de la revisión,
guardarraíles de M8). Sin errores de consola en ningún caso.

### Desviaciones del plan, y por qué

- **§2.3 / §9.2 «HTML byte-idéntico» es imposible tal como está escrito**, y lo fuerza el
  propio plan: M1 manda reescribir la decoración con el vocabulario (`+ .mo-draw`, `+ .mo-pop`)
  y M3 renombrar `#decor-fg` → `#mo` + `#mo-tx`. Sustituido por un **diff revisado** entre el
  `renderDeck` de `master` y el de la rama sin `motion`: 307 líneas que son *solo* los cambios
  previstos (guarda de `reduced-motion`, CSS de `#decor-fg` → preset `frame`, `body.tx-push`,
  markup renombrado, `__DECK_MOTION__`, intérprete) y nada más. Las opacidades históricas se
  conservan exactas: filete `.30`, bracket `.42`, destello `.216`.
- **Clases de los presets renombradas** (`fg-line` → `mo-line`, `glint` → `mo-glint`…) en vez
  de solo añadir la marca, para cumplir el «prefijo `mo-` obligatorio en los presets» de §6.
  Mismo resultado visual.
- **Gotcha estructural que gobierna todos los presets**: una animación CSS gana a los estilos
  inline, así que si el ambiente CSS anima la misma propiedad (`transform`/`opacity`) del mismo
  nodo que lleva una clase `mo-*`, GSAP no se ve. El ambiente va en un `<g>` envoltorio y la
  marca en el nodo de dentro. Documentado en `motion.ts` y en el prompt de M9.
- **`.mo-shift`** usa una fase acotada y reversible (`sin(phase)`) en vez de `x += 120·dir`
  acumulado: acumulando, 15 slides en la misma dirección se llevan la cinta fuera del escenario.
- **`arcs`** lleva `.mo-draw` en un trazo aparte, no en los arcos: `moDraw` reescribe el
  `stroke-dasharray` y borraría el recorte parcial que les da forma de arco.
- **`aurora`** usa 3 capas con `blur()` (el presupuesto de M5 decía ≤ 2) porque la misma tabla
  pide 3 cintas desfasadas. Medido: 61 fps en el combo más caro, así que el presupuesto se
  relaja a cambio del gesto.
- **`.mo-fade`** pulsa ×1,35 en vez de ×1,6 para que el pico no pase del tope de 0,18.
- **`grid`**: la línea de escaneo es una barra vertical (2×720) que cruza en horizontal, no la
  barra horizontal del ejemplo de §5 — es lo que hace legible el eje `x: −10% → 110%` del
  vocabulario.
- **Opacidades**: los rellenos de ÁREA llevan `min()` para no pasar de 0,18 efectivo ni con
  `intensity: 1`; los trazos finos y los puntos conservan los valores históricos del deck
  (hasta 0,42). Es la lectura de §2.5 que no obliga a empeorar lo que ya se veía bien.
- **`meridian`** añade `#mo { color: var(--primary) }`: sobre gris hielo el token claro
  (`--primary-300`) desaparecía y la rejilla quedaba invisible (0,039 efectivo).
- **Documentación**: la sección «Movimiento por tema» va en `README.md`. `LEEME.md` no se toca:
  documenta un paquete de deck entregado, no el generador.

### Segunda pasada: densidad de la capa (13-08-2026)

Al mirar los cinco temas a ojo, la capa no se percibía. El diagnóstico, medido en Chromium:
no era la opacidad, era el **número de nodos que reaccionan**. `grid` y `wave` tenían 2,
`arcs` y la firma de `atelier` 4: el ambiente CSS tiene ciclos de 12-45 s (1-6 px/s, por
debajo del umbral de percepción), así que lo único que se ve de la capa es la reacción al
navegar — y con 2 nodos no hay reacción que ver.

- **Todos los presets subidos a 12-31 nodos marcados** (antes 2-22), combinando piezas
  grandes y quietas con muchas piezas pequeñas que entran escalonadas: `frame` 10→21,
  `grid` 2→15, `aurora` 3→12, `constellation` 22→31, `arcs` 4→13, `wave` 2→12. Las firmas
  propias, igual: `aurora-noir` 6→15, `atelier` 4→12. Las piezas históricas de `frame`
  (filetes, brackets, destellos) conservan coordenadas y opacidades exactas.
- **`moDraw` escalona el re-trazado** (paso de 0,05 s, repartido para que el último trazo no
  arranque más tarde de 0,45 s, e invertido al retroceder). Con 15 trazos marcados, lanzarlos
  en el mismo frame se lee como un parpadeo; en cascada se lee como un gesto. `moScan` gana
  el mismo escalonado, así que dos barras dejan rastro.
- **El presupuesto de ≤ 24 nodos de M5 se relaja a los presets con `filter`.**
  `constellation` va a 31 (`line` + `circle`, cero blur): medido, 60-61 fps en los 35 combos.
- **Única opacidad tocada**: los destellos de `aurora-noir` (0,175 → 0,35 efectivo). A 0,175
  un punto de 2,5 px sobre medianoche no se veía, y añadir nodos invisibles no arregla nada.
  Es la lectura de §2.5 que ya aplicaba §10: el tope de 0,18 protege de los rellenos de
  **área**, no de la tinta puntual. El resto de factores, intactos.
- **`npm run previews`** (`scripts/build-previews.ts`): un deck fixture por tema más un
  índice; imprime la cuenta de nodos marcados de cada uno. Existía una carpeta `previews/` de
  una sesión anterior, generada a mano y sin la capa; ahora se regenera con un comando.
  El fixture usa los COMPONENTES reales (`.brandbar`, `.card` con sus variantes, `.stat`,
  `.num-badge`, `.imgbox`, `.blob`) y los `slideClass` canónicos, en 6 slides que cubren los
  casos donde la capa se juzga: portada con degradado, agenda de tarjetas, cifras sobre mucho
  blanco, divisor oscuro, hueco de imagen y cierre a sangre. Con un titular suelto sobre fondo
  plano no se ve ni el problema ni la solución — de hecho es lo que retrasó el diagnóstico dos
  rondas. Los tamaños de `h1`/`h2`/`.stat` van inline porque los temas solo fijan familia,
  peso y color.
- **Verificación**: 132/132 en Chromium headless — los 35 combos overlay×cortina reaccionando
  al avanzar y al retroceder sin errores de consola, las 4 transiciones de slide congeladas
  con `reduced-motion`, sin GSAP (ambiente CSS vivo y navegación intacta), aislamiento de
  `renderSingleSlide` en los 5 temas y el sanitizador sin un warning con los SVG enriquecidos
  (`aurora-noir` 1816 B / 24 nodos, `atelier` 714 B / 13 nodos; topes 16 KB / 60).
- **Encontrado, NO tocado**: en el punto medio de la transición las dos slides están a media
  opacidad a la vez, así que asoma el fondo del `body` y en los temas claros se percibe un
  lavado gris de ~0,25 s. Es anterior a este plan (está en `master`, en las reglas de `.slide`
  de `BASE_CSS`) y no lo introduce la capa.

### Tercera pasada: presencia (13-08-2026)

Con 12-31 nodos marcados la capa seguía sin verse. Contar nodos era la métrica equivocada, y
el contraste por píxel también: medido, la tinta de la capa cambiaba el píxel entre 15 y
74/255 sobre el fondo —contraste de sobra— pero la **superficie** total que pintaba era del
**0,05 %** del escenario en `atelier` y del **0,08 %** en `timely-ai`, porque todo eran
filetes de 1 px y puntos de 3 px. En `meridian`, `aurora-noir` y `solstice` la superficie sí
era alta (3-10 %) pero concentrada en una sola pieza difusa —rejilla de 1 px cada 80 px,
cinta con `blur(46px)`— que se lee como fondo, no como decoración.

- **Kit de decoración compartido** (`DECOR_CSS` + `DECOR_HTML` en `motion.ts`): anillos de
  trazo 4-9 px centrados FUERA del lienzo en dos esquinas, una cuña, un zócalo, una pila de
  5 barras, 7 chips y 4 filetes anchos. 21 nodos marcados, todos con el vocabulario.
- **La zona segura real, corregida al verlo sobre contenido de verdad.** El primer intento
  puso chips y filetes en la franja superior suponiendo que el contenido empezaba en y 120.
  Falso: `.pad` es `64px 72px` (caja de contenido x 72-1208, y 64-656) y la `.brandbar` va en
  TODAS las slides de contenido en `top:30px; left:72px; right:72px` con **`z-index: 5`**, o
  sea por encima de `#mo` (z-index 3) — los chips quedaban detrás del logo y se leían como
  suciedad alrededor de la marca. El kit se reubica en los bordes izquierdo (`x ≤ 68`) y
  derecho (`x ≥ 1212`), la banda inferior (`y ≥ 660`) y las esquinas. Lección apuntada en el
  README y en el prompt de M9.
- **Definido una sola vez y emitido desde `renderMotionHtml`** para cualquier `overlay` que
  no sea `none`, incluidos los temas con SVG propio. Alternativa descartada: repetir la
  geometría en cada preset y en cada `motion.svg` de tema. `overlay: 'none'` sigue dando
  quietud absoluta (comprobado).
- **Color de la capa en temas claros: `var(--primary)`, no `--primary-300`.** Era la segunda
  mitad del problema: sobre papel o blanco, un tinte pálido a 0,3 de alfa no se distingue del
  fondo. `meridian` ya lo había parcheado en M7 por su cuenta; ahora lo hacen también
  `atelier`, `solstice` y `timely-ai`. Los temas oscuros conservan el tinte claro.
- **`intensity` al alza**: atelier 0.35→0.55, meridian 0.4→0.6, timely-ai 0.45→0.6,
  solstice 0.55→0.7, aurora-noir 0.7→0.8. Los rellenos de área no se ensucian porque sus
  factores están construidos para no pasar del tope ni con `intensity: 1`.
- **Ajuste fino, con la decoración ya visible**: el kit al 80 % de esos factores (anillos y
  chips .55→.44, barras .6→.48, filetes .5→.40, cuña .17→.135, zócalo .26→.21), la
  `intensity` un 10 % por debajo del pico (atelier 0.5, meridian 0.54, timely-ai 0.54,
  solstice 0.62, aurora-noir 0.72) y los destellos de `aurora-noir` de .5 a .42. Neto: la capa
  queda al ~73 % de su pico, que es donde se ve sin competir con el contenido.
- **Resultado medido**: tinta nítida del 0,05 % → **1,37 %** en atelier (27×) y del 0,08 % →
  **1,50 %** en timely-ai (19×), con 33-52 nodos marcados por tema.
- **La lección para quien escriba una firma** (y ya está en el prompt de M9 y en el README):
  lo que hace visible la decoración es la superficie, no el contraste. Trazos de 2,5-9 px y
  formas de 60-300 px; los detalles de 1 px valen como acompañamiento, nunca como el cuerpo.
- **Peso**: la capa pasa a 2,7 KB de CSS + 3,4 KB de markup ≈ 6 KB, por encima del «≤ 4 KB
  para los presets» de M8. El kit es geometría, y la geometría cuesta bytes; sigue muy por
  debajo del tope de 16 KB del SVG libre. El presupuesto se actualiza a 8 KB.
- **Verificación**: 132/132 otra vez (35 combos × ida y vuelta, `reduced-motion`, sin GSAP,
  aislamiento de la revisión, sanitizador) + 5/5 en las reglas de emisión del kit, 60-61 fps,
  y capturas en reposo de los 5 temas incluida la slide que hace de foto.

### Cuarta pasada: revisión visual y rediseño del kit (13-08-2026)

Con la decoración por fin visible, se veía *qué* era: cuadrados. Revisión de las 30 capturas
(5 temas × 6 slides) en Chromium, y el diagnóstico fue de vocabulario, no de cantidad.

**Lo que fallaba:**

1. **Siete `<rect>` con borde** en tres grupos. Un cuadrado alineado a los ejes ES el glifo
   universal de placeholder (imagen rota, casilla vacía), y tres idénticos apilados a
   intervalos iguales se leen como una lista de checkboxes.
2. **Cuadrados cortados por el borde** (x 1232, ancho 18): medio cuadrado se lee como bug de
   render. Un arco a medias se lee como arco; un cuadrado a medias, no.
3. **La pila de 5 barras** de abajo-derecha caía debajo del `#nav` y del chip de ayuda
   (`z-index: 50`, por encima de la capa): tinta invisible.
4. **El zócalo** (barra plana de 1280×14 al borde) se leía como UI —barra de progreso, pie— no
   como decoración.
5. **Cero jerarquía**: todo entre `.40` y `.48` de factor, repartido uniformemente por el
   perímetro. Un espolvoreo, no una composición.

**Rediseño.** La capa es un marco alrededor del contenido de otro, así que el lenguaje correcto
es el de la **producción gráfica**: arcos de esquina, velos de atmósfera, escala de ticks,
marcas de corte con hueco, cruces de registro, rombos y medidas con remate. Se lee al instante
como intencionado y nunca como placeholder. Con jerarquía explícita —arcos `.46`,
instrumentación `.38` con remate a hueso, velos `≤ .095`— y composición de **un foco** (esquina
superior derecha) más **un contrapeso** (inferior izquierda).

- Fuera: 7 chips cuadrados, 5 barras, zócalo, 4 filetes anchos.
- Dentro: 3.º arco en el cúmulo inferior izquierdo, 2.º velo, escala de ticks con ritmo
  largo/corto, 2 marcas de corte, 2 cruces de registro (círculo + cruz con hueco), 4 rombos,
  2 medidas con remate.
- Los 8 marcadores de `grid` pasan de `<rect>` a rombos: sobre una trama ortogonal un cuadrado
  relleno se pierde en la rejilla, girado 45° lee como marca.
- **Descartada una segunda escala de ticks** en el borde izquierdo: quedaba a 28 px del texto
  (que arranca en x 72) y apiñaba el titular. Dos escalas convierten el gesto en un patrón.

**Coste**: la tinta baja de 1,37 % a 1,11 % en atelier y de 1,50 % a 1,21 % en timely-ai —el
zócalo aportaba mucha superficie plana— pero lo que queda *se lee*, y era el problema.

**Verificación**: 132/132 + 5/5 del kit, 60-61 fps, consola limpia en los 5 previews, sin
desbordes reales y las 30 capturas revisadas a ojo una por una.

**Encontrado, NO tocado**: en las slides con degradado de marca a sangre (`closing`, y la
columna izquierda de `cover`), la capa pinta con `var(--primary)` sobre un fondo de la misma
familia de color, así que la decoración casi desaparece —muy visible en `solstice`, naranja
sobre naranja. Se deja así a propósito: son los momentos hero del deck, con degradado y blobs
propios, y la decoración ahí sobraría más que faltaría. Arreglarlo bien pediría que el
intérprete pasara el `slideClass` activo a `#mo` para cambiar de token, y eso es otra tarea.

### Quinta pasada: 10 composiciones del kit (13-08-2026)

Un único kit repetido en todos los decks es el problema de la ronda anterior a otra escala:
deja de ser «cuadrados» y pasa a ser «siempre los mismos arcos». Así que el kit pasa a ser un
catálogo de **10 composiciones con conceptos distintos** —`registry` `orbital` `ledger`
`blueprint` `aperture` `terrace` `bloom` `circuit` `prism` `halftone`— de las que cada deck usa
una. Conceptos distintos, no variaciones: con variaciones del mismo motivo volverían a
parecerse todos.

- **Elección determinista, no aleatoria**: hash FNV-1a de la semilla `tema|título` que construye
  `renderSlides`. Con `Math.random()` el mismo deck cambiaría de decoración cada vez que se
  re-renderiza —y se re-renderiza al regenerar el audio y al guardar desde el editor—. Reparto
  medido sobre 80 combinaciones tema×título: 4-11 por composición, las 10 salen.
- **`motion.decor`** permite fijar una si un tema lo exige; el prompt de M9 dice explícitamente
  que NO la declare, o todos los decks de ese tema se parecerían.
- **Reequilibrado por tinta, y luego DESHECHO**: al sortear, `timely-ai` cayó en `circuit` y su
  tinta total bajó a 0,25 %, así que subí los grosores ×3-4 en las ocho composiciones ligeras
  para meterlas todas en 0,74-1,33 %. Fue un error, y de los instructivos: ver la sexta pasada.
- **Dos comprobaciones nuevas en el arnés**, las dos por fallos reales:
  1. **Colisión con el chrome**, por muestreo de puntos (`isPointInStroke`/`isPointInFill`), no
     por bbox: la caja de un arco de esquina abarca todo el cuadrante aunque su trazo pase
     lejos. Paso de muestreo de 2 px: con 6 px un filete horizontal de 2 px cae entre dos
     muestras y el test daba luz verde a colisiones reales. Y la zona de la `brandbar` se acotó
     a donde vive la marca (x 66-290): la barra mide 1136 px pero es transparente.
  2. **Intrusión en la caja de contenido** (x 96-1184, y 100-620), contada por pieza. `#mo` es
     z-index 3 y las slides z-index 2, así que la capa pinta ENCIMA de las tarjetas: se veía un
     escalón de `terrace` cruzando la esquina de una tarjeta. Los velos (≤ 0,095) sí pueden
     entrar —son atmósfera—; el trazo nítido tiene que estar a cero, y lo está en las 10.
- **`npm run previews`** genera además `previews/kit-*.html`, una página por composición sobre el
  mismo tema, para compararlas a ojo.
- **Verificación**: 132/132 + 5/5 del kit + las 10 composiciones sin colisiones ni intrusión
  nítida, 60-61 fps, consola limpia, y las 20 capturas (10 × claro/oscuro) revisadas.

### Sexta pasada: sutileza, y la lección de optimizar una métrica proxy (13-08-2026)

Ocho de las diez composiciones se veían mal, y la causa fue mía: para meterlas en la banda de
tinta de 0,74-1,33 % de la pasada anterior subí los grosores ×3-4 (palas de 18 px, galones de
22 px, escalones de 20 px, filetes de 9 px) y **solo revisé dos capturas** de las veinte. Las dos
composiciones que no toqué —`registry` y `orbital`— eran justo las dos que seguían viéndose bien.

**La lección**: la cifra de tinta era un proxy útil para detectar el extremo invisible (0,05 %) y
lo convertí en objetivo a maximizar. Área no es ruido: `blueprint` pinta 0,15 % y se lee
perfectamente porque sus piezas están bien colocadas, y `orbital` pinta 0,68 % en arcos largos y
finos y es de las más calmadas. **La presencia viene de la cantidad y la finura, no de la masa.**

- **Techo de grosor: 6 px** en el trazo protagonista, 3-4 en el secundario, 1-2 en la
  instrumentación. Escrito en `motion.ts`, en el README y en el prompt de M9, porque es la regla
  más fácil de romper y la que más daño hace.
- **Alfa a la baja**: arcos `.46 → .32`, instrumentación `.38 → .26`, macizos `.5 → .36`, velos
  `.135 → .11` y `.085 → .07`.
- **`prism` y `aperture` rediseñados**, no solo adelgazados: los dos eran abanicos de rectas que
  se cruzaban en la esquina, y eso se lee como arañazos a cualquier grosor. `prism` pasa a un
  galón anidado en el borde derecho (donde hay sitio: la esquina solo daba 96 px de alto y por eso
  salían tan chatos); `aperture`, a palas achaflanadas que no se cruzan.
- **Herramienta nueva**: hoja de contactos (`sheet-light.png` / `sheet-dark.png`) con las 10 en
  una sola imagen. Revisar 20 capturas de una en una es justo lo que no hice; juntas, el problema
  salta a la vista en un segundo.
- **Tinta resultante**: 0,12-0,68 % por composición. El rango es más ancho que antes a propósito:
  se acepta la variedad de peso mientras ninguna caiga en invisible y ninguna pase el techo de
  grosor. El criterio es la hoja de contactos, no el número.
- **Verificación**: 132/132 + 5/5 del kit, las 10 sin colisiones ni intrusión de trazo nítido,
  60-61 fps, y las 20 capturas revisadas — esta vez de verdad, en las dos hojas.
- **Nota**: sobre temas CLAROS las 10 quedan ahora bastante suaves. Si se quiere subir, el dial es
  `motion.intensity` del tema, no los grosores del kit.

### Séptima pasada: sutileza, y el resguardo del centro (14-08-2026)

Encargo: «que los SVG de decoración sean más sutiles». Revisadas las 30 capturas de tema y las
20 del kit antes de tocar nada, el diagnóstico tenía dos mitades, y solo una era de opacidad.

**Lo que de verdad cantaba era la COLOCACIÓN, no el alfa.** El kit lleva desde la quinta pasada
una comprobación de que ningún trazo nítido entra en la caja de contenido, y la cumple. Los
**presets** nunca la tuvieron: `constellation` teje 15 enlaces y 14 nodos sobre el lienzo entero
y sus líneas cruzaban por encima de las tarjetas de `timely-ai` —la capa pinta a z-index 3, las
slides a 2—, y `grid` repartía cruces y rombos por el medio. Bajar el alfa de eso solo lo
convierte en una telaraña más pálida encima del texto.

- **Resguardo del centro en `MOTION_BASE_CSS`**: `#mo` lleva una máscara radial (`transparent`
  al 30 %, media fuerza al 60 %, entera desde el 86 %). La capa se apaga hacia el centro y
  conserva su fuerza en el perímetro, que es donde está pensada. Vale para los presets, para el
  kit y para el SVG libre de cualquier tema, sin tocar su geometría — que es justo lo que no
  podía darme una regla escrita en el prompt de M9. Medido con `constellation` a `intensity: 1`:
  **0,93 % de tinta dentro de la caja de contenido frente a 16,4 % fuera**. Es máscara por alfa;
  un motor sin soporte no enmascara y se queda con la capa entera, nunca con una rota.
  La cortina (`#mo-tx`) **no** va enmascarada: cruza el escenario a propósito.
- **Alfas a la baja, ~30 % en todo**: kit (arcos .32→.22, instrumentación .26→.18, macizos
  .36→.25, velos .11→.075 y .07→.05), los seis presets (p. ej. `constellation` enlaces .3→.19 y
  nodos .62→.4, que va más abajo que el resto por ser el único que cubre el lienzo entero;
  `frame` filete .5→.35 y bracket .7→.48; `aurora` cinta .18→.13; `wave` onda .18→.13) y las dos
  firmas propias, cuyo CSS vive dentro del JSON del tema (`atelier` filete .8→.55, punto .9→.6;
  `aurora-noir` cinta .25→.18, destello .42→.3).
- **La rampa de `halftone`, comprimida por arriba**: el punto mayor pasa de r 11 a r 7,5. Un
  círculo relleno de 22 px de diámetro era la pieza más maciza de las diez composiciones y se
  leía como burbuja, no como trama. Lo que hace la trama es la progresión, no el primer punto.
- **`intensity` de los temas, intacta**: es el dial por tema y bajarlo además habría sido contar
  dos veces la misma rebaja.
- **`npm run previews -- --kit <tema>`**: el kit se revisaba solo sobre `aurora-noir`, así que
  las diez composiciones no se veían nunca sobre papel. Es la misma clase de punto ciego que
  causó la sexta pasada (revisar dos capturas de veinte). Ahora el tema del kit es elegible.
- **Resultado medido** (tinta en la slide 2): `atelier` 1,14 %, `meridian` 0,82 %,
  `timely-ai` 0,81 % —que baja desde 1,21 % porque la telaraña central era suya—. `atelier`
  queda donde la dejó la cuarta pasada (1,11 %), que es el estado que se juzgó bueno.
- **Verificación**: 176/176 en Chromium headless — los 35 combos overlay×cortina reaccionando al
  avanzar y al retroceder, consola limpia, la máscara aplicada y medida por zonas, la cortina sin
  enmascarar, las 4 transiciones de slide con `reduced-motion` (capa congelada y ningún
  `transform` animándose), sin GSAP, aislamiento de `renderSingleSlide` en los 5 temas, el tope
  de 0,18 sobre relleno de área en los 6 presets a `intensity: 1` y **61 fps** en `aurora`+`wipe`
  con la máscara encima.
- **Dos correcciones al arnés, no al producto**, que conviene no reaprender: (1) `getAnimations()`
  bajo `reduced-motion` devuelve 3 animaciones vivas —`#progress` y el fundido de las dos
  slides—, y eso es correcto: el invariante es que no se MUEVE nada, y un fundido de opacidad es
  precisamente el reemplazo accesible del desplazamiento. (2) medir el tope de 0,18 recorriendo
  todo `#mo` señalaba al `<svg>` raíz, que no pinta: hay que acotarlo a piezas con relleno cuya
  caja pase del 5 % del escenario, que es lo que significa «relleno de área».

**Encontrado, y NO tocado: el `color` que declara un tema para la capa no tiene ningún efecto.**
`renderMotionCss` se emite después del CSS del tema, y su `#mo, #mo-tx { color: var(--primary-300) }`
gana por orden —misma especificidad— a cualquier `#mo { color: var(--primary) }` que declare un
tema. Comprobado en los cinco: todos resuelven a `--primary-300`. O sea que la decisión de la
tercera pasada («en temas claros la capa pinta con `--primary`, no con el tinte») **nunca llegó a
aplicarse**, y las tres pasadas siguientes estuvieron persiguiendo con geometría y grosor una
falta de presencia que en realidad era de color. El arreglo es de una línea —bajar el color base
a especificidad cero con `:where(#mo, #mo-tx)`— pero **sube** la presencia en los cuatro temas
claros, que es lo contrario de lo que pide esta pasada. Queda apuntado aquí y en el README para
decidirlo aparte.

### Octava pasada: `.mo-travel`, el viaje por índice de slide (14-08-2026)

Encargo: «menos elementos, más sutiles, pero que se vayan moviendo según avanzan las slides».
Las dos primeras mitades eran de grado; la tercera era un cambio de modelo.

**El diagnóstico.** Las seis marcas del vocabulario son *reacciones*: `moDraw`, `moPop`,
`moFade` y `moScan` son `fromTo` que devuelven la pieza exactamente a su valor de reposo, y
`moShift`/`moSpin` sí persisten pero solo en una propiedad. Con eso, la capa da un respingo en
cada transición y se queda igual que estaba: en la slide 6 la decoración está exactamente donde
estaba en la 1. Y el ambiente CSS tiene ciclos de 9-45 s (1-6 px/s), por debajo del umbral de
percepción. O sea que «que se mueva con el deck» no era subir un número: no existía la pieza.

- **`.mo-travel`**, séptima marca y ahora la PRINCIPAL: cada grupo marcado tiene una posición
  por índice de slide y navegar lo lleva de una a la siguiente. Es el modelo que ya usaba
  `#flow` con los orbes (`flowPos(i)`), extendido al vocabulario para que valga igual en los
  presets del repo y en el SVG libre de un tema. Determinista por (índice, pieza) y no
  acumulada: retroceder devuelve la posición anterior y 40 slides seguidas no se llevan nada
  fuera del escenario. Fase y amplitud propias por pieza → parallax, no bloque.
  Va en `render()`, no en `animateMotion(dir)`: no depende de la dirección y tiene que colocar
  la capa también en el primer render.
- **Solo x/y, sin rotación.** La primera versión viajaba también en `rotation` y la
  comprobación de reversibilidad la cazó: GSAP hornea la rotación en la matriz con el origen
  derivado del bbox, y en una pieza grande (un velo de 300 px) eso reintroduce en cada salto un
  error de ~5 px que no converge — ir y volver no devolvía la misma posición. Además era
  redundante con `.mo-spin`. Fuera.
- **Menos piezas, que es lo que pide el modelo nuevo**: las 10 composiciones del kit pasan de
  12-25 piezas a 6-11, y los presets a la mitad (`constellation` 31 → 16, `frame` 21 → 12,
  `grid` 15 → 9, `aurora` 12 → 8, `arcs` 13 → 9, `wave` 12 → 8). Las dos firmas propias, igual
  (`atelier` 13 → 9, `aurora-noir` 15 → 10). Por deck: de 30-51 nodos marcados a 15-29.
  El razonamiento se invierte respecto a la segunda pasada: con la capa quieta hacían falta
  muchos nodos para que la reacción se notara; con la capa viajando, esa misma cantidad se lee
  como un desfile y estorba.
- **La zona segura se estrecha**: el viaje desplaza hasta 38 px en x y 17 px en y, así que la
  geometría se replantea sumándole el viaje (izquierda x ≤ 52, derecha x ≥ 1226, banda inferior
  y ≥ 662). Escrito en `motion.ts` y en el prompt de M9.
- **Verificación**: 182/182 — los 35 combos ida y vuelta, el viaje (6 slides → 6 posiciones
  distintas, 33 px entre slides consecutivas, deriva < 2 px al ir y volver), la máscara del
  centro, `reduced-motion` (con `G.set` en vez de tween: coloca sin animar), sin GSAP, el
  aislamiento de la revisión, el tope de 0,18 y 60-61 fps. Y la tira de contactos de las 6
  slides por tema, que es donde se juzga si el viaje se lee.
- **Tres correcciones al ARNÉS, no al producto**, todas por medir lo que no era: (1) la
  reversibilidad hay que medirla sobre el `transform` del grupo, no sobre su bbox compuesto —el
  bbox incluye hijos con `.mo-spin`, y un arco girado cambia su caja muchísimo—; (2) `matrix.e/f`
  no es el desplazamiento cuando hay rotación horneada, así que como «cuánto se ha movido» daba
  200 px donde había 20; (3) el bucle de medida dejaba el deck en la última slide y luego
  comparaba dos slides distintas.

**Encontrado, y NO tocado — bug de contraste en 4 de los 5 temas.** Los cinco declaran
`.slide.section-divider { background: var(--black) }`, pero solo `aurora-noir` es un tema oscuro
con tinta clara por defecto. En los otros cuatro el `h1` de una slide `section-divider` se pinta
con la tinta oscura del tema sobre fondo negro y queda **invisible**. Medido (color de texto vs
fondo): `atelier` rgb(33,27,26) sobre rgb(33,26,25); `meridian` rgb(15,21,26) sobre rgb(14,20,25);
`solstice` rgb(42,32,27) sobre rgb(42,29,22); `timely-ai` rgb(22,19,31) sobre rgb(12,11,16). Es
decir, ratio ≈ 1:1. No tiene nada que ver con la capa de movimiento —se ve en cualquier deck con
un divisor de sección— y el arreglo es una regla por tema
(`.slide.section-divider h1, … { color: … }`), pero toca el diseño de cuatro temas y queda fuera
de esta pasada. Anotado aquí y en el README.

### Pendiente

- **Aceptación de M9**: `npx tsx scripts/build-theme.ts --from-images` no se ha ejecutado.
  Gasta una llamada a Claude y **sobrescribe `themes/timely-ai.json`** (que ya tiene su firma
  asignada en M7). El código está listo: el prompt pide la firma y `deriveThemeFromImages`
  sanea el SVG al escribir el JSON, con los warnings en consola.
