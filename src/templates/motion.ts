/**
 * Capa SVG de movimiento POR TEMA (#mo + #mo-tx).
 *
 * Este archivo es el catálogo: presets de overlay, cortinas de transición y variantes
 * de transición de slide, más el resolutor que convierte lo que declara un tema
 * (`theme.motion`) en una config ya clampada (`ResolvedMotion`).
 *
 * Reglas de diseño:
 *
 * 1. **Dependencia en un solo sentido**: `motion.ts` NO importa nada de `deck.ts`.
 *    `deck.ts` (y `theme-schema.ts`, para los enums) importan de aquí.
 * 2. **El ambiente es CSS, la reacción es GSAP**. Todo lo que se mueve solo entre
 *    transiciones vive en `@keyframes` de estos presets (o del CSS del tema): si el CDN
 *    de GSAP cae, la capa sigue viva. Lo que reacciona al cambio de slide lo dispara el
 *    intérprete de `DECK_JS` a través del vocabulario `mo-*`.
 * 3. **Vocabulario `mo-*`** (el contrato con el SVG libre de un tema):
 *      .mo-travel VIAJE a la posición de ESTA slide         (la pieza no vuelve: deriva)
 *      .mo-draw   re-trazado por stroke-dasharray/offset   (filetes, brackets, conectores)
 *      .mo-pop    scale 0,55 → 1 con back.out               (puntos, destellos, nodos)
 *      .mo-shift  salto de fase en x, según la dirección    (cintas, bandas, ondas)
 *      .mo-spin   rotación ±18° según la dirección          (arcos, anillos)
 *      .mo-fade   pulso de opacidad                        (rejillas, tramas)
 *      .mo-scan   cruza el escenario en el eje de dir      (líneas de escaneo)
 *
 *    `.mo-travel` es la marca que hace que la capa ACOMPAÑE al deck. Las otras cinco son
 *    reacciones: se disparan al cambiar de slide y devuelven la pieza a su sitio, así que
 *    con solo esas la decoración da un respingo y se queda quieta. `.mo-travel` da a cada
 *    pieza una posición por índice de slide (determinista y reversible, como los orbes de
 *    #flow): en la slide 6 la composición está en otro sitio que en la 1, y el recorrido
 *    entre las dos es lo que se ve. Es la marca PRINCIPAL de una composición; las demás la
 *    acompañan.
 *
 *    Como escribe `transform`, no se combina en el mismo nodo con `.mo-shift` (x) ni
 *    `.mo-spin` (rotation) ni con un `@keyframes` que anime `transform` (ver 4).
 * 4. **GOTCHA que gobierna la estructura de todos los presets**: una animación CSS gana
 *    a los estilos inline, así que si el ambiente CSS anima la MISMA propiedad que el
 *    vocabulario (transform u opacity) sobre el MISMO nodo, GSAP no se ve. Por eso el
 *    ambiente que usa `transform`/`opacity` va en un `<g>` envoltorio y la marca `mo-*`
 *    en el nodo de dentro (o al revés). Distintas propiedades sobre el mismo nodo sí
 *    conviven (p. ej. `frame`: CSS respira la opacidad del glint, GSAP le hace el pop).
 * 5. **Color siempre por token**: `#mo`/`#mo-tx` fijan `color: var(--primary-300, …)` y
 *    los presets pintan con `currentColor` → cualquier firma encaja con cualquier paleta.
 * 6. **Opacidades atadas a `--mo-i`**: `calc(var(--mo-i, .6) * K)`. Tope duro: nada por
 *    encima de 0,18 efectivo en el ambiente ni 0,22 en el pico de la cortina. Los factores
 *    reales van MUY por debajo de ese tope: el tope protege de lo ilegible (decoración sobre
 *    una foto), no marca el objetivo. La capa enmarca el contenido de otro y su sitio es el
 *    perímetro; en el centro se apaga sola (ver el resguardo de `MOTION_BASE_CSS`).
 */

export const OVERLAY_NAMES = ['none', 'frame', 'grid', 'aurora', 'constellation', 'arcs', 'wave'] as const
export const TRANSITION_NAMES = ['none', 'sweep', 'wipe', 'iris', 'stripes'] as const
export const SLIDE_TX_NAMES = ['push', 'fade', 'scale', 'rise'] as const

/**
 * Las 10 composiciones del kit de decoración. Cada una tiene un CONCEPTO propio, no son
 * variaciones de la misma idea: si lo fueran, todos los decks volverían a parecerse.
 */
export const DECOR_NAMES = [
  'registry',   // marcas de producción gráfica: corte, registro, escala, medidas
  'orbital',    // sistemas de arcos concéntricos y puntos en órbita
  'ledger',     // editorial: dobles filetes con remate y una columna de hairline
  'blueprint',  // dibujo técnico: cotas con flechas, datum en L y cuña rayada
  'aperture',   // fotográfico: diafragma de palas y marco de enfoque
  'terrace',    // arquitectónico: escalonados anidados como curvas de nivel
  'bloom',      // orgánico: pétalos largos y una dispersión de puntos
  'circuit',    // trazas en ángulo recto con pads, ruteadas por los márgenes
  'prism',      // geométrico: galones anidados y una banda diagonal de hairlines
  'halftone',   // trama de imprenta: rampa de puntos creciente
] as const

export type OverlayName = (typeof OVERLAY_NAMES)[number]
export type TransitionName = (typeof TRANSITION_NAMES)[number]
export type SlideTxName = (typeof SLIDE_TX_NAMES)[number]
export type DecorName = (typeof DECOR_NAMES)[number]

/** `'custom'` = el tema trae su propio SVG (ya saneado) en vez de un preset del catálogo. */
export type ResolvedOverlayName = OverlayName | 'custom'

/**
 * Lo que declara un tema en `theme.motion` (ver ThemeSchema). Se define aquí para que
 * `theme-schema.ts` dependa de `motion.ts` y no al revés.
 */
export interface ThemeMotion {
  /** SVG libre del tema. Prevalece sobre `overlay`. Llega ya saneado (sanitizeMotionSvg). */
  svg?: string
  overlay?: OverlayName
  transition?: TransitionName
  slideTransition?: SlideTxName
  intensity?: number
  speed?: number
  flow?: boolean
  /**
   * Composición del kit de decoración. Sin declararla se elige una de las 10 a partir de la
   * semilla del deck (§`pickDecor`), que es lo normal: así dos decks no se parecen. Fijarla
   * solo tiene sentido si un tema exige una concreta.
   */
  decor?: DecorName
}

/** Config ya resuelta y clampada. Viaja al runtime como DATOS (window.__DECK_MOTION__). */
export interface ResolvedMotion {
  overlay: ResolvedOverlayName
  transition: TransitionName
  slideTransition: SlideTxName
  /** 0..1 → opacidad/amplitud global (--mo-i). */
  intensity: number
  /** 0.5..2 → multiplicador de duración (--mo-speed). */
  speed: number
  /** Orbes persistentes (#flow). */
  flow: boolean
  /** Composición del kit ya elegida (declarada por el tema o sorteada por semilla). */
  decor: DecorName
  /** Markup del SVG saneado del tema; solo cuando `overlay === 'custom'`. NO viaja en el JSON. */
  svg?: string
}

export interface MotionPreset {
  css: string
  html: string
}

export const MOTION_DEFAULTS: ResolvedMotion = {
  overlay: 'frame',
  transition: 'sweep',
  slideTransition: 'push',
  intensity: 0.6,
  speed: 1,
  flow: true,
  decor: 'registry',
}

// ── Kit de decoración: 10 composiciones ───────────────────────────────────────
/**
 * Piezas de decoración de TAMAÑO MEDIO que acompañan a cualquier firma con capa, en **10
 * composiciones con conceptos distintos** de las que cada deck usa una (elegida por semilla,
 * ver `pickDecor`). Que sean conceptos distintos y no variaciones del mismo es el punto: con
 * una sola composición, todos los decks del sistema acaban pareciéndose.
 *
 * Por qué existe el kit: los presets por sí solos pintaban entre el 0,05 % (atelier) y el
 * 0,08 % (timely-ai) del escenario, todo en filetes de 1 px y puntos de 3 px. El contraste por
 * píxel era correcto —30/255 sobre el fondo— pero sobre una superficie tan pequeña no se
 * percibe nada. Lo que se lee como decoración es SUPERFICIE: trazos de 2,5-9 px y formas de
 * 60-300 px.
 *
 * REGLA QUE NO CONVIENE REAPRENDER: nada de `<rect>` con borde alineado a los ejes. Un cuadrado
 * con borde ES el glifo universal de placeholder (imagen rota, casilla vacía) y tres idénticos
 * apilados a intervalos iguales se leen como una lista de checkboxes. Un cuadrado girado 45° es
 * un marcador; alineado a los ejes es una caja vacía.
 *
 * Donde puede vivir, con la geometría REAL de una slide generada (no la que uno supone):
 *   · `.pad` es `64px 72px` → la caja de contenido es x 72-1208, y 64-656.
 *   · `.brandbar` va en TODAS las slides de contenido, en `top:30px; left:72px; right:72px`, y
 *     con `z-index: 5`, o sea POR ENCIMA de la capa (#mo es z-index 3): la franja superior está
 *     vetada salvo por encima de y 26, o queda detrás del logo.
 *   · El chrome fijo también es z-index 50: `#nav` en x 493-787 / y 648-694 y el chip de ayuda
 *     en x 1090-1256 / y 672-696. Lo que caiga ahí es tinta perdida.
 * Así que el kit se queda en los bordes izquierdo (x ≤ 68) y derecho (x ≥ 1212), la banda
 * inferior (y ≥ 660) y las esquinas, con los centros de los arcos FUERA del lienzo para que se
 * vean grandes sin invadir el texto. Nada se corta con el borde salvo lo que sangra a
 * propósito: un cuadrado a medias se lee como bug de render, un arco a medias se lee como arco.
 *
 * Cada composición mantiene además la misma JERARQUÍA de peso —trazo protagonista,
 * instrumentación fina, velo de atmósfera— y un solo foco con su contrapeso, en vez de
 * repartir formas por todo el perímetro.
 *
 * GROSORES, que es donde esto se rompe con más facilidad. Techo duro: **6 px** en el trazo
 * protagonista, 3 px en el secundario, 1-2 px en la instrumentación. Hubo una versión con
 * palas de 18 px y galones de 22 px, buscando cuadrar una cifra de «tinta sobre el escenario»,
 * y el resultado eran manchones que se leían como un glitch. La presencia se consigue con
 * CANTIDAD y FINURA —muchas piezas finas bien puestas—, no con masa: una línea de 1,5 px
 * repetida se lee como oficio, una barra de 20 px se lee como accidente. La cifra de tinta
 * sirve para comprobar que las 10 pesan PARECIDO entre sí, nunca como objetivo absoluto.
 */
const DECOR_CSS = `
/* Roles compartidos por las 10 composiciones. La jerarquía es deliberada: el trazo grueso
   manda, la instrumentación es fina y el velo es atmósfera. Es lo que convierte un espolvoreo
   de formas en una composición. */
#mo .mo-darc   { fill: none; stroke: currentColor; stroke-linecap: round;
                 opacity: calc(var(--mo-i, .6) * .22); }
/* Los velos son relleno de ÁREA: factor bajo para no pasar del tope sobre una foto. */
#mo .mo-dveil  { fill: currentColor; opacity: min(.055, calc(var(--mo-i, .6) * .075)); }
#mo .mo-dveil2 { opacity: min(.035, calc(var(--mo-i, .6) * .05)); }
/* Instrumentación: remate a hueso (butt), no redondeado. Es lo que la hace leer como marca
   técnica y no como un trazo decorativo cualquiera. */
#mo .mo-dfine  { fill: none; stroke: currentColor; stroke-linecap: butt;
                 opacity: calc(var(--mo-i, .6) * .18); }
/* Piezas macizas pequeñas: puntos, rombos, pads. Poca área, así que aguantan más alfa. */
#mo .mo-dsolid { fill: currentColor; opacity: calc(var(--mo-i, .6) * .25); }
/* Respiración de los cúmulos: va en el <g>, y las marcas mo-* en los nodos de dentro
   (gotcha 4). */
#mo .mo-dcluster { animation: mo-dbreathe calc(9s * var(--mo-speed, 1)) ease-in-out infinite alternate; }
#mo .mo-dc2      { animation-duration: calc(11s * var(--mo-speed, 1)); animation-delay: -3s; }
@keyframes mo-dbreathe { from { opacity: .78; } to { opacity: 1; } }`.trim()

const D_OPEN = '<svg class="mo-decor" viewBox="0 0 1280 720">'
const D_CLOSE = '</svg>'

/**
 * Las 10 composiciones, a partir de la séptima pasada, siguen todas la MISMA estructura:
 *
 *   · un CÚMULO de foco y un CONTRAPESO, cada uno en su `<g class="mo-travel">`;
 *   · dos o tres marcas finas de acompañamiento, algunas quietas como anclaje;
 *   · entre 6 y 11 piezas pintadas en total (antes eran 12-25).
 *
 * El viaje es lo que cambia el modelo: `.mo-travel` da a cada grupo una posición por índice
 * de slide, así que la composición está en un sitio distinto en la slide 6 que en la 1 y el
 * recorrido entre las dos es lo que se ve. Con las otras marcas sola, la capa daba un
 * respingo en cada transición y volvía exactamente a su sitio.
 *
 * Por eso hay MENOS piezas que antes y no más: lo que da vida ya no es la cantidad de nodos
 * que reaccionan, es el recorrido. Con la composición cargada, el viaje se lee como un
 * desfile y estorba; con seis piezas, como una deriva.
 *
 * GEOMETRÍA: el viaje desplaza hasta 38 px en x y 17 px en y, así que la zona segura se
 * estrecha respecto a la de antes — nada de trazo nítido que pueda acabar dentro de la caja
 * de contenido (x 96-1184, y 100-620) SUMÁNDOLE su viaje. En la práctica: piezas de la
 * izquierda a x ≤ 52, de la derecha a x ≥ 1226, banda inferior a y ≥ 662 y esquinas con el
 * centro de los arcos fuera del lienzo.
 */

/** 1. `registry` — marcas de producción gráfica: corte, registro y una cota. */
const D_REGISTRY = `
    <polygon class="mo-dveil mo-travel" points="1280,0 1280,214 1074,0"/>
    <g class="mo-dcluster mo-travel">
      <circle class="mo-darc mo-spin" cx="1306" cy="-36" r="176" stroke-width="5"   stroke-dasharray="200 906"/>
      <circle class="mo-darc mo-spin" cx="1306" cy="-36" r="248" stroke-width="2.5" stroke-dasharray="150 1408"/>
    </g>
    <g class="mo-dcluster mo-dc2 mo-travel">
      <circle class="mo-darc mo-spin" cx="-36" cy="756" r="162" stroke-width="4" stroke-dasharray="170 848"/>
    </g>
    <g class="mo-travel">
      <circle class="mo-dfine" cx="1248" cy="470" r="11" stroke-width="1.25"/>
      <path class="mo-dfine mo-draw" stroke-width="1.25" d="M1230,470 H1241 M1255,470 H1266 M1248,452 V463 M1248,477 V488"/>
    </g>
    <path class="mo-dfine mo-draw" stroke-width="1.75" d="M14,54 H46 M54,14 V46"/>
    <path class="mo-dfine mo-draw" stroke-width="1.75" d="M330,676 V688 M330,682 H470 M470,676 V688"/>`

/** 2. `orbital` — órbitas concéntricas y dos puntos que las recorren. */
const D_ORBITAL = `
    <polygon class="mo-dveil mo-travel" points="1280,0 1280,300 980,0"/>
    <g class="mo-dcluster mo-travel">
      <circle class="mo-darc mo-spin" cx="1340" cy="-80" r="204" stroke-width="4.5" stroke-dasharray="230 1052"/>
      <circle class="mo-darc mo-spin" cx="1340" cy="-80" r="286" stroke-width="2.5" stroke-dasharray="180 1616"/>
      <circle class="mo-darc mo-spin" cx="1340" cy="-80" r="368" stroke-width="1.4" stroke-dasharray="140 2172"/>
    </g>
    <g class="mo-dcluster mo-dc2 mo-travel">
      <circle class="mo-darc mo-spin" cx="-80" cy="800" r="196" stroke-width="4" stroke-dasharray="200 1032"/>
    </g>
    <g class="mo-travel">
      <circle class="mo-dsolid mo-pop" cx="1244" cy="146" r="4.5"/>
      <circle class="mo-dsolid mo-pop" cx="1262" cy="318" r="3"/>
    </g>
    <circle class="mo-dsolid mo-pop" cx="38" cy="498" r="4"/>`

/**
 * 3. `ledger` — editorial: los dos filetes de cabecera y pie se quedan QUIETOS (son el marco
 * de la página) y lo que deriva son las columnas de hairline de los costados. Un marco fijo
 * con el interior en movimiento se lee mejor que todo moviéndose a la vez.
 */
const D_LEDGER = `
    <path class="mo-darc mo-draw" stroke-width="3.5" d="M72,12 H1208"/>
    <path class="mo-dfine mo-draw" stroke-width="1.25" d="M72,20 H1208"/>
    <path class="mo-darc mo-draw" stroke-width="3.5" d="M72,706 H1208"/>
    <path class="mo-dfine mo-draw" stroke-width="1.25" d="M72,714 H1208"/>
    <g class="mo-travel">
      <path class="mo-dfine mo-draw" stroke-width="1.5" d="M30,150 V570 M18,150 H42 M18,570 H42"/>
      <polygon class="mo-dsolid mo-pop" points="30,300 40,310 30,320 20,310"/>
    </g>
    <g class="mo-travel">
      <path class="mo-dfine mo-draw" stroke-width="1.5" d="M1250,150 V570 M1238,150 H1262 M1238,570 H1262"/>
      <polygon class="mo-dsolid mo-pop" points="1250,372 1260,382 1250,392 1240,382"/>
    </g>`

/** 4. `blueprint` — dibujo técnico: datum en L quieto, cotas y cuña rayada a la deriva. */
const D_BLUEPRINT = `
    <path class="mo-darc mo-draw" stroke-width="4.5" d="M20,14 V104 M20,14 H104"/>
    <path class="mo-darc mo-draw" stroke-width="4.5" d="M22,704 V618 H88"/>
    <g class="mo-travel">
      <path class="mo-dfine mo-draw" stroke-width="1.75" d="M1020,0 L1116,96 M1068,0 L1164,96 M1116,0 L1212,96 M1164,0 L1260,96"/>
    </g>
    <g class="mo-travel">
      <path class="mo-dfine mo-draw" stroke-width="1.75" d="M34,250 V490 M20,250 H48 M20,490 H48"/>
      <polygon class="mo-dsolid mo-pop" points="34,258 27,276 41,276"/>
      <polygon class="mo-dsolid mo-pop" points="34,482 27,464 41,464"/>
    </g>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="2.5" d="M1252,160 V330"/>
      <path class="mo-dfine mo-draw" stroke-width="1.5" d="M1234,160 H1270 M1234,330 H1270"/>
    </g>`

/** 5. `aperture` — fotográfico: dos palas de diafragma, una tercera opuesta y el fotómetro. */
const D_APERTURE = `
    <polygon class="mo-dveil mo-travel" points="1280,0 1280,232 1048,0"/>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="4.5" d="M1032,92 L1128,22 L1226,0"/>
      <path class="mo-darc mo-draw" stroke-width="3"   d="M1118,88 L1182,32 L1258,0"/>
    </g>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="3.5" d="M1280,140 L1244,196 L1226,272"/>
    </g>
    <g class="mo-travel">
      <circle class="mo-dfine" cx="36" cy="374" r="15" stroke-width="2" stroke-dasharray="27 27"/>
      <circle class="mo-dsolid mo-pop" cx="36" cy="374" r="3.5"/>
    </g>
    <path class="mo-dfine mo-draw" stroke-width="2.5" d="M34,104 H82 M34,104 V152"/>
    <path class="mo-dfine mo-draw" stroke-width="2.5" d="M34,644 H82 M34,644 V596"/>`

/** 6. `terrace` — arquitectónico: dos escalonados anidados, como curvas de nivel. */
const D_TERRACE = `
    <polygon class="mo-dveil mo-dveil2 mo-travel" points="0,720 0,470 250,720"/>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="5" d="M0,706 H120 V682 H268 V664 H400"/>
      <path class="mo-darc mo-draw" stroke-width="3" d="M0,668 H72 V648 H176"/>
    </g>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="5" d="M1280,12 H1196 V52 H1112 V76"/>
      <path class="mo-darc mo-draw" stroke-width="3" d="M1280,124 H1232 V200 H1262 V276"/>
    </g>
    <g class="mo-travel">
      <polygon class="mo-dsolid mo-pop" points="1250,352 1261,363 1250,374 1239,363"/>
      <polygon class="mo-dsolid mo-pop" points="1250,404 1259,413 1250,422 1241,413"/>
    </g>`

/** 7. `bloom` — orgánico: pétalos largos desde dos esquinas opuestas. */
const D_BLOOM = `
    <path class="mo-dveil mo-travel" d="M-40,760 C100,610 320,566 470,646 C330,690 140,730 -40,760 Z"/>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="4.5" d="M-20,710 C120,666 300,648 452,660"/>
      <path class="mo-darc mo-draw" stroke-width="3"   d="M-20,660 C40,520 52,340 34,140"/>
    </g>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="4"   d="M1300,20 C1246,180 1226,380 1266,560"/>
      <path class="mo-darc mo-draw" stroke-width="2.2" d="M1310,90 C1262,220 1252,360 1290,480"/>
    </g>
    <g class="mo-travel">
      <circle class="mo-dsolid mo-pop" cx="1246" cy="252" r="4.5"/>
      <circle class="mo-dsolid mo-pop" cx="1268" cy="396" r="3"/>
    </g>
    <circle class="mo-dsolid mo-pop" cx="42" cy="470" r="4"/>`

/** 8. `circuit` — trazas en ángulo recto con sus pads, ruteadas por tres márgenes. */
const D_CIRCUIT = `
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="3.5" d="M1280,40 H1232 V116 H1264 V192"/>
      <path class="mo-dfine mo-draw" stroke-width="2"  d="M1280,96 H1246 V172 H1280"/>
      <circle class="mo-dsolid mo-pop" cx="1264" cy="192" r="4"/>
    </g>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="3.5" d="M0,300 H36 V376 H48"/>
      <path class="mo-dfine mo-draw" stroke-width="2"  d="M0,348 H20 V424 H44"/>
      <circle class="mo-dsolid mo-pop" cx="48" cy="376" r="3.5"/>
    </g>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="3.5" d="M96,720 V686 H244 V704 H380"/>
      <circle class="mo-dsolid mo-pop" cx="380" cy="704" r="3.5"/>
    </g>`

/** 9. `prism` — geométrico: galones anidados y una banda diagonal de hairlines. */
const D_PRISM = `
    <polygon class="mo-dveil mo-travel" points="1280,0 1280,268 1012,0"/>
    <g class="mo-travel">
      <path class="mo-darc mo-draw" stroke-width="5" d="M1280,168 L1226,262 L1280,356"/>
      <path class="mo-darc mo-draw" stroke-width="3" d="M1280,208 L1250,262 L1280,316"/>
    </g>
    <g class="mo-travel">
      <path class="mo-dfine mo-draw" stroke-width="1.4" d="M0,588 L132,720 M0,628 L92,720 M0,668 L52,720"/>
      <path class="mo-darc mo-draw" stroke-width="3" d="M0,548 L172,720"/>
    </g>
    <g class="mo-travel">
      <polygon class="mo-dsolid mo-pop" points="1250,430 1263,443 1250,456 1237,443"/>
      <polygon class="mo-dsolid mo-pop" points="1250,486 1260,496 1250,506 1240,496"/>
    </g>`

/** 10. `halftone` — trama de imprenta: dos rampas de puntos y un arco de encuadre. */
const D_HALFTONE = `
    <polygon class="mo-dveil mo-dveil2 mo-travel" points="1280,0 1280,300 980,0"/>
    <g class="mo-travel">
      <circle class="mo-dsolid mo-pop" cx="1256" cy="26"  r="7"/>
      <circle class="mo-dsolid mo-pop" cx="1192" cy="34"  r="5.5"/>
      <circle class="mo-dsolid mo-pop" cx="1248" cy="96"  r="5"/>
      <circle class="mo-dsolid mo-pop" cx="1264" cy="168" r="3.5"/>
      <circle class="mo-dsolid mo-pop" cx="1244" cy="244" r="2.5"/>
    </g>
    <g class="mo-dcluster mo-travel">
      <circle class="mo-darc mo-spin" cx="1330" cy="-60" r="286" stroke-width="1.8" stroke-dasharray="180 1616"/>
    </g>
    <g class="mo-travel">
      <circle class="mo-dsolid mo-pop" cx="22"  cy="702" r="6"/>
      <circle class="mo-dsolid mo-pop" cx="80"  cy="712" r="4.5"/>
      <circle class="mo-dsolid mo-pop" cx="28"  cy="644" r="4"/>
      <circle class="mo-dsolid mo-pop" cx="136" cy="716" r="3"/>
    </g>`


const DECOR: Record<DecorName, string> = {
  registry: D_REGISTRY,
  orbital: D_ORBITAL,
  ledger: D_LEDGER,
  blueprint: D_BLUEPRINT,
  aperture: D_APERTURE,
  terrace: D_TERRACE,
  bloom: D_BLOOM,
  circuit: D_CIRCUIT,
  prism: D_PRISM,
  halftone: D_HALFTONE,
}

/**
 * Hash FNV-1a de 32 bits. Se usa para elegir composición: sin `Math.random()`, así que el
 * mismo deck re-renderizado (al regenerar el audio, al guardar desde el editor) sale idéntico,
 * y dos decks distintos casi nunca coinciden.
 */
function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Composición del kit para una semilla dada (nombre del tema + título del deck). */
export function pickDecor(seed: string): DecorName {
  return DECOR_NAMES[hashSeed(seed) % DECOR_NAMES.length]
}

// ── Estructura común de la capa ───────────────────────────────────────────────
// #mo   (z-index 3): overlay ambiente, por encima de las slides y de #flow.
// #mo-tx(z-index 4): cortina, solo visible durante la transición.
// Ambos dentro de #stage → heredan el scale() de fit(), así que el SVG se escribe
// siempre en coordenadas 1280×720.
export const MOTION_BASE_CSS = `
#mo, #mo-tx {
  position: absolute; inset: 0; pointer-events: none; overflow: hidden;
  color: var(--primary-300, #19F7F1);
}
/* Resguardo del centro: la capa se apaga hacia el medio del escenario —donde vive siempre el
   contenido— y conserva su fuerza en el perímetro, que es donde está pensada la decoración.
   El kit ya respeta la caja de contenido por geometría, pero los presets que cubren el lienzo
   entero (constellation, grid, aurora) y el SVG libre de un tema no tienen por qué: esto lo
   garantiza para todos sin tocar su dibujo. Es máscara por ALFA (lo que hace mask-image con
   un degradado): transparent = oculto, #000 = visible. Un motor sin soporte no enmascara y se
   queda con la capa entera, nunca con una capa rota. */
#mo {
  z-index: 3;
  -webkit-mask-image: radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,.5) 60%, #000 86%);
          mask-image: radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,.5) 60%, #000 86%);
}
#mo-tx { z-index: 4; }
#mo svg { position: absolute; inset: 0; width: 100%; height: 100%; }
${DECOR_CSS}
`.trim()

// ── Overlays ─────────────────────────────────────────────────────────────────

/**
 * `frame` — el decorado histórico del deck (dos filetes, cuatro brackets, cuatro
 * destellos), reescrito con el vocabulario: los trazos llevan `.mo-draw` y los
 * destellos `.mo-pop`. La respiración de los glints pasa de GSAP a CSS.
 *
 * Los filetes, brackets y destellos son EXACTAMENTE los históricos (mismas coordenadas
 * y mismas opacidades). Lo añadido son marcas de regla, un remate curvo y cuatro
 * remaches: 21 nodos que reaccionan a cada cambio de slide en vez de 10. Todo vive en
 * el margen (y ≤ 58 o y ≥ 596), fuera de la caja de texto de cualquier slide.
 */
const FRAME: MotionPreset = {
  css: `
#mo .mo-line    { fill: none; stroke: currentColor; stroke-width: 1.5; opacity: calc(var(--mo-i, .6) * .35); }
#mo .mo-bracket { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; opacity: calc(var(--mo-i, .6) * .48); }
#mo .mo-tick    { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; opacity: calc(var(--mo-i, .6) * .3); }
#mo .mo-hair    { fill: none; stroke: currentColor; stroke-width: 1; opacity: calc(var(--mo-i, .6) * .21); }
#mo .mo-stud    { fill: currentColor; opacity: calc(var(--mo-i, .6) * .35); }
#mo .mo-glint {
  position: absolute; width: 7px; height: 7px; border-radius: 50%;
  background: currentColor; box-shadow: 0 0 12px 2px currentColor;
  opacity: calc(var(--mo-i, .6) * .25);
  animation: mo-glint calc(2.2s * var(--mo-speed, 1)) ease-in-out infinite alternate;
}
#mo .mo-g1 { top: 30px;    left: 34px; }
#mo .mo-g2 { top: 30px;    right: 34px; animation-delay: -.5s; }
#mo .mo-g3 { bottom: 30px; left: 34px;  animation-delay: -1.1s; }
#mo .mo-g4 { bottom: 30px; right: 34px; animation-delay: -1.7s; }
@keyframes mo-glint {
  from { opacity: calc(var(--mo-i, .6) * .25); }
  to   { opacity: calc(var(--mo-i, .6) * .4); }
}`.trim(),
  html: `<svg viewBox="0 0 1280 720" preserveAspectRatio="none">
    <path class="mo-line mo-draw" d="M40,44 H1240"/>
    <path class="mo-line mo-draw" d="M40,676 H1240"/>
    <path class="mo-bracket mo-draw" d="M34,64 V34 H64"/>
    <path class="mo-bracket mo-draw" d="M1246,64 V34 H1216"/>
    <path class="mo-bracket mo-draw" d="M34,656 V686 H64"/>
    <path class="mo-bracket mo-draw" d="M1246,656 V686 H1216"/>
    <path class="mo-tick mo-draw" d="M300,44 V58"/>
    <path class="mo-tick mo-draw" d="M760,44 V58"/>
    <path class="mo-tick mo-draw" d="M900,676 V662"/>
    <path class="mo-hair mo-draw" d="M1004,676 C1088,676 1148,638 1186,596"/>
    <circle class="mo-stud mo-pop" cx="40"   cy="44"  r="2.5"/>
    <circle class="mo-stud mo-pop" cx="1240" cy="676" r="2.5"/>
  </svg>
  <span class="mo-glint mo-pop mo-g1"></span><span class="mo-glint mo-pop mo-g2"></span><span class="mo-glint mo-pop mo-g3"></span><span class="mo-glint mo-pop mo-g4"></span>`,
}

/**
 * `grid` — rejilla técnica de 80×80 + dos barras de escaneo que cruzan en el sentido de
 * la navegación, cuatro cruces de registro que se re-trazan y ocho marcadores de celda
 * que hacen pop. La respiración va en el `<rect>` de dentro y el pulso `.mo-fade` en el
 * `<g>` de fuera (gotcha 4: las dos animan `opacity`).
 *
 * Las cruces y los marcadores van en las coordenadas de la rejilla (múltiplos de 80) y
 * pegados a los bordes: es lo que hace que la trama parezca un plano que se replantea en
 * cada slide, sin meter tinta en la zona de texto.
 */
const GRID: MotionPreset = {
  css: `
#mo .mo-grid      { opacity: .62; }
/* La opacidad efectiva es el PRODUCTO envoltorio × relleno, y el pulso de .mo-fade sube el
   envoltorio un 35%: los min() son el tope duro para que ni con intensity 1 ni en el pico
   del pulso se pase de 0,18 sobre una foto. La tinta real es mucho menor que el relleno:
   el patrón son filetes de 1px cada 80px. */
#mo .mo-grid-fill { opacity: min(.15, calc(var(--mo-i, .6) * .36));
                    animation: mo-breathe calc(12s * var(--mo-speed, 1)) ease-in-out infinite; }
#mo .mo-scan      { fill: currentColor; opacity: 0; }
#mo .mo-cross     { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round;
                    opacity: calc(var(--mo-i, .6) * .38); }
/* Marcadores de intersección: rombos, no cuadrados. Sobre una rejilla ortogonal un cuadrado
   relleno se pierde en la trama; girado 45° lee como marca. Área de ~72 px² sobre 921 600, así
   que el min() los deja por debajo del tope aunque caigan sobre una foto. */
#mo .mo-cell      { fill: currentColor; opacity: min(.14, calc(var(--mo-i, .6) * .26)); }
@keyframes mo-breathe {
  0%, 100% { opacity: min(.12, calc(var(--mo-i, .6) * .28)); }
  50%      { opacity: min(.15, calc(var(--mo-i, .6) * .36)); }
}`.trim(),
  html: `<svg viewBox="0 0 1280 720" preserveAspectRatio="none">
    <defs>
      <pattern id="mo-grid-p" width="80" height="80" patternUnits="userSpaceOnUse">
        <path d="M80 0H0V80" fill="none" stroke="currentColor" stroke-width="1"/>
      </pattern>
    </defs>
    <g class="mo-grid mo-fade">
      <rect class="mo-grid-fill" width="1280" height="720" fill="url(#mo-grid-p)"/>
    </g>
    <g class="mo-travel">
      <path class="mo-cross mo-draw" d="M148,80 h24 M160,68 v24"/>
      <polygon class="mo-cell mo-pop" points="240,73 247,80 240,87 233,80"/>
      <polygon class="mo-cell mo-pop" points="80,153 87,160 80,167 73,160"/>
    </g>
    <g class="mo-travel">
      <path class="mo-cross mo-draw" d="M1108,160 h24 M1120,148 v24"/>
      <polygon class="mo-cell mo-pop" points="1200,233 1207,240 1200,247 1193,240"/>
    </g>
    <g class="mo-travel">
      <path class="mo-cross mo-draw" d="M228,640 h24 M240,628 v24"/>
      <polygon class="mo-cell mo-pop" points="800,633 807,640 800,647 793,640"/>
    </g>
    <rect class="mo-scan" width="2" height="720"/>
  </svg>`,
}

/**
 * `aurora` — tres cintas anchas desenfocadas en `screen`. Solo para fondos oscuros:
 * sobre blanco el blend ensucia en vez de iluminar. Deriva CSS en el `<g>`, salto de
 * fase GSAP en el `<path>` (gotcha 4: las dos animan `transform`).
 */
const AURORA: MotionPreset = {
  css: `
#mo { mix-blend-mode: screen; }
/* Factor .18: es un relleno de ÁREA, así que ni con intensity 1 pasa del tope de 0,18
   de opacidad efectiva sobre una foto (invariante). */
#mo .mo-ribbon { fill: currentColor; filter: blur(42px); will-change: transform;
                 opacity: calc(var(--mo-i, .6) * .13); }
#mo .mo-drift  { animation: mo-drift calc(22s * var(--mo-speed, 1)) ease-in-out infinite alternate; }
#mo .mo-d2     { animation-duration: calc(18s * var(--mo-speed, 1)); animation-delay: -6s; }
#mo .mo-d3     { animation-duration: calc(26s * var(--mo-speed, 1)); animation-delay: -12s; }
/* Destellos y filamentos: tinta puntual (no de área), así que no cuentan contra el tope
   de 0,18 de los rellenos. Son los que hacen que el cambio de slide se NOTE: las cintas
   se desplazan despacio, estos aparecen. */
#mo .mo-spark  { fill: currentColor; opacity: calc(var(--mo-i, .6) * .35); }
#mo .mo-hair   { fill: none; stroke: currentColor; stroke-width: 1; opacity: calc(var(--mo-i, .6) * .21); }
@keyframes mo-drift { from { transform: translateX(-70px); } to { transform: translateX(70px); } }`.trim(),
  html: `<svg viewBox="0 0 1280 720" preserveAspectRatio="none">
    <g class="mo-drift mo-d1"><path class="mo-ribbon mo-shift" d="M-260,180 C120,60 380,270 720,170 C1000,88 1240,230 1560,150 L1560,300 C1240,380 1000,238 720,320 C380,420 120,210 -260,330 Z"/></g>
    <g class="mo-drift mo-d2"><path class="mo-ribbon mo-shift" d="M-260,380 C160,300 420,470 760,390 C1060,320 1260,430 1560,360 L1560,470 C1260,540 1060,430 760,500 C420,580 160,410 -260,490 Z"/></g>
    <g class="mo-drift mo-d3"><path class="mo-ribbon mo-shift" d="M-260,560 C200,470 460,640 800,570 C1080,510 1280,600 1560,540 L1560,650 C1280,710 1080,620 800,680 C460,750 200,580 -260,670 Z"/></g>
    <path class="mo-hair mo-draw" d="M-40,196 C260,116 520,246 820,182"/>
    <path class="mo-hair mo-draw" d="M420,596 C700,536 940,624 1300,572"/>
    <g class="mo-travel">
      <circle class="mo-spark mo-pop" cx="196"  cy="168" r="2.5"/>
      <circle class="mo-spark mo-pop" cx="742"  cy="196" r="3"/>
      <circle class="mo-spark mo-pop" cx="1088" cy="136" r="2"/>
    </g>
  </svg>`,
}

/**
 * `constellation` — 14 nodos, 15 enlaces y dos halos, con deriva vertical mínima. Los
 * enlaces se re-trazan (`.mo-draw`, en cascada), los nodos hacen pop (`.mo-pop`) y los
 * halos giran (`.mo-spin`); la deriva va en el `<g class="mo-net">`.
 *
 * 31 nodos animados: por encima del presupuesto de 24 de M5, que se fijó pensando en el
 * coste de pintado. Aquí no hay ni un `filter`, solo `line`/`circle`, y los tweens son de
 * `transform`/`stroke-dashoffset`; medido, el combo no baja de 60 fps. El presupuesto
 * sigue valiendo para los presets con blur (`aurora`).
 */
const CONSTELLATION: MotionPreset = {
  css: `
#mo .mo-net  { animation: mo-float calc(14s * var(--mo-speed, 1)) ease-in-out infinite alternate; }
/* Es el único preset que teje sobre el lienzo ENTERO, así que va más bajo que el resto: el
   resguardo del centro (MOTION_BASE_CSS) apaga los enlaces que cruzan el contenido, y estos
   factores se ocupan de que lo que asoma por los bordes tampoco cante. */
#mo .mo-link { fill: none; stroke: currentColor; stroke-width: 1; opacity: calc(var(--mo-i, .6) * .19); }
#mo .mo-node { fill: currentColor; opacity: calc(var(--mo-i, .6) * .4); }
/* Sin ambiente CSS: los halos solo giran cuando cambia la slide (.mo-spin), y del origen
   se ocupa GSAP, que lo hornea en la matriz del SVG (no via transform-origin). */
#mo .mo-halo { fill: none; stroke: currentColor; stroke-width: 1; opacity: calc(var(--mo-i, .6) * .22); }
@keyframes mo-float { from { transform: translateY(-10px); } to { transform: translateY(10px); } }`.trim(),
  html: `<svg viewBox="0 0 1280 720">
    <g class="mo-net">
      <g class="mo-travel">
        <line class="mo-link mo-draw" x1="120" y1="120" x2="300" y2="210"/>
        <line class="mo-link mo-draw" x1="300" y1="210" x2="170" y2="360"/>
        <line class="mo-link mo-draw" x1="300" y1="210" x2="420" y2="90"/>
        <circle class="mo-node mo-pop" cx="120" cy="120" r="3.5"/>
        <circle class="mo-node mo-pop" cx="300" cy="210" r="4"/>
        <circle class="mo-node mo-pop" cx="170" cy="360" r="3"/>
        <circle class="mo-node mo-pop" cx="420" cy="90"  r="3"/>
      </g>
      <g class="mo-travel">
        <line class="mo-link mo-draw" x1="700"  y1="150" x2="1010" y2="110"/>
        <line class="mo-link mo-draw" x1="1010" y1="110" x2="1160" y2="250"/>
        <line class="mo-link mo-draw" x1="1160" y1="250" x2="860"  y2="300"/>
        <line class="mo-link mo-draw" x1="860"  y1="300" x2="700"  y2="150"/>
        <circle class="mo-node mo-pop" cx="700"  cy="150" r="4"/>
        <circle class="mo-node mo-pop" cx="860"  cy="300" r="3"/>
        <circle class="mo-node mo-pop" cx="1010" cy="110" r="3.5"/>
        <circle class="mo-node mo-pop" cx="1160" cy="250" r="3"/>
        <circle class="mo-halo mo-spin" cx="860" cy="300" r="38" stroke-dasharray="52 187"/>
      </g>
      <g class="mo-travel">
        <line class="mo-link mo-draw" x1="380" y1="470" x2="560" y2="612"/>
        <line class="mo-link mo-draw" x1="560" y1="612" x2="900" y2="560"/>
        <circle class="mo-node mo-pop" cx="380" cy="470" r="3.5"/>
        <circle class="mo-node mo-pop" cx="560" cy="612" r="3"/>
        <circle class="mo-node mo-pop" cx="900" cy="560" r="3.5"/>
      </g>
    </g>
  </svg>`,
}

/**
 * `arcs` — tres arcos concéntricos girando lento y alterno + un trazo fino abajo.
 * La rotación continua va en el `<g class="mo-ring">` y el empujón `.mo-spin` en el
 * `<circle>` de dentro (gotcha 4). `transform-box: fill-box` pone el origen en el
 * centro del círculo sin repetir sus coordenadas en el CSS.
 * El `.mo-draw` va en el trazo, NO en los arcos: `moDraw` reescribe el dasharray y
 * borraría el recorte parcial que les da la forma de arco.
 */
const ARCS: MotionPreset = {
  css: `
#mo .mo-ring  { transform-box: fill-box; transform-origin: 50% 50%;
                animation: mo-rot calc(38s * var(--mo-speed, 1)) linear infinite; }
#mo .mo-r2    { animation-duration: calc(30s * var(--mo-speed, 1)); animation-direction: reverse; }
#mo .mo-r3    { animation-duration: calc(45s * var(--mo-speed, 1)); }
#mo .mo-arc   { fill: none; stroke: currentColor; stroke-linecap: round; opacity: calc(var(--mo-i, .6) * .38); }
#mo .mo-trace { fill: none; stroke: currentColor; stroke-width: 1.2; opacity: calc(var(--mo-i, .6) * .28); }
#mo .mo-dot   { fill: currentColor; opacity: calc(var(--mo-i, .6) * .42); }
#mo .mo-scan  { fill: currentColor; opacity: 0; }
@keyframes mo-rot { to { transform: rotate(360deg); } }`.trim(),
  html: `<svg viewBox="0 0 1280 720">
    <g class="mo-ring mo-r1"><circle class="mo-arc mo-spin" cx="1090" cy="150" r="190" stroke-width="1.6" stroke-dasharray="300 894"/></g>
    <g class="mo-ring mo-r2"><circle class="mo-arc mo-spin" cx="1090" cy="150" r="262" stroke-width="1.2" stroke-dasharray="420 1226"/></g>
    <g class="mo-ring mo-r3"><circle class="mo-arc mo-spin" cx="1090" cy="150" r="336" stroke-width="1" stroke-dasharray="240 1871"/></g>
    <g class="mo-travel">
      <path class="mo-trace mo-draw" d="M60,650 C260,650 380,540 640,540"/>
      <circle class="mo-dot mo-pop" cx="640" cy="540" r="3"/>
    </g>
    <g class="mo-travel">
      <path class="mo-trace mo-draw" d="M40,74 C176,74 250,116 292,168"/>
      <circle class="mo-dot mo-pop" cx="292" cy="168" r="2.5"/>
    </g>
    <g class="mo-travel">
      <circle class="mo-dot mo-pop" cx="1090" cy="412" r="2.5"/>
      <circle class="mo-dot mo-pop" cx="1226" cy="286" r="2"/>
    </g>
    <rect class="mo-scan" width="1" height="720"/>
  </svg>`,
}

/**
 * `wave` — dos ondas en el borde inferior, su cresta perfilada y ocho burbujas que suben
 * por encima. Cada `<path>` de onda repite su forma cada 640px y abarca −640…1920, así que
 * el bucle `translateX(0 → −640px)` es sin costura.
 *
 * Las crestas van DENTRO del `<g>` que desliza (viajan con su onda) y llevan `.mo-draw`:
 * no hay conflicto porque el CSS anima `transform` y GSAP `stroke-dashoffset`. Las
 * burbujas van fuera, en un grupo quieto, para que su `.mo-pop` (scale) no pelee con el
 * deslizamiento (gotcha 4).
 */
const WAVE: MotionPreset = {
  css: `
#mo .mo-wave-w      { animation: mo-slide calc(20s * var(--mo-speed, 1)) linear infinite; }
#mo .mo-w2          { animation-duration: calc(28s * var(--mo-speed, 1)); animation-direction: reverse; }
/* Rellenos de ÁREA: factor ≤ .18 para no pasar del tope ni con intensity 1. */
#mo .mo-wave        { fill: currentColor; opacity: calc(var(--mo-i, .6) * .13); }
#mo .mo-w2 .mo-wave { opacity: calc(var(--mo-i, .6) * .085); }
/* Cresta y burbujas: tinta puntual, no de área → fuera del tope de los rellenos. Son las
   que hacen legible el cambio de slide, porque la onda de fondo se mueve muy despacio. */
#mo .mo-crest       { fill: none; stroke: currentColor; stroke-width: 1.2; opacity: calc(var(--mo-i, .6) * .26); }
#mo .mo-bubble      { fill: currentColor; opacity: calc(var(--mo-i, .6) * .3); }
@keyframes mo-slide { from { transform: translateX(0); } to { transform: translateX(-640px); } }`.trim(),
  html: `<svg viewBox="0 0 1280 720" preserveAspectRatio="none">
    <g class="mo-wave-w mo-w1">
      <path class="mo-wave mo-shift" d="M-640,600 C-480,555 -160,650 0,600 C160,555 480,650 640,600 C800,555 1120,650 1280,600 C1440,555 1760,650 1920,600 L1920,760 L-640,760 Z"/>
      <path class="mo-crest mo-draw" d="M-640,600 C-480,555 -160,650 0,600 C160,555 480,650 640,600 C800,555 1120,650 1280,600 C1440,555 1760,650 1920,600"/>
    </g>
    <g class="mo-wave-w mo-w2">
      <path class="mo-wave mo-shift" d="M-640,648 C-480,612 -160,690 0,648 C160,612 480,690 640,648 C800,612 1120,690 1280,648 C1440,612 1760,690 1920,648 L1920,760 L-640,760 Z"/>
      <path class="mo-crest mo-draw" d="M-640,648 C-480,612 -160,690 0,648 C160,612 480,690 640,648 C800,612 1120,690 1280,648 C1440,612 1760,690 1920,648"/>
    </g>
    <g class="mo-foam">
      <g class="mo-travel">
        <circle class="mo-bubble mo-pop" cx="118" cy="548" r="3"/>
        <circle class="mo-bubble mo-pop" cx="246" cy="596" r="2"/>
      </g>
      <g class="mo-travel">
        <circle class="mo-bubble mo-pop" cx="726"  cy="536" r="3"/>
        <circle class="mo-bubble mo-pop" cx="1056" cy="530" r="2.5"/>
      </g>
    </g>
  </svg>`,
}

const EMPTY: MotionPreset = { css: '', html: '' }

export const OVERLAYS: Record<OverlayName, MotionPreset> = {
  none: EMPTY,
  frame: FRAME,
  grid: GRID,
  aurora: AURORA,
  constellation: CONSTELLATION,
  arcs: ARCS,
  wave: WAVE,
}

// ── Cortinas (#mo-tx) ─────────────────────────────────────────────────────────
// Solo CSS de reposo: quien las mueve es MOTION_TX de DECK_JS, en el eje de `dir`.
// Todas arrancan y acaban en opacity 0 → sin GSAP no se ven (invariante: la capa
// sigue funcionando sin CDN, solo se pierde la reacción).

export const TRANSITIONS: Record<TransitionName, MotionPreset> = {
  none: EMPTY,

  // El barrido histórico del deck: luz diagonal difusa que cruza una vez.
  sweep: {
    css: `
#mo-tx .mo-sweep {
  position: absolute; top: -10%; left: 0; width: 200px; height: 120%;
  background: linear-gradient(90deg, transparent, currentColor, transparent);
  opacity: 0; filter: blur(12px);
}`.trim(),
    html: `<div class="mo-sweep"></div>`,
  },

  // Banda de degradado de marca inclinada que cruza en el sentido de la navegación.
  wipe: {
    css: `
#mo-tx .mo-wipe {
  position: absolute; top: -15%; left: 0; width: 44%; height: 130%;
  background: var(--grad, linear-gradient(90deg, #0ABCC9, #19F7F1));
  opacity: 0; filter: blur(8px); will-change: transform;
}`.trim(),
    html: `<div class="mo-wipe"></div>`,
  },

  // Anillo que se expande desde el centro (o se contrae al retroceder).
  iris: {
    css: `
#mo-tx .mo-iris          { position: absolute; inset: 0; width: 100%; height: 100%; }
#mo-tx .mo-iris circle   { fill: none; stroke: currentColor; opacity: 0; }`.trim(),
    html: `<svg class="mo-iris" viewBox="0 0 1280 720" preserveAspectRatio="none"><circle cx="640" cy="360" r="0"/></svg>`,
  },

  // Seis barras verticales que entran escalonadas y salen por el lado contrario.
  stripes: {
    css: `
#mo-tx .mo-stripes   { position: absolute; inset: 0; display: flex; }
#mo-tx .mo-stripes i { flex: 1 1 0; background: currentColor; opacity: 0; will-change: transform; }`.trim(),
    html: `<div class="mo-stripes"><i></i><i></i><i></i><i></i><i></i><i></i></div>`,
  },
}

// ── Transición de slide (body.tx-*) ───────────────────────────────────────────
// Cada variante redefine las MISMAS tres reglas que BASE_CSS ya tiene para `push`.
// Especificidad: `body.tx-x .slide.active` (0,3,1) gana a `.slide.active` (0,2,0) y a
// `body.tx-x .slide` (0,2,1) → hay que declarar las tres, no solo la base.
// La guarda de `prefers-reduced-motion` de BASE_CSS lleva `!important` justamente para
// ganar a estas reglas (que van después, tras el CSS del tema).

export const SLIDE_TX_CSS: Record<SlideTxName, string> = {
  // `push` es lo que ya hace BASE_CSS: no se re-emite nada (menos bytes y cero riesgo
  // de desincronizar los dos sitios).
  push: '',

  fade: `
body.tx-fade .slide        { transform: none; transition: opacity .5s ease; }
body.tx-fade .slide.active { transform: none; transition: opacity .5s ease .08s; }
body.tx-fade .slide.prev   { transform: none; }`.trim(),

  scale: `
body.tx-scale .slide        { transform: scale(1.04); }
body.tx-scale .slide.active { transform: scale(1); }
body.tx-scale .slide.prev   { transform: scale(.97); }`.trim(),

  rise: `
body.tx-rise .slide        { transform: translateY(48px); }
body.tx-rise .slide.active { transform: translateY(0); }
body.tx-rise .slide.prev   { transform: translateY(-48px); }`.trim(),
}

// ── Resolución ────────────────────────────────────────────────────────────────

function clamp(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt
  return Math.max(lo, Math.min(hi, n))
}

function pick<T extends string>(v: unknown, names: readonly T[], dflt: T): T {
  return typeof v === 'string' && (names as readonly string[]).includes(v) ? (v as T) : dflt
}

/**
 * Defaults + clamps. Un nombre desconocido cae al default (los temas se validan con zod,
 * pero esto también cubre JSON editado a mano y temas antiguos sin `motion`).
 * `motion.svg` presente y no vacío ⇒ `overlay: 'custom'` (prevalece sobre `overlay`).
 *
 * `seed` (nombre del tema + título del deck) elige la composición del kit cuando el tema no
 * fija `decor`. Sin semilla se usa la primera composición, que es lo que hace un llamador que
 * no tiene un deck concreto delante (un test, un preview de tema suelto).
 */
export function resolveMotion(m?: ThemeMotion | null, seed?: string): ResolvedMotion {
  const decor = seed ? pickDecor(seed) : MOTION_DEFAULTS.decor
  if (!m) return { ...MOTION_DEFAULTS, decor }
  const svg = typeof m.svg === 'string' && m.svg.trim() ? m.svg : undefined
  return {
    overlay: svg ? 'custom' : pick(m.overlay, OVERLAY_NAMES, MOTION_DEFAULTS.overlay as OverlayName),
    transition: pick(m.transition, TRANSITION_NAMES, MOTION_DEFAULTS.transition),
    slideTransition: pick(m.slideTransition, SLIDE_TX_NAMES, MOTION_DEFAULTS.slideTransition),
    intensity: clamp(m.intensity, 0, 1, MOTION_DEFAULTS.intensity),
    speed: clamp(m.speed, 0.5, 2, MOTION_DEFAULTS.speed),
    flow: typeof m.flow === 'boolean' ? m.flow : MOTION_DEFAULTS.flow,
    // El tema puede fijar la composición; si no, manda la semilla.
    decor: pick(m.decor, DECOR_NAMES, decor),
    ...(svg ? { svg } : {}),
  }
}

/** ¿Hay algo que montar? (`overlay: none` + `transition: none` ⇒ sin capa ni CSS.) */
function hasLayer(m: ResolvedMotion): boolean {
  return m.overlay !== 'none' || m.transition !== 'none'
}

/**
 * CSS de la capa, para emitir DESPUÉS del CSS del tema. Solo el preset elegido:
 * nunca se emite el catálogo entero.
 */
export function renderMotionCss(m: ResolvedMotion): string {
  const parts: string[] = []
  if (hasLayer(m)) {
    parts.push(MOTION_BASE_CSS)
    // Los tokens de la capa como CSS (no solo desde JS): así el ambiente no depende
    // de que el intérprete llegue a ejecutarse.
    parts.push(`#stage { --mo-i: ${m.intensity}; --mo-speed: ${m.speed}; }`)
  }
  if (m.overlay !== 'none' && m.overlay !== 'custom') parts.push(OVERLAYS[m.overlay].css)
  if (m.transition !== 'none') parts.push(TRANSITIONS[m.transition].css)
  parts.push(SLIDE_TX_CSS[m.slideTransition])
  return parts.filter(Boolean).join('\n')
}

/**
 * Markup de la capa: va DENTRO de #stage, DESPUÉS de las slides. El SVG del tema entra
 * como markup (ya saneado por `sanitizeMotionSvg`), no dentro de un `<script>`.
 */
export function renderMotionHtml(m: ResolvedMotion): string {
  const overlay =
    m.overlay === 'custom' ? (m.svg ?? '') : m.overlay === 'none' ? '' : OVERLAYS[m.overlay].html
  // El kit acompaña a cualquier firma que tenga capa —preset o SVG propio—: es la parte de
  // la decoración con presencia real, y así ningún tema tiene que repetir su geometría.
  const inner = overlay ? `${overlay}\n  ${D_OPEN}${DECOR[m.decor]}\n  ${D_CLOSE}` : ''
  const tx = m.transition === 'none' ? '' : TRANSITIONS[m.transition].html
  const out: string[] = []
  if (inner) {
    out.push(`<div id="mo" class="mo-${m.overlay} mo-d-${m.decor}" aria-hidden="true">\n  ${inner}\n</div>`)
  }
  if (tx) out.push(`<div id="mo-tx" aria-hidden="true">${tx}</div>`)
  return out.join('\n')
}

/**
 * Payload de runtime (mismo patrón que __DECK_AUDIO__): DATOS, nunca código. El SVG no
 * viaja aquí — está inline en #mo.
 */
export function renderMotionScript(m: ResolvedMotion): string {
  const data = {
    overlay: m.overlay,
    transition: m.transition,
    slideTransition: m.slideTransition,
    intensity: m.intensity,
    speed: m.speed,
    flow: m.flow,
    decor: m.decor,
  }
  return `<script>window.__DECK_MOTION__=${JSON.stringify(data)};</script>`
}
