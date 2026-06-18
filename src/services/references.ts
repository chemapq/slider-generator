import { readdir, readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Carpeta `references/` en la raíz del proyecto (vale en dev con tsx y en dist).
const REFERENCES_DIR = join(__dirname, '..', '..', 'references')

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface ReferenceImageBlock {
  type: 'image'
  source: { type: 'base64'; media_type: ImageMediaType; data: string }
}

const MEDIA_TYPES: Record<string, ImageMediaType> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/**
 * Lee las imágenes de slides de referencia de `references/`, las pasa a base64
 * y devuelve bloques `image` listos para enviar a Claude. Ordena por nombre
 * para que el prefijo del prompt sea estable (prompt caching).
 */
export async function loadReferenceImages(): Promise<ReferenceImageBlock[]> {
  let entries: string[]
  try {
    entries = await readdir(REFERENCES_DIR)
  } catch {
    return []
  }

  const files = entries
    .filter((name) => MEDIA_TYPES[extname(name).toLowerCase()] !== undefined)
    .sort()

  return Promise.all(
    files.map(async (name) => {
      const buffer = await readFile(join(REFERENCES_DIR, name))
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: MEDIA_TYPES[extname(name).toLowerCase()]!,
          data: buffer.toString('base64'),
        },
      }
    }),
  )
}
