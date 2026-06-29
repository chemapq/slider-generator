import type { FastifyInstance } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { generateSlides } from '../services/claude.js'
import { renderSlides, type DeckImages } from '../services/slides.js'
import { loadTheme, listThemes } from '../services/themes.js'
import {
  processPlaceholders,
  toReferenceBlock,
  type UploadedImage,
} from '../services/images.js'
import type { ReferenceImageBlock } from '../services/references.js'
import { synthesizeDeck, type DeckAudio } from '../services/tts.js'
import { putDeck, getDeck } from '../services/deck-store.js'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

function isPdf(filename: string, mimetype: string): boolean {
  return mimetype === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')
}

function isLimitError(err: unknown): boolean {
  if (err === null || typeof err !== 'object' || !('code' in err)) return false
  const code = (err as { code: string }).code
  return code === 'FST_FILES_LIMIT' || code === 'FST_REQ_FILE_TOO_LARGE'
}

/**
 * Errores transitorios de la API de Claude (saturación, límite de tasa, 5xx,
 * fallo de conexión). El SDK ya reintenta, así que si llegan aquí es que han
 * persistido: conviene pedir al usuario que reintente en unos segundos.
 */
function isTransientApiError(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true
  if (err instanceof Anthropic.APIError) {
    const status = err.status
    if (status === 429 || (typeof status === 'number' && status >= 500)) return true
    if ((err as { type?: string }).type === 'overloaded_error') return true
  }
  return false
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
   *   references  → imágenes de estilo (0..n). Si hay alguna, se pasan al generador
   *                 como GUÍA DE DISEÑO: Claude compone las slides parecidas a ellas
   *                 (modo libre). No derivan un tema; el tema solo aporta el contrato
   *                 de tokens base.
   *   theme       → nombre del tema (opcional; por defecto "timely-ai").
   *   voice       → "on" para activar narración TTS (requiere ELEVENLABS_API_KEY).
   *   subtitles   → "on"/"off" — estado inicial de subtítulos en el deck (default "on").
   *   voiceId     → voice ID de ElevenLabs (sobreescribe ELEVENLABS_VOICE_ID del env).
   */
  app.post('/api/generate', async (req, reply) => {
    let pdfBuffer: Buffer | null = null
    const placeholderFiles: UploadedImage[] = []
    const referenceFiles: UploadedImage[] = []
    let avatarFile: UploadedImage | null = null
    let themeName = 'timely-ai'
    let voiceEnabled = false
    let subtitlesEnabled = true
    let voiceIdOverride: string | undefined
    let modelIdOverride: string | undefined

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
        } else if (typeof part.value === 'string') {
          if (part.fieldname === 'theme' && part.value) themeName = part.value
          else if (part.fieldname === 'voice') voiceEnabled = part.value === 'on'
          else if (part.fieldname === 'subtitles') subtitlesEnabled = part.value !== 'off'
          else if (part.fieldname === 'voiceId' && part.value) voiceIdOverride = part.value
          else if (part.fieldname === 'modelId' && part.value) modelIdOverride = part.value
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

    // El tema aporta el contrato de tokens base (colores, tipografía, componentes).
    // Si hay imágenes de referencia, NO se deriva un tema de ellas: se pasan tal cual
    // al generador como guía de diseño (modo libre), y Claude compone parecido a ellas.
    let html: string
    try {
      const theme = await loadTheme(themeName).catch(async () => {
        const all = await listThemes()
        if (!all.length) throw new Error('No hay temas disponibles en themes/.')
        return all[0]!
      })

      const slides = await generateSlides({
        pdfBase64: pdfBuffer.toString('base64'),
        theme,
        imageManifest: placeholders.map((p) => ({ id: p.id, orientation: p.orientation })),
        hasAvatar: avatarUri !== undefined,
        // Con referencias, se reenvían al generador para que Claude imite su estilo y
        // layout (modo libre). Sin referencias, el array va vacío (modo estricto).
        referenceImages,
      })

      // TTS: solo si voice=on y hay API key. Los fallos son aislados: generamos
      // el deck sin audio en lugar de tumbar toda la petición.
      let audio: DeckAudio | undefined
      if (voiceEnabled && process.env.ELEVENLABS_API_KEY) {
        try {
          const narrations = slides.slides.map((s) => s.narration)
          audio = await synthesizeDeck(narrations, {
            ...(voiceIdOverride && { voiceId: voiceIdOverride }),
            ...(modelIdOverride && { modelId: modelIdOverride }),
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn('[tts] fallo general del servicio de voz:', msg)
          reply.header(
            'X-Voice-Warning',
            'Servicio de voz no disponible. El deck se generó sin audio.',
          )
        }
      }

      const deckId = putDeck({ slides, themeName, images: deckImages })
      reply.header('X-Deck-Id', deckId)

      html = renderSlides(slides, theme, deckImages, audio, { subtitles: subtitlesEnabled })
    } catch (err: unknown) {
      if (isTransientApiError(err)) {
        return reply.status(503).send({
          error:
            'El servicio de Claude está saturado ahora mismo (overloaded). ' +
            'Espera unos segundos y vuelve a intentarlo.',
        })
      }
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(502).send({ error: `Error generando slides: ${msg}` })
    }

    reply.header('Content-Type', 'text/html; charset=utf-8')
    return reply.send(html)
  })

  /**
   * Re-sintetiza el audio de un deck ya generado sin volver a llamar a Claude.
   *
   * Body JSON: { deckId: string, voiceId?: string, subtitles?: boolean }
   * Response:  text/html (el deck con el nuevo audio embebido)
   * Headers:   X-Deck-Id (mismo id, reutilizable), X-Voice-Warning (si hubo degradación)
   *
   * Errores:
   *   404  → deckId no encontrado (server reiniciado / expirado / id inválido)
   *   409  → ELEVENLABS_API_KEY no configurada
   *   502  → TTS falló por completo tras reintentos (la UI conserva el deck anterior)
   */
  app.post('/api/audio', async (req, reply) => {
    const body = req.body as { deckId?: string; voiceId?: string; modelId?: string; subtitles?: boolean }
    const { deckId, voiceId, modelId, subtitles } = body ?? {}

    if (!deckId || typeof deckId !== 'string') {
      return reply.status(400).send({ error: 'Falta deckId.' })
    }

    const ctx = getDeck(deckId)
    if (!ctx) {
      return reply.status(404).send({
        error: 'El deck ya no está disponible en el servidor. Vuelve a generarlo.',
      })
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return reply.status(409).send({ error: 'El servicio de voz no está configurado.' })
    }

    const narrations = ctx.slides.slides.map((s) => s.narration)
    const allEmpty = narrations.every((n) => !n?.trim())
    if (allEmpty) {
      reply.header('X-Voice-Warning', 'El deck no tiene narración que locutar.')
      reply.header('X-Deck-Id', deckId)
      const theme = await loadTheme(ctx.themeName).catch(async () => {
        const all = await listThemes()
        if (!all.length) throw new Error('No hay temas disponibles en themes/.')
        return all[0]!
      })
      const html = renderSlides(ctx.slides, theme, ctx.images, undefined, {
        subtitles: subtitles !== false,
      })
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
    }

    let audio: DeckAudio
    try {
      audio = await synthesizeDeck(narrations, {
        ...(voiceId && { voiceId }),
        ...(modelId && { modelId }),
      })
    } catch (err) {
      if (isTransientApiError(err)) {
        return reply.status(503).send({
          error: 'Servicio de voz saturado. Espera unos segundos y vuelve a intentarlo.',
        })
      }
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(502).send({ error: `Error sintetizando audio: ${msg}` })
    }

    const theme = await loadTheme(ctx.themeName).catch(async () => {
      const all = await listThemes()
      if (!all.length) throw new Error('No hay temas disponibles en themes/.')
      return all[0]!
    })

    const html = renderSlides(ctx.slides, theme, ctx.images, audio, {
      subtitles: subtitles !== false,
    })

    const allMute = audio.every((a) => a === null)
    if (allMute) {
      reply.header(
        'X-Voice-Warning',
        'Ninguna slide pudo sintetizarse. El deck se generó sin audio.',
      )
    }

    reply.header('X-Deck-Id', deckId)
    reply.header('Content-Type', 'text/html; charset=utf-8')
    return reply.send(html)
  })

  /**
   * Lista las voces disponibles para el selector de la UI.
   * Lee ELEVENLABS_VOICES (JSON array de {id, label}) del entorno.
   * Si no está definida pero sí ELEVENLABS_VOICE_ID, devuelve esa como "Voz por defecto".
   */
  app.get('/api/voices', async (_req, reply) => {
    const configured = Boolean(process.env.ELEVENLABS_API_KEY)
    let voices: { id: string; label: string }[] = []

    const raw = process.env.ELEVENLABS_VOICES
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          voices = parsed.filter(
            (v): v is { id: string; label: string } =>
              typeof v === 'object' && v !== null && typeof v.id === 'string' && typeof v.label === 'string',
          )
        }
      } catch {
        // ELEVENLABS_VOICES malformado: devolvemos array vacío (no rompemos)
      }
    }

    if (!voices.length && process.env.ELEVENLABS_VOICE_ID) {
      voices = [{ id: process.env.ELEVENLABS_VOICE_ID, label: 'Voz por defecto' }]
    }

    return reply.send({ configured, voices })
  })
}
