import { imageSize } from 'image-size'
import type { ImageMediaType, ReferenceImageBlock } from './references.js'

/** Imagen placeholder ya procesada: id estable + orientación + data URI. */
export interface PlaceholderImage {
  id: string // "h1", "v2", … (prefijo = orientación)
  orientation: 'h' | 'v'
  dataUri: string
}

/** Archivo subido (buffer + tipo MIME). */
export interface UploadedImage {
  mimetype: string
  buffer: Buffer
}

const MEDIA_TYPES: Record<string, ImageMediaType> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
}

/** Normaliza el mimetype a uno de los aceptados por Claude (o null si no vale). */
export function normalizeMediaType(mimetype: string): ImageMediaType | null {
  return MEDIA_TYPES[mimetype.toLowerCase()] ?? null
}

export function toDataUri(buffer: Buffer, mediaType: ImageMediaType): string {
  return `data:${mediaType};base64,${buffer.toString('base64')}`
}

/** 'h' si la imagen es igual o más ancha que alta; 'v' en caso contrario. */
function detectOrientation(buffer: Buffer): 'h' | 'v' {
  try {
    const { width, height } = imageSize(buffer)
    if (width && height) return width >= height ? 'h' : 'v'
  } catch {
    // Si no se puede leer el tamaño, asumir horizontal.
  }
  return 'h'
}

/**
 * Procesa las imágenes placeholder subidas: detecta orientación, asigna ids
 * estables (h1, h2… / v1, v2…) y genera el data URI. Ignora formatos no válidos.
 */
export function processPlaceholders(files: UploadedImage[]): PlaceholderImage[] {
  const counters = { h: 0, v: 0 }
  const out: PlaceholderImage[] = []
  for (const f of files) {
    const mediaType = normalizeMediaType(f.mimetype)
    if (!mediaType) continue
    const orientation = detectOrientation(f.buffer)
    counters[orientation] += 1
    out.push({
      id: `${orientation}${counters[orientation]}`,
      orientation,
      dataUri: toDataUri(f.buffer, mediaType),
    })
  }
  return out
}

/** Convierte una imagen subida en un bloque `image` para Claude (o null si no vale). */
export function toReferenceBlock(file: UploadedImage): ReferenceImageBlock | null {
  const mediaType = normalizeMediaType(file.mimetype)
  if (!mediaType) return null
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: file.buffer.toString('base64') },
  }
}
