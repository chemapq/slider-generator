import type { FastifyInstance } from 'fastify'
import { generateSlides } from '../services/claude.js'
import { renderSlides, type DeckImages } from '../services/slides.js'
import { loadTheme, listThemes } from '../services/themes.js'
import {
  processPlaceholders,
  toReferenceBlock,
  type UploadedImage,
} from '../services/images.js'
import type { ReferenceImageBlock } from '../services/references.js'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

function isPdf(filename: string, mimetype: string): boolean {
  return mimetype === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')
}

function isLimitError(err: unknown): boolean {
  if (err === null || typeof err !== 'object' || !('code' in err)) return false
  const code = (err as { code: string }).code
  return code === 'FST_FILES_LIMIT' || code === 'FST_REQ_FILE_TOO_LARGE'
}

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  /** Lista los temas disponibles para el selector de la UI. */
  app.get('/api/themes', async (_req, reply) => {
    const themes = await listThemes()
    return reply.send(themes.map((t) => ({ name: t.name, label: t.label ?? t.name })))
  })

  /**
   * Recibe el PDF + imágenes placeholder + avatar + referencias (multipart),
   * llama a Claude y devuelve el deck HTML.
   *
   * Campos del form:
   *   file        → PDF (obligatorio)
   *   images      → imágenes placeholder (0..n)
   *   avatar      → avatar-tutor (0..1)
   *   references  → imágenes de estilo de refuerzo (0..n)
   *   theme       → nombre del tema (opcional; por defecto "timely-ai")
   */
  app.post('/api/generate', async (req, reply) => {
    let pdfBuffer: Buffer | null = null
    const placeholderFiles: UploadedImage[] = []
    const referenceFiles: UploadedImage[] = []
    let avatarFile: UploadedImage | null = null
    let themeName = 'timely-ai'

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer()
          const file: UploadedImage = { mimetype: part.mimetype, buffer }
          switch (part.fieldname) {
            case 'file':
              if (!isPdf(part.filename, part.mimetype)) {
                return reply.status(400).send({ error: 'El archivo principal debe ser un PDF.' })
              }
              pdfBuffer = buffer
              break
            case 'images':
              placeholderFiles.push(file)
              break
            case 'references':
              referenceFiles.push(file)
              break
            case 'avatar':
              avatarFile = file
              break
            // Otros campos de archivo se ignoran.
          }
        } else if (part.fieldname === 'theme' && typeof part.value === 'string' && part.value) {
          themeName = part.value
        }
      }
    } catch (err: unknown) {
      if (isLimitError(err)) {
        return reply
          .status(413)
          .send({ error: `Algún archivo supera el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB.` })
      }
      throw err
    }

    if (!pdfBuffer) {
      return reply.status(400).send({ error: 'Falta el PDF (campo "file").' })
    }

    const theme = await loadTheme(themeName).catch(async () => {
      const all = await listThemes()
      if (!all.length) throw new Error('No hay temas disponibles en themes/.')
      return all[0]!
    })

    // Procesar assets.
    const placeholders = processPlaceholders(placeholderFiles)
    const avatarUri = avatarFile
      ? `data:${avatarFile.mimetype};base64,${avatarFile.buffer.toString('base64')}`
      : undefined
    const referenceImages: ReferenceImageBlock[] = referenceFiles
      .map(toReferenceBlock)
      .filter((b): b is ReferenceImageBlock => b !== null)

    const deckImages: DeckImages = {
      placeholders: new Map(placeholders.map((p) => [p.id, p.dataUri])),
      avatar: avatarUri,
    }

    let html: string
    try {
      const slides = await generateSlides({
        pdfBase64: pdfBuffer.toString('base64'),
        theme,
        imageManifest: placeholders.map((p) => ({ id: p.id, orientation: p.orientation })),
        hasAvatar: avatarUri !== undefined,
        referenceImages,
      })
      html = renderSlides(slides, theme, deckImages)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(502).send({ error: `Error generando slides: ${msg}` })
    }

    reply.header('Content-Type', 'text/html; charset=utf-8')
    return reply.send(html)
  })
}
