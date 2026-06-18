import { readdir, readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ThemeSchema, type Theme } from '../config/theme-schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Carpeta `themes/` en la raíz (vale en dev con tsx y en dist).
const THEMES_DIR = join(__dirname, '..', '..', 'themes')

/** Carga un tema por nombre (sin extensión), validado con ThemeSchema. */
export async function loadTheme(name: string): Promise<Theme> {
  const raw = await readFile(join(THEMES_DIR, `${name}.json`), 'utf8')
  return ThemeSchema.parse(JSON.parse(raw))
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
  return Promise.all(
    files.map(async (f) => ThemeSchema.parse(JSON.parse(await readFile(join(THEMES_DIR, f), 'utf8')))),
  )
}
