/**
 * Previews por tema, para juzgar a ojo la firma de movimiento (#mo) y la transición de
 * slide sin gastar Claude ni ElevenLabs.
 *
 *   npm run previews
 *
 * Escribe previews/<tema>.html —un deck de 6 slides por cada tema de themes/— y
 * previews/index.html para saltar entre ellos. Va por el pipeline REAL
 * (listThemes → renderSlides → renderDeck), así que lo que se ve aquí es exactamente lo
 * que verá un deck generado: mismo CSS, mismo intérprete, mismo `motion` saneado.
 *
 * Las 6 slides cubren los casos donde la capa se juzga de verdad: portada con degradado,
 * agenda de tarjetas claras, cifras sobre mucho blanco, divisor oscuro (donde más luce),
 * hueco de imagen (donde hay que vigilar el tope de opacidad) y cierre a sangre.
 *
 * No hay imágenes ni audio a propósito: el objeto es la capa de movimiento y la legibilidad,
 * no el relleno.
 */
import { mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { listThemes } from '../src/services/themes.js'
import { renderSlides } from '../src/services/slides.js'
import { DECOR_NAMES, pickDecor, type DecorName } from '../src/templates/motion.js'
import type { Slides } from '../src/config/schema.js'

/** Una línea por composición, para el índice. */
const DECOR_BLURB: Record<DecorName, string> = {
  registry: 'marcas de producción gráfica: corte, registro, escala y cotas',
  orbital: 'órbitas concéntricas y los puntos que las recorren',
  ledger: 'editorial: dobles filetes con remate y columnas de hairline',
  blueprint: 'dibujo técnico: cotas con flecha, datum en L y cuña rayada',
  aperture: 'fotográfico: palas de diafragma y marco de enfoque',
  terrace: 'arquitectónico: escalonados anidados, como curvas de nivel',
  bloom: 'orgánico: curvas largas de borde y dispersión de puntos',
  circuit: 'trazas en ángulo recto con sus pads, ruteadas por los márgenes',
  prism: 'geométrico: galones anidados y banda diagonal de hairlines',
  halftone: 'trama de imprenta: rampa de puntos creciente',
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'previews')

const BRANDBAR = `<div class="brandbar"><div class="brand"><div class="dot"></div><span>Preview</span></div></div>`
const ICO = `<div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M4 12h16M12 4v16"/></svg></div>`

/**
 * Deck fixture. Usa los COMPONENTES reales de los temas (`.brandbar`, `.card`, `.stat`,
 * `.imgbox`, `.blob`, los `slideClass` canónicos…) y `anim` por slide, porque el sitio donde
 * de verdad se juzga la capa de movimiento es sobre contenido denso: tarjetas claras, un
 * divisor oscuro y un hueco de imagen. Una columna con un titular suelto no dice nada.
 *
 * Sin imágenes: los huecos usan `<div class="media">`, que es el fallback documentado en el
 * prompt para cuando no hay foto.
 *
 * Los TAMAÑOS de `h1`/`h2`/`h3`/`.stat` van inline: los temas fijan familia, peso, tracking y
 * color, y dejan el tamaño a la slide (es lo que hace el prompt: «h1 (~50px)»). Sin el estilo
 * inline, un `.stat` sale del tamaño del cuerpo y la slide se ve mal por culpa del fixture, no
 * del tema.
 */
const FIXTURE: Slides = {
  title: 'Previews de tema',
  slides: [
    {
      // 1. Portada: el degradado de marca a la izquierda, texto a la derecha.
      slideClass: 'cover',
      html: `<div style="width:47%;background:var(--grad);position:relative;display:flex;align-items:center;justify-content:center">
        <div class="blob" style="right:-60px;bottom:-80px"></div>
        <div style="width:66%;aspect-ratio:4/5;border:2px dashed rgba(255,255,255,.5);border-radius:34px"></div>
      </div>
      <div style="width:53%;padding:0 80px;display:flex;flex-direction:column;justify-content:center;gap:20px">
        <p class="kicker">FIRMA DE MOVIMIENTO</p>
        <h1 style="font-size:50px">Cada tema se mueve distinto</h1>
        <p class="lead">Avanza y retrocede con ← / →: la decoración reacciona en el sentido de la navegación.</p>
        <div style="display:flex;align-items:center;gap:14px"><span class="btn">Empezar</span><span class="tag">6 slides</span></div>
      </div>`,
      anim: [
        { target: '.kicker', effect: 'blurIn', duration: 0.6 },
        { target: 'h1', effect: 'fadeUp', delay: 0.14 },
        { target: '.lead', effect: 'fadeUp', delay: 0.26 },
        { target: '.btn, .tag', effect: 'pop', delay: 0.4, stagger: 0.1 },
      ],
      notes: 'Portada. La capa tiene que convivir con el degradado sin ensuciarlo.',
    },
    {
      // 2. Agenda: 3 tarjetas, variantes de color. El caso más exigente para la capa.
      html: `${BRANDBAR}
      <div class="pad" style="display:flex;flex-direction:column;justify-content:center;gap:26px;width:100%">
        <div><p class="kicker">CONTENIDO</p><h2 style="font-size:40px">Tres bloques</h2></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px">
          <div class="card"><div class="num-badge">1.1</div>${ICO}<h3 style="font-size:22px">Overlay</h3><p>La capa ambiente sobre las slides.</p></div>
          <div class="card violet"><div class="num-badge">1.2</div>${ICO}<h3 style="font-size:22px">Cortina</h3><p>Cruza en el eje de la dirección.</p></div>
          <div class="card dark"><div class="num-badge">1.3</div>${ICO}<h3 style="font-size:22px">Transición</h3><p>La elige el tema.</p></div>
        </div>
      </div>`,
      anim: [
        { target: '.kicker, h2', effect: 'fadeUp', stagger: 0.1 },
        { target: '.card', effect: 'pop', delay: 0.24, stagger: 0.12 },
      ],
    },
    {
      // 3. Estadísticas: cifras grandes, mucho blanco → aquí se nota si la capa estorba.
      html: `${BRANDBAR}
      <div class="pad" style="display:flex;flex-direction:column;justify-content:center;gap:26px;width:100%">
        <h2 style="font-size:40px">Lo que se mide</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
          <div class="card"><div class="stat" style="font-size:64px">1,4 %</div><p class="lead">de tinta nítida sobre el escenario: el punto donde la decoración se ve sin competir.</p></div>
          <div class="card violet"><div class="stat" style="font-size:64px">33</div><p class="lead">nodos que reaccionan a cada cambio de slide en este tema.</p></div>
        </div>
      </div>`,
      anim: [
        { target: 'h2', effect: 'fadeUp' },
        { target: '.card', effect: 'fadeUp', delay: 0.2, stagger: 0.14 },
      ],
    },
    {
      // 4. Divisor oscuro: el contrapunto: aquí la capa se ve al máximo.
      slideClass: 'section-divider',
      html: `${BRANDBAR}
      <div style="width:62%;padding:0 80px;display:flex;flex-direction:column;justify-content:center;gap:18px">
        <p class="kicker">SEGUNDA PARTE</p>
        <h1 style="font-size:52px">Sobre fondo oscuro</h1>
        <p>Es donde la decoración luce más, así que es donde hay que vigilar que no se pase.</p>
      </div>
      <div style="width:38%;position:relative">
        <div class="blob" style="right:120px;bottom:-120px"></div>
        <div style="position:absolute;right:-30px;top:50%;transform:translateY(-50%);font-size:420px;font-weight:900;line-height:.8;color:rgba(255,255,255,.06)">2</div>
      </div>`,
      anim: [
        { target: '.kicker', effect: 'fadeRight' },
        { target: 'h1', effect: 'fadeUp', delay: 0.14 },
      ],
    },
    {
      // 5. Concepto con imagen: el hueco de foto a sangre, el caso del tope de opacidad.
      html: `${BRANDBAR}
      <div style="width:55%;padding:0 80px;display:flex;flex-direction:column;justify-content:center;gap:18px">
        <span class="tag">Sobre imagen</span>
        <h2 style="font-size:40px">El tope sobre foto</h2>
        <p class="lead">Los rellenos de área se quedan por debajo de 0,18 de opacidad efectiva; los trazos y los puntos pueden subir más porque ocupan muy poca superficie.</p>
      </div>
      <div style="width:45%;padding:38px 38px 38px 0">
        <div class="imgbox" style="width:100%;height:100%;position:relative">
          <div class="media" style="width:100%;height:100%;background:linear-gradient(120deg,#1b2430,#3a4a5e 55%,#141a22)"></div>
          <div class="ph-badge">imagen</div>
        </div>
      </div>`,
      anim: [
        { target: '.tag, h2, .lead', effect: 'fadeUp', stagger: 0.12 },
        { target: '.imgbox', effect: 'zoomIn', delay: 0.2 },
      ],
    },
    {
      // 6. Cierre: fondo de degradado a sangre.
      slideClass: 'closing',
      html: `<div class="blob" style="left:-100px;top:-80px"></div>
      <div class="blob" style="right:-120px;bottom:-100px"></div>
      <div style="width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:22px">
        <span class="tag">Fin del ejemplo</span>
        <h1 style="font-size:50px">Vuelve atrás con ←</h1>
        <p class="lead">La reacción se invierte: los trazos entran por el otro extremo y la cortina cruza al revés.</p>
      </div>`,
      anim: [
        { target: '.tag', effect: 'pop' },
        { target: 'h1', effect: 'fadeUp', delay: 0.16 },
        { target: '.lead', effect: 'fadeIn', delay: 0.3 },
      ],
    },
  ],
} as unknown as Slides

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Nodos marcados con el vocabulario dentro de la capa `#mo` del HTML generado. */
function countMarks(html: string): number {
  const open = html.indexOf('<div id="mo"')
  if (open < 0) return 0
  const close = html.indexOf('</div>', html.indexOf('</svg>', open))
  const layer = html.slice(open, close < 0 ? undefined : close)
  return (layer.match(/\bmo-(?:draw|pop|shift|spin|fade|scan)\b/g) || []).length
}

const themes = await listThemes()
if (!themes.length) {
  console.error('No hay temas en themes/. Nada que previsualizar.')
  process.exit(1)
}

await mkdir(OUT, { recursive: true })

const rows: string[] = []
for (const theme of themes) {
  const file = `${slug(theme.name)}.html`
  const html = renderSlides(FIXTURE, theme)
  await writeFile(join(OUT, file), html, 'utf8')

  // Cuenta de nodos que REACCIONAN al cambio de slide: es el número que explica si un
  // tema se siente vivo o quieto, así que se informa aquí en vez de tener que medirlo.
  // Solo dentro de #mo: el intérprete de DECK_JS también nombra las clases mo-* (en los
  // querySelectorAll y en los comentarios), y contarlas inflaría la cifra.
  const marked = countMarks(html)
  const m = theme.motion
  const firma = m?.svg ? 'svg propio' : (m?.overlay ?? 'frame')
  // Composición del kit que le toca a ESTE deck: la misma semilla que usa renderSlides.
  const decor = m?.decor ?? pickDecor(`${theme.name}|${FIXTURE.title}`)
  console.log(
    `${theme.name.padEnd(14)} ${firma.padEnd(13)} cortina=${(m?.transition ?? 'sweep').padEnd(8)} ` +
      `slide=${(m?.slideTransition ?? 'push').padEnd(6)} kit=${decor.padEnd(10)} ${marked} marcas → previews/${file}`,
  )
  rows.push(
    `<li><a href="${file}">${theme.label || theme.name}</a>` +
      `<span>${firma} · cortina ${m?.transition ?? 'sweep'} · slide ${m?.slideTransition ?? 'push'} · kit ${decor} · ${marked} marcas</span></li>`,
  )
}

/**
 * Una página por composición del kit, todas con el mismo tema, para poder comparar las 10 a
 * ojo. En un deck real la composición la sorteа la semilla; aquí se fija con `decor` porque el
 * objeto es verlas todas.
 *
 * El tema es elegible —`npm run previews -- --kit meridian`— porque una composición se
 * comporta distinto sobre papel que sobre medianoche, y revisarlas solo sobre uno de los dos
 * es exactamente cómo se coló la ronda de grosores que hubo que deshacer. Por defecto va el
 * oscuro, que es donde más se ve.
 */
const kitRows: string[] = []
const kitArg = process.argv.indexOf('--kit')
const kitName = kitArg > -1 ? process.argv[kitArg + 1] : 'aurora-noir'
const kitTheme = themes.find((t) => t.name === kitName) ?? themes.find((t) => t.name === 'aurora-noir') ?? themes[0]
if (kitArg > -1 && kitTheme.name !== kitName) console.warn(`[previews] no hay tema «${kitName}»; el kit va sobre ${kitTheme.name}`)
for (const decor of DECOR_NAMES) {
  const file = `kit-${decor}.html`
  const theme = { ...kitTheme, motion: { ...kitTheme.motion, decor } }
  await writeFile(join(OUT, file), renderSlides(FIXTURE, theme), 'utf8')
  kitRows.push(`<li><a href="${file}">${decor}</a><span>${DECOR_BLURB[decor]}</span></li>`)
}
console.log(`\n10 composiciones del kit sobre «${kitTheme.label || kitTheme.name}» → previews/kit-*.html`)

await writeFile(
  join(OUT, 'index.html'),
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Previews de tema</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Poppins', system-ui, sans-serif; background: #011932; color: #E2E6F2;
         min-height: 100vh; display: grid; place-items: center; padding: 48px 24px; }
  main { width: 100%; max-width: 560px; }
  h1 { font-size: 26px; font-weight: 600; margin-bottom: 6px; }
  h2 { font-size: 15px; font-weight: 600; color: #72A3C4; text-transform: uppercase;
       letter-spacing: .08em; margin: 34px 0 12px; }
  p.sub { color: #72A3C4; font-size: 14px; margin-bottom: 28px; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  li { background: #012142; border: 1px solid #27334F; border-radius: 12px;
       padding: 14px 18px; display: flex; flex-direction: column; gap: 4px; }
  li:hover { border-color: #0ABCC9; }
  a { color: #19F7F1; text-decoration: none; font-weight: 500; font-size: 16px; }
  span { color: #72A3C4; font-size: 12.5px; }
  footer { margin-top: 26px; color: #4E7EA5; font-size: 12.5px; }
</style>
</head>
<body>
<main>
  <h1>Previews de tema</h1>
  <p class="sub">Generados con <code>npm run previews</code>. Navega con ← / → para ver la capa de movimiento reaccionar.</p>
  <h2>Los 5 temas</h2>
  <ul>
${rows.map((r) => `    ${r}`).join('\n')}
  </ul>
  <h2>Las 10 composiciones del kit</h2>
  <p class="sub">Sobre ${kitTheme.label || kitTheme.name}, para comparar. En un deck real se sortea una con la semilla
  <code>tema|título</code>, así que dos decks distintos casi nunca coinciden y el mismo deck re-renderizado no cambia.</p>
  <ul>
${kitRows.map((r) => `    ${r}`).join('\n')}
  </ul>
  <footer>«marcas» = nodos con clase <code>mo-*</code> que reaccionan a cada cambio de slide.</footer>
</main>
</body>
</html>
`,
  'utf8',
)

console.log(`\n${themes.length} previews en previews/ — abre previews/index.html`)
