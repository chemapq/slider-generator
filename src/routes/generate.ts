import type { FastifyInstance } from 'fastify'
import { generateSlides } from '../services/claude.js'
import { renderSlides } from '../services/slides.js'
import { loadTheme, listThemes } from '../services/themes.js'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

function isPdf(filename: string, mimetype: string): boolean {
  return (
    mimetype === 'application/pdf' ||
    filename.toLowerCase().endsWith('.pdf')
  )
}

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  /** Lista los temas disponibles para el selector de la UI. */
  app.get('/api/themes', async (_req, reply) => {
    const themes = await listThemes()
    return reply.send(
      themes.map((t) => ({ name: t.name, label: t.label ?? t.name })),
    )
  })

  /** Recibe un PDF (multipart), llama a Claude y devuelve las slides en HTML. */
  app.post('/api/generate', async (req, reply) => {
    const data = await req.file({ limits: { fileSize: MAX_FILE_SIZE } })

    if (!data) {
      return reply.status(400).send({ error: 'No se recibió ningún archivo.' })
    }

    if (!isPdf(data.filename, data.mimetype)) {
      // Consumir el stream aunque no lo procesemos (Fastify lo requiere).
      await data.toBuffer()
      return reply.status(400).send({ error: 'El archivo debe ser un PDF.' })
    }

    let buffer: Buffer
    try {
      buffer = await data.toBuffer()
    } catch (err: unknown) {
      const isLimit =
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'FST_FILES_LIMIT'
      if (isLimit) {
        return reply
          .status(413)
          .send({ error: `El PDF supera el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB.` })
      }
      throw err
    }

    const pdfBase64 = buffer.toString('base64')

    // Tema: campo "theme" del form; por defecto el primero disponible.
    const themeName = (data.fields as Record<string, { value?: string }>)?.theme?.value
    const theme = await loadTheme(themeName ?? 'timely-ai').catch(async () => {
      const all = await listThemes()
      if (!all.length) throw new Error('No hay temas disponibles en themes/.')
      return all[0]!
    })

    let html: string
    try {
      const slides = await generateSlides(pdfBase64, theme)
      html = renderSlides(slides, theme)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(502).send({ error: `Error generando slides: ${msg}` })
    }

    reply.header('Content-Type', 'text/html; charset=utf-8')
    return reply.send(html)
  })
}
