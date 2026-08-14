import { readdir, readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ThemeSchema, type Theme } from '../config/theme-schema.js'
import { sanitizeMotionSvg } from './sanitize-svg.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Carpeta `themes/` en la raíz (vale en dev con tsx y en dist).
const THEMES_DIR = join(__dirname, '..', '..', 'themes')

/**
 * Sanea el SVG libre de `motion.svg`. `loadTheme` y `listThemes` son los DOS únicos
 * caminos por los que un tema llega al render, así que sanear aquí cubre todo: ningún
 * SVG de tema toca el HTML sin pasar por el sanitizador.
 *
 * Fail-closed: si el resultado no es utilizable, se borra `motion.svg` y el tema cae a
 * su `overlay` (o al preset `frame` por defecto), con el warning en consola.
 */
function sanitizeThemeMotion(theme: Theme): Theme {
  const raw = theme.motion?.svg
  if (!theme.motion || !raw) return theme

  const { svg, warnings } = sanitizeMotionSvg(raw)
  for (const w of warnings) console.warn(`[motion] tema ${theme.name}: ${w}`)

  if (!svg) {
    const { svg: _discarded, ...rest } = theme.motion
    return { ...theme, motion: rest }
  }
  return { ...theme, motion: { ...theme.motion, svg } }
}

function parseTheme(raw: string): Theme {
  return sanitizeThemeMotion(ThemeSchema.parse(JSON.parse(raw)))
}

/** Carga un tema por nombre (sin extensión), validado con ThemeSchema. */
export async function loadTheme(name: string): Promise<Theme> {
  return parseTheme(await readFile(join(THEMES_DIR, `${name}.json`), 'utf8'))
}

/** Lista todos los temas disponibles en `themes/`. */
export async function listThemes(): Promise<Theme[]> {
  let entries: string[]
  try {
    entries = await readdir(THEMES_DIR)
  } catch {
    return []
  }
  const files = entries.filter((f) => f.endsWith('.json')).sort()
  return Promise.all(files.map(async (f) => parseTheme(await readFile(join(THEMES_DIR, f), 'utf8'))))
}
