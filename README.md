# slider-generator

Genera **slides HTML (reveal.js)** a partir de un **PDF**, usando **Claude**. Subes un PDF a
un backend en Node + TypeScript; Claude lee el PDF de forma nativa, estructura la
presentación y **replica el estilo visual** de un conjunto de **slides de referencia
(imágenes)** que tú mantienes.

## Stack

- **Backend:** Node + TypeScript (Fastify)
- **IA:** `@anthropic-ai/sdk` — modelo `claude-opus-4-8` (PDF nativo en base64)
- **Salida:** reveal.js (HTML autocontenible)
- **Validación:** Zod (salida estructurada)

## Requisitos

- Node.js 20+
- Una clave de API de Claude

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar el entorno
cp .env.example .env
# editar .env y poner ANTHROPIC_API_KEY

# 3. Arrancar en desarrollo
npm run dev
```

Luego abre `http://localhost:3000`, arrastra un PDF y genera las slides.

## Scripts

| Script              | Acción                                                     |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | Servidor en desarrollo (recarga)                           |
| `npm run build`     | Compila TypeScript a `dist/`                               |
| `npm start`         | Ejecuta la build de `dist/`                                |
| `npm run typecheck` | Comprobación de tipos sin emitir                           |
| `npm run previews`  | Un deck de prueba por tema en `previews/` (sin gastar API) |

## Estructura

```
references/                # imágenes de slides de referencia (set fijo, lo mantienes tú)
src/
  server.ts                # Fastify + estáticos + rutas
  routes/generate.ts       # POST /api/generate
  services/claude.ts       # llamada a Claude (PDF + imágenes ref -> JSON slides + CSS)
  services/slides.ts       # JSON -> HTML reveal.js (inyecta el CSS generado)
  services/references.ts   # lee references/ y pasa las imágenes a base64
  config/schema.ts         # esquema Zod del output
  templates/reveal.html    # shell reveal.js (núcleo, sin tema)
public/
  index.html  app.js       # UI de subida
```

## Cómo funciona

1. Subes un PDF a `POST /api/generate` (multipart).
2. El backend lo pasa a base64 y llama a Claude con el PDF + tus imágenes de referencia.
3. Claude devuelve un JSON estructurado de slides + un CSS que imita el diseño (validado con Zod).
4. El backend lo renderiza a HTML reveal.js aplicando ese CSS y lo devuelve para ver/descargar.

El plan de desarrollo por fases está en [PLAN.md](PLAN.md).

## Movimiento por tema

Cada tema declara su **firma de movimiento** en `themes/<tema>.json → motion`: una capa SVG
que el deck monta **por encima** de las slides (`#mo`), una **cortina** de transición
(`#mo-tx`) y la **transición de slide**. Sin `motion`, el deck se comporta como siempre
(`frame` + `sweep` + `push` + orbes). Catálogo y contrato: [`src/templates/motion.ts`](src/templates/motion.ts).

```jsonc
// Preset del catálogo
"motion": { "overlay": "grid", "transition": "sweep", "slideTransition": "push", "intensity": 0.4 }

// Firma propia (SVG libre; pasa por el sanitizador al cargar el tema)
"motion": { "svg": "<svg viewBox=\"0 0 1280 720\">…</svg>", "transition": "wipe",
            "slideTransition": "fade", "intensity": 0.7 }
```

| Campo | Valores | Qué hace |
| --- | --- | --- |
| `overlay` | `none` `frame` `grid` `aurora` `constellation` `arcs` `wave` | preset del catálogo (`aurora` solo en fondos oscuros) |
| `svg` | SVG libre, ≤ 16 KB / 60 nodos | firma propia; prevalece sobre `overlay` |
| `transition` | `none` `sweep` `wipe` `iris` `stripes` | cortina, en el sentido de la navegación |
| `slideTransition` | `push` `fade` `scale` `rise` | cómo entra y sale la slide |
| `intensity` | 0–1 (def. 0.6) | opacidad/amplitud (`--mo-i`) |
| `speed` | 0.5–2 (def. 1) | multiplicador de duración (`--mo-speed`) |
| `flow` | bool (def. `true`) | orbes de glow persistentes (`#flow`) |
| `decor` | una de las 10 composiciones | fija el kit; sin declararlo se sortea por semilla |

**Vocabulario `mo-*`** — el contrato entre el SVG y el deck. El autor marca los nodos y el
intérprete de `deck.ts` sabe qué hacer con cada marca en cada cambio de slide:

| Clase | Reacción |
| --- | --- |
| `.mo-travel` | **viaja** a la posición de esta slide y se queda: no vuelve |
| `.mo-draw` | re-trazado (`stroke-dasharray`), en el extremo que toca según la dirección |
| `.mo-pop` | `scale .55 → 1` con rebote, escalonado |
| `.mo-shift` | salto de fase horizontal (cintas, bandas, ondas) |
| `.mo-spin` | rotación ±18° según la dirección |
| `.mo-fade` | pulso de opacidad sobre su valor de reposo |
| `.mo-scan` | cruza el escenario en el eje de la dirección |

**`.mo-travel` es la marca principal**, y la que hace que la capa acompañe al deck. Las otras
seis son *reacciones*: se disparan al cambiar de slide y devuelven la pieza exactamente a su
sitio, así que con solo esas la decoración da un respingo y se queda quieta. `.mo-travel` le da
a cada grupo una posición **por índice de slide** —igual que los orbes de `#flow`—, de modo que
en la slide 6 la composición está en otro sitio que en la 1 y lo que se ve es el recorrido.

Es determinista y reversible, no acumulada: retroceder devuelve la posición anterior y cuarenta
slides seguidas no se llevan nada fuera del escenario. Cada grupo lleva su fase y su amplitud, así
que no viajan en bloque (eso se leería como que se mueve la capa entera) sino con parallax: hasta
38 px en x y 17 px en y, con recorridos de 1,6-2,3 s que se salen del compás de la transición a
propósito. Solo x/y: la rotación se probó y se quitó —GSAP la hornea con el origen derivado del
bbox y en una pieza grande eso reintroduce un error que no converge—, y para girar ya está
`.mo-spin`.

Como escribe `transform`, el mismo nodo no puede llevar además `.mo-shift`, `.mo-spin` ni un
`@keyframes` que anime `transform`: la marca va en un `<g>` envoltorio y lo demás en los hijos.

**Kit de decoración: 10 composiciones.** Toda firma con capa —preset o SVG propio— lleva además
un kit de piezas de tamaño medio, en **10 composiciones con conceptos distintos**. Cada deck usa
una, elegida con la semilla `tema|título` (hash FNV-1a, sin `Math.random()`): dos decks distintos
casi nunca coinciden y el **mismo** deck re-renderizado no cambia. Un tema puede fijar la suya con
`motion.decor`, pero lo normal es dejar que la sortee.

| Composición | Concepto |
| --- | --- |
| `registry` | marcas de producción gráfica: corte, registro, escala y cotas |
| `orbital` | órbitas concéntricas y los puntos que las recorren |
| `ledger` | editorial: dobles filetes con remate y columnas de hairline |
| `blueprint` | dibujo técnico: cotas con flecha, datum en L y cuña rayada |
| `aperture` | fotográfico: palas de diafragma y marco de enfoque |
| `terrace` | arquitectónico: escalonados anidados, como curvas de nivel |
| `bloom` | orgánico: curvas largas de borde y dispersión de puntos |
| `circuit` | trazas en ángulo recto con sus pads, ruteadas por los márgenes |
| `prism` | geométrico: galones anidados y banda diagonal de hairlines |
| `halftone` | trama de imprenta: rampa de puntos creciente |

Que sean conceptos distintos y no variaciones del mismo es el punto: con una sola composición,
todos los decks del sistema acaban pareciéndose. `npm run previews` genera una página por
composición (`previews/kit-*.html`) para verlas juntas.

Todo va marcado con el vocabulario `mo-*` y definido una sola vez en `motion.ts`: ningún tema
repite geometría, y el kit se emite con cualquier `overlay` que no sea `none`.

**Techo de grosor: 6 px.** 6 en el trazo protagonista, 3–4 en el secundario, 1–2 en la
instrumentación. Es la regla más fácil de romper y la que más daño hace. Hubo una versión con
palas de 18 px y galones de 22 px, buscando cuadrar una cifra de «tinta sobre el escenario», y el
resultado eran manchones que se leían como un glitch. **La presencia viene de la cantidad y la
finura, no de la masa**: una línea de 1,5 px repetida se lee como oficio, una barra de 20 px se lee
como accidente.

Y una advertencia sobre medir esto: la cifra de tinta (superficie × alfa sobre el escenario) sirve
para detectar el extremo invisible —los presets sin kit pintaban 0,05 %— y para comparar unas
composiciones con otras, **nunca como objetivo a maximizar**. `blueprint` pinta 0,15 % y se lee
perfectamente porque sus piezas están bien colocadas; `orbital` pinta 0,68 % en arcos largos y
finos y es de las más calmadas. Área no es lo mismo que ruido. Lo que decide es mirarlo.

**Nada de trazo nítido dentro de la caja de contenido.** `#mo` es `z-index: 3` y las slides
`z-index: 2`, así que la capa pinta **encima** de las tarjetas. Los velos (≤ 0,055) sí pueden
entrar —son atmósfera—; el trazo nítido, nunca.

Y hay una **segunda línea de defensa, automática**: `#mo` lleva una máscara radial que apaga la
capa hacia el centro del escenario (`transparent` hasta el 30 %, media fuerza al 60 %, entera a
partir del 86 %). El kit ya respeta la caja de contenido por geometría, pero los presets que
tejen sobre el lienzo entero —`constellation`, `grid`, `aurora`— y cualquier `motion.svg` de un
tema no tienen por qué; la máscara lo garantiza para todos sin tocar su dibujo. Medido con
`constellation` a `intensity: 1`: 0,9 % de tinta dentro de la caja de contenido frente al 16 %
del perímetro. Un motor sin soporte de `mask-image` simplemente no enmascara y se queda con la
capa entera, nunca con una capa rota.

Ese vocabulario no es un capricho, y hay una regla que no conviene reaprender: **nada de
`<rect>` con borde alineado a los ejes**. Un cuadrado con borde *es* el glifo universal de
placeholder —imagen rota, casilla vacía— y tres idénticos apilados a intervalos iguales se
leen como una lista de checkboxes, no como decoración. Un cuadrado girado 45° es un marcador;
alineado a los ejes es una caja vacía. Las marcas de imprenta, en cambio, se leen al instante
como intencionadas, que es justo lo que necesita una capa que enmarca el contenido de otro.

La composición tiene **un foco** (los tres arcos y el velo de la esquina superior derecha),
**un contrapeso** (los de la inferior izquierda) y el resto marcas sueltas y finas, con la
opacidad escalonada por papel: arcos `.22`, instrumentación `.18`, macizos `.25`, velos
`≤ .055` (factores sobre `--mo-i`). Una sola escala de ticks: dos convertirían el gesto en un
patrón de relleno.

Esos factores están **muy por debajo** del tope duro de 0,18 a propósito. El tope protege de lo
ilegible —la capa tiñendo una foto—; no marca el objetivo. La capa enmarca el contenido de
otro, y el listón es que se note al mirarla y desaparezca al leer.

Su colocación sigue la geometría **real** de una slide generada, que no es la que uno supone:

- `.pad` es `64px 72px` → la caja de contenido es **x 72–1208, y 64–656**.
- `.brandbar` va en todas las slides de contenido, en `top:30px; left:72px; right:72px`, y con
  `z-index: 5` — es decir **por encima** de la capa (`#mo` es `z-index: 3`). Cualquier pieza en
  la franja superior queda detrás del logo y se lee como suciedad alrededor de la marca.

- El chrome fijo (`#nav`, el chip de ayuda) es `z-index: 50`, también por encima: `#nav` ocupa
  x 493–787 / y 648–694 y el chip x 1090–1256 / y 672–696. Lo que caiga ahí es tinta perdida.

Así que el kit vive en los bordes izquierdo (`x ≤ 68`) y derecho (`x ≥ 1212`), en la banda
inferior (`y ≥ 660`) y en las esquinas, con los centros de los arcos fuera del lienzo. Nada se
corta con el borde salvo lo que sangra a propósito: un cuadrado a medias se lee como bug de
render, un arco a medias se lee como arco.

**Lo que hace que la decoración se vea: la SUPERFICIE, no el contraste.** Es el error fácil
de este sistema. Un punto de 3 px a 30/255 de delta sobre el fondo tiene contraste de sobra y
sigue siendo invisible, porque ocupa una millonésima de la pantalla. Los presets sin el kit
pintaban entre el 0,05 % (`atelier`) y el 0,08 % (`timely-ai`) del escenario aunque llevaran
31 nodos marcados. Con el kit van al 0,8–1,1 % de tinta nítida — más de diez veces, y el
punto donde se ve sin competir con el contenido. Al escribir decoración: trazos de
**2,5–6 px** y formas de **60–300 px**, no filetes de 1 px y puntos de 3 px.

Y en temas claros, la capa debería pintar con `var(--primary)`, no con el tinte `--primary-300`:
sobre papel o blanco un tinte pálido a 0,3 de alfa no se distingue del fondo. **Hoy no lo hace**:
`renderMotionCss` se emite DESPUÉS del CSS del tema y su `#mo, #mo-tx { color: var(--primary-300) }`
gana por orden a cualquier `#mo { color: var(--primary) }` que declare un tema (misma
especificidad). Medido: los cinco temas resuelven a `--primary-300`. Para que la declaración del
tema mande, el color base tendría que ir con especificidad cero —`:where(#mo, #mo-tx)`—; es un
cambio de una línea que **sube** la presencia en los cuatro temas claros, así que se deja
pendiente de decidir en vez de colarlo en una pasada de sutileza.

| Preset | Piezas propias (+ 6-11 del kit) |
| --- | --- |
| `frame` | 12 — 2 filetes, 4 brackets, 3 marcas, 1 remate, 2 remaches + 4 destellos |
| `grid` | 9 — la trama, 3 cruces de registro, 4 marcadores y 1 barra de escaneo |
| `aurora` | 8 — 3 cintas, 2 filamentos, 3 destellos |
| `constellation` | 16 — 9 enlaces, 8 nodos, 1 halo, en 3 grupos que viajan |
| `arcs` | 9 — 3 arcos, 2 trazos, 4 puntos, 1 escaneo |
| `wave` | 8 — 2 ondas, 2 crestas, 4 burbujas |

Esas cifras bajaron a la mitad al introducir `.mo-travel`: cuando la capa se queda quieta hay que
llenarla de nodos para que la reacción se note, pero cuando **viaja**, la misma cantidad se lee
como un desfile. Menos piezas y un recorrido valen más que muchas piezas dando un respingo.

Reglas al escribir un `motion.svg`:

- Todo `id` y toda `class` con prefijo **`mo-`**: el sanitizador renombra los `id` que no lo
  lleven (y reescribe sus `url(#…)`) y descarta las clases sin prefijo. Las slides traen SVG
  escrito por Claude y un `id` duplicado rompería un `<pattern>` en silencio.
- **Color por token**: `currentColor` (`#mo` lleva `color: var(--primary-300)`) o
  `var(--primary)`, `var(--grad)`… así cualquier firma encaja con cualquier paleta.
- El **ambiente** (deriva, respiración, rotación lenta) va en el CSS del tema con selectores
  `#mo .mo-…` y `@keyframes` propios, usando `--mo-i` y `--mo-speed`. Es CSS a propósito: si
  el CDN de GSAP cae, la capa sigue viva y solo se pierde la reacción a la transición.
- **Cuidado**: una animación CSS gana a los estilos inline, así que no animes por CSS la
  misma propiedad (`transform` u `opacity`) del mismo nodo que lleva una clase `mo-*`. Pon el
  ambiente en un `<g>` envoltorio y la marca en el nodo de dentro.
- Fondos claros: `intensity ≤ 0.5` y nunca `mix-blend-mode: screen`.

> **Bug conocido, sin arreglar: `h1` invisible en las slides `section-divider`.** Los cinco temas
> declaran `.slide.section-divider { background: var(--black) }`, pero solo `aurora-noir` es un
> tema oscuro con tinta clara. En `atelier`, `meridian`, `solstice` y `timely-ai` el título se
> pinta con la tinta oscura del tema sobre fondo negro y desaparece (contraste medido ≈ 1:1). No
> tiene que ver con la capa de movimiento. El arreglo es una regla por tema:
> `.slide.section-divider h1, .slide.section-divider h2 { color: var(--paper); }` o equivalente.

El SVG de un tema **nunca** llega al HTML sin pasar por
[`sanitizeMotionSvg`](src/services/sanitize-svg.ts) (allowlist de etiquetas y atributos, sin
`script`/`on*`/`style`/`foreignObject`/`image`, `href` solo a fragmentos internos, topes de
tamaño y de nodos). Es *fail-closed*: si no sobrevive, el tema cae a su preset y se registra
un warning. `prefers-reduced-motion: reduce` congela la capa entera.

## Referencias de diseño

Deja tus **imágenes de slides** en la carpeta `references/` (PNG/JPEG/WebP/GIF). Claude las
analiza y **replica su estilo visual** (paleta, tipografía, layout) al generar las slides del
PDF. No son citas ni bibliografía: solo sirven de modelo de aspecto. Cambia las imágenes para
cambiar el look de las presentaciones generadas.

## Despliegue en Render

El repo trae un [`render.yaml`](render.yaml). En Render: **New → Blueprint**, apunta al repo y
Render pedirá los secretos marcados como `sync: false` (claves de API y `APP_PASSWORD`).
`SESSION_SECRET` se genera solo.

```bash
Build:  npm ci --include=dev && npm run build   # tsc es devDependency: --include=dev es obligatorio
Start:  npm start
Health: /healthz                                # queda fuera del login a propósito
```

El servidor escucha en `0.0.0.0` solo cuando detecta la variable `RENDER`; en local sigue
atado a `127.0.0.1`. `HOST` lo fuerza en cualquier caso.

### Antes de exponerlo a internet

- **Pon `APP_PASSWORD`.** Sin ella la app queda abierta y cualquiera puede gastar tus créditos
  de Claude, ElevenLabs y HeyGen.
- **Nunca metas secretos en `.env.example`**: ese fichero está versionado. Van en `.env`
  (ignorado por git) y en el dashboard de Render.

### Limitaciones conocidas en Render

- **La revisión visual va apagada** (`VISUAL_REVIEW=off`). Necesita Chromium y el runtime
  nativo no lo trae. Para recuperarla, despliega con el [`Dockerfile`](Dockerfile) incluido
  (`runtime: docker`), que parte de la imagen oficial de Playwright.
- **Los decks viven en memoria.** Cada reinicio, redeploy o sueño del plan `free` los borra.
- **Generar una clase tarda minutos, y una petición ya en curso no se corta:** Render
  mantiene abiertas las peticiones de un Web Service **hasta 100 minutos**. El sueño por
  inactividad (siguiente sección) es un mecanismo aparte, a nivel de instancia — no aplica
  mientras hay una petición en marcha.

### El plan `free` (el que usa este blueprint) y el sueño por inactividad

Render **duerme un servicio free tras 15 minutos sin tráfico entrante** (una petición nueva,
no una que ya esté en curso), y despertarlo tarda **alrededor de 1 minuto** (el visitante ve
una pantalla de carga mientras tanto). Como los decks viven en memoria, dormirse también los
borra — asúmelo mientras esto sea solo para probar.

Si en algún momento quieres mantenerlo siempre despierto, basta con llamar a `/healthz` cada
menos de 15 minutos desde un pinger externo (cron-job.org, UptimeRobot, una GitHub Action
programada…) — la sonda está fuera del login a propósito, así que no necesita credenciales.
Ojo entonces al presupuesto: Render da **750 horas de instancia free al mes por workspace**,
y un servicio despierto 24/7 casi lo agota él solo. Sube a `starter` (`plan: starter` en
`render.yaml`) cuando esto deje de ser solo para pruebas.
