import sanitizeHtml from 'sanitize-html'

/**
 * Sanitizador del SVG que puede traer un tema en `motion.svg`.
 *
 * ES EL LÍMITE DE SEGURIDAD de la capa de movimiento: es el ÚNICO camino por el que un
 * SVG escrito fuera del repo (tema derivado por Claude, tema editado a mano) llega al
 * HTML del deck. Nada de lo que salga de aquí puede ejecutar código ni salir a la red.
 *
 * Estrategia:
 *
 * - **Allowlist**, nunca blocklist: etiquetas y atributos enumerados; todo lo demás fuera.
 * - **Fail-closed**: si el resultado no es un `<svg>` utilizable (o se pasa de tamaño o de
 *   nodos), devuelve `''` y el llamador cae al preset del catálogo.
 * - **Namespacing**: los `id` sin prefijo `mo-` se renombran y se reescriben sus
 *   referencias (`url(#…)`, `href="#…"`). Las slides traen SVG escrito por Claude: un
 *   `id="grid"` duplicado rompería un `<pattern>`/`<clipPath>` en silencio.
 * - **Clases**: solo sobreviven las que empiezan por `mo-` (el vocabulario y los nombres
 *   propios del tema). Así el SVG del tema no puede engancharse al CSS de las slides.
 *
 * GOTCHA (la razón de `parser`): SVG es *case-sensitive* (`viewBox`, `patternUnits`,
 * `stdDeviation`, `gradientTransform`…). htmlparser2 baja tags y atributos a minúsculas
 * por defecto, y con `viewBox` convertido en `viewbox` el SVG entero se rompe EN SILENCIO.
 * `xmlMode` además hace que `<path/>` cierre solo: en modo HTML, las etiquetas
 * desconocidas se anidan unas dentro de otras (`<path><rect/></path>`) y el SVG resultante
 * deja de pintar la mitad de las formas.
 */

export interface SanitizeResult {
  /** SVG listo para inyectar como markup. `''` ⇒ inutilizable (el llamador cae al preset). */
  svg: string
  warnings: string[]
}

export interface SanitizeOpts {
  maxBytes?: number
  maxNodes?: number
}

const MAX_BYTES = 16 * 1024
const MAX_NODES = 60

/** Etiquetas permitidas. Fuera: script, style, foreignObject, image, text, animate*, a, iframe… */
const ALLOWED_TAGS = [
  'svg', 'g', 'defs', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'pattern', 'linearGradient', 'radialGradient', 'stop', 'mask', 'clipPath', 'symbol', 'use',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feFlood', 'feComposite',
  'feMerge', 'feMergeNode',
]

/**
 * Atributos permitidos: geometría y presentación. Ojo con la capitalización — es la
 * grafía SVG exacta, y la comparación de sanitize-html es sensible a mayúsculas.
 * Fuera: todo `on*`, `style`, `xlink:href`, `xmlns:*`. `href` solo sobrevive si apunta
 * a un fragmento (`#…`), y eso lo decide `transformAttribs`.
 */
const ALLOWED_ATTRS = [
  // geometría
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points',
  'width', 'height', 'viewBox', 'preserveAspectRatio', 'transform', 'transform-origin',
  // pintura
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'mix-blend-mode',
  // recortes, máscaras y filtros
  'filter', 'mask', 'clip-path', 'clipPathUnits',
  // degradados y patrones
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
  'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform',
  // primitivas de filtro
  'stdDeviation', 'in', 'in2', 'result', 'mode', 'type', 'values', 'operator',
  'dx', 'dy', 'flood-color', 'flood-opacity',
  // engancha con el CSS y con el vocabulario mo-*
  'class', 'id', 'href',
]

/** Se descartan con su contenido, no solo la etiqueta. */
const NON_TEXT_TAGS = [
  'script', 'style', 'textarea', 'option', 'noscript', 'template',
  'foreignObject', 'iframe', 'object', 'embed',
  'text', 'tspan', 'desc', 'title', 'metadata', 'a', 'image',
  'animate', 'animateTransform', 'animateMotion', 'set',
]

/** id/clase seguros: solo `[A-Za-z0-9_-]`, siempre con prefijo `mo-`. */
function prefixId(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9_-]/g, '')
  if (!clean) return ''
  return clean.startsWith('mo-') ? clean : `mo-${clean}`
}

/**
 * Reescribe `url(#x)` → `url(#mo-x)`. Devuelve `null` si el atributo contiene un `url(…)`
 * que NO es un fragmento interno (`fill="url(http://…)"` es un servidor de pintura remoto:
 * salida a la red por la puerta de atrás).
 */
function rewriteUrlRefs(value: string): string | null {
  if (!/url\(/i.test(value)) return value
  let ok = true
  const out = value.replace(/url\(([^)]*)\)/gi, (_m, inner: string) => {
    const ref = inner.trim().replace(/^['"]|['"]$/g, '')
    if (!ref.startsWith('#')) {
      ok = false
      return 'none'
    }
    const p = prefixId(ref.slice(1))
    if (!p) {
      ok = false
      return 'none'
    }
    return `url(#${p})`
  })
  // Un `url(` que no llegó a cerrar no lo ha visto el replace: fuera igualmente.
  if (!ok || /url\((?!#)/i.test(out)) return null
  return out
}

export function sanitizeMotionSvg(raw: string, opts?: SanitizeOpts): SanitizeResult {
  const maxBytes = opts?.maxBytes ?? MAX_BYTES
  const maxNodes = opts?.maxNodes ?? MAX_NODES
  const warnings: string[] = []
  const fail = (why: string): SanitizeResult => ({ svg: '', warnings: [...warnings, why] })

  if (typeof raw !== 'string' || !raw.trim()) return fail('motion.svg vacío')

  const inBytes = Buffer.byteLength(raw, 'utf8')
  if (inBytes > maxBytes) {
    return fail(`motion.svg pesa ${inBytes} B (tope ${maxBytes} B) → se descarta`)
  }

  let nodes = 0
  const droppedTags = new Set<string>()
  const droppedAttrs = new Set<string>()

  const clean = sanitizeHtml(raw, {
    // Ver GOTCHA de la cabecera: sin esto el SVG se rompe en silencio.
    parser: {
      xmlMode: true,
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
      recognizeSelfClosing: true,
    },
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { '*': ALLOWED_ATTRS },
    // Sin esquemas permitidos: ningún http:, data:, javascript:… sobrevive en `href`.
    allowedSchemes: [],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: NON_TEXT_TAGS,
    // Se ejecuta ANTES del filtro de allowlist, así que aquí se ve el markup crudo:
    // es donde se cuentan nodos, se renombran ids y se filtran clases y referencias.
    transformTags: {
      '*': (tagName: string, attribs: Record<string, string>) => {
        if (!ALLOWED_TAGS.includes(tagName)) droppedTags.add(tagName)
        else nodes++
        const out: Record<string, string> = {}
        for (const [name, value] of Object.entries(attribs)) {
          const low = name.toLowerCase()
          // Cinturón y tirantes: los `on*` ya se caen por allowlist, pero nunca deben
          // depender de una sola comprobación.
          if (low.startsWith('on') || low === 'style' || low.includes(':')) {
            droppedAttrs.add(name)
            continue
          }
          if (!ALLOWED_ATTRS.includes(name)) {
            droppedAttrs.add(name)
            continue
          }
          if (/javascript:|data:|expression\(/i.test(value)) {
            droppedAttrs.add(name)
            continue
          }
          if (name === 'id') {
            const p = prefixId(value)
            if (p) out.id = p
            continue
          }
          if (name === 'class') {
            const kept = value.split(/\s+/).filter((c) => /^mo-[A-Za-z0-9_-]*$/.test(c))
            if (kept.length) out.class = kept.join(' ')
            continue
          }
          if (name === 'href') {
            // Solo fragmentos internos (`<use href="#mo-x">`); nada de red.
            if (!value.startsWith('#')) {
              droppedAttrs.add('href')
              continue
            }
            const p = prefixId(value.slice(1))
            if (p) out.href = `#${p}`
            continue
          }
          const rewritten = rewriteUrlRefs(value)
          if (rewritten === null) {
            droppedAttrs.add(name)
            continue
          }
          out[name] = rewritten
        }
        return { tagName, attribs: out }
      },
    },
  })

  if (droppedTags.size) warnings.push(`etiquetas descartadas: ${[...droppedTags].join(', ')}`)
  if (droppedAttrs.size) warnings.push(`atributos descartados: ${[...droppedAttrs].join(', ')}`)

  if (nodes > maxNodes) return fail(`${nodes} nodos (tope ${maxNodes}) → se descarta`)

  const svg = clean.trim()
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    return fail('tras sanear no queda un <svg> raíz válido → se descarta')
  }

  // Auditoría final (nunca debería disparar): si algo de esto sigue ahí, el sanitizador
  // tiene un agujero y es mejor no emitir nada que emitirlo.
  if (/<script|<\/script|\son[a-z]+\s*=|foreignObject|xlink:|javascript:/i.test(svg)) {
    return fail('la salida contiene markup prohibido → se descarta (revisar sanitize-svg.ts)')
  }

  const outBytes = Buffer.byteLength(svg, 'utf8')
  if (outBytes > maxBytes) return fail(`la salida pesa ${outBytes} B (tope ${maxBytes} B)`)

  return { svg, warnings }
}
