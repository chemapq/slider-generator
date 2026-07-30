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
import {
  isUnsplashConfigured,
  resolveUnsplashSlots,
  pickUnsplashPhoto,
} from '../services/unsplash.js'
import {
  synthesizeDeck,
  voiceCacheKey,
  type DeckAudio,
  type SynthesizeOptions,
} from '../services/tts.js'
import { reviewDeck } from '../services/review.js'
import {
  putDeck,
  getDeck,
  updateDeckSlides,
  updateDeckNarrations,
  setDeckAudio,
  normNarration,
} from '../services/deck-store.js'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

/**
 * Etiqueta corta de una slide para el panel "Guion": el primer titular de su html,
 * sin marcado. Cadena vacía si la slide no tiene titular (la UI la numera igualmente).
 */
function slideLabel(html: string): string {
  const m = html.match(/<(h1|h2|h3|h4)\b[^>]*>([\s\S]*?)<\/\1>/i)
  if (!m) return ''
  return m[2]!
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

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
   *   images      → imágenes placeholder (0..n). Si no se sube ninguna y hay
   *                 UNSPLASH_ACCESS_KEY, la IA elige fotos de Unsplash (slots
   *                 data-img-query resueltos en servidor).
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

    // Sin imágenes subidas + Unsplash configurado → Claude marca slots
    // data-img-query y se resuelven aquí con fotos reales.
    const unsplashEnabled = placeholders.length === 0 && isUnsplashConfigured()

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
        unsplashEnabled,
      })

      // Resolver los slots data-img-query buscando y descargando fotos de
      // Unsplash. Los fallos son aislados: un slot sin foto queda con el
      // fondo degradado de fallback, nunca tumba la petición.
      // DIAGNÓSTICO: por qué (no) hay fotos de Unsplash. Mira estas líneas en la consola.
      const unsplashSlotCount = slides.slides.reduce(
        (n, s) => n + (s.html.match(/data-img-query/g)?.length ?? 0),
        0,
      )
      console.log(
        `[unsplash] enabled=${unsplashEnabled} imgSubidas=${placeholders.length} ` +
          `keyConfig=${isUnsplashConfigured()} slotsEnDeck=${unsplashSlotCount}`,
      )
      if (unsplashEnabled) {
        try {
          const result = await resolveUnsplashSlots(
            slides.slides.map((s) => s.html),
            deckImages.placeholders,
          )
          slides.slides.forEach((s, i) => {
            s.html = result.htmls[i]!
          })
          console.log(`[unsplash] resueltos=${result.resolved} fallidos=${result.failed}`)
          if (result.failed > 0 && result.resolved === 0) {
            reply.header(
              'X-Image-Warning',
              'No se pudieron obtener fotos de Unsplash; el deck usa fondos de relleno.',
            )
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn('[unsplash] fallo general resolviendo slots:', msg)
          reply.header(
            'X-Image-Warning',
            'No se pudieron obtener fotos de Unsplash; el deck usa fondos de relleno.',
          )
        }
      }

      // Revisión visual (2ª llamada por slide): renderiza cada slide, Claude la VE y
      // corrige contraste/legibilidad/solapes en sitio. Va DESPUÉS de resolver imágenes
      // (para revisar las fotos reales) y antes de render/putDeck. Aislada: si falla, el
      // deck sale sin corregir. Se puede desactivar con VISUAL_REVIEW=off.
      if (process.env.VISUAL_REVIEW !== 'off') {
        try {
          const rev = await reviewDeck(slides.slides, theme, deckImages)
          reply.header(
            'X-Review',
            `reviewed=${rev.reviewed};changed=${rev.changed};failed=${rev.failed}`,
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn('[review] fallo general de la revisión visual:', msg)
          reply.header('X-Review', 'error')
        }
      }

      // TTS: solo si voice=on y hay API key. Los fallos son aislados: generamos
      // el deck sin audio en lugar de tumbar toda la petición.
      let audio: DeckAudio | undefined
      const ttsOpts: SynthesizeOptions = {
        ...(voiceIdOverride && { voiceId: voiceIdOverride }),
        ...(modelIdOverride && { modelId: modelIdOverride }),
      }
      if (voiceEnabled && process.env.ELEVENLABS_API_KEY) {
        try {
          const narrations = slides.slides.map((s) => s.narration)
          audio = await synthesizeDeck(narrations, ttsOpts)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn('[tts] fallo general del servicio de voz:', msg)
          reply.header(
            'X-Voice-Warning',
            'Servicio de voz no disponible. El deck se generó sin audio.',
          )
        }
      }

      // El audio se guarda junto al deck (con la narración y la voz que lo produjeron):
      // al editar el guion, /api/audio solo re-sintetiza las slides que cambiaron.
      const deckId = putDeck({
        slides,
        themeName,
        images: deckImages,
        ...(audio && {
          audio,
          audioKey: voiceCacheKey(ttsOpts),
          audioNarrations: slides.slides.map((s) => normNarration(s.narration)),
        }),
      })
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
   * Actualiza el HTML de las slides de un deck ya generado (editor visual).
   * No toca slideClass, notes ni narration. No re-llama a Claude ni a TTS.
   *
   * Params: id (deckId)
   * Body JSON: { slides: string[] } — innerHTML limpio de cada slide, en orden.
   * Respuestas: 200 { ok, count } | 400 body inválido o longitud no coincide | 404 deck no encontrado
   */
  app.put('/api/deck/:id/slides', { bodyLimit: 25 * 1024 * 1024 }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { slides?: unknown }
    const slides = body?.slides

    if (!Array.isArray(slides) || !slides.every((s) => typeof s === 'string')) {
      return reply.status(400).send({ error: 'Body inválido: se espera { slides: string[] }.' })
    }

    const ctx = getDeck(id)
    if (!ctx) {
      return reply
        .status(404)
        .send({ error: 'El deck ya no está disponible en el servidor. Vuelve a generarlo.' })
    }

    if (slides.length !== ctx.slides.slides.length) {
      return reply.status(400).send({
        error: `Nº de slides no coincide (recibidas ${slides.length}, esperadas ${ctx.slides.slides.length}).`,
      })
    }

    updateDeckSlides(id, slides as string[])
    return reply.send({ ok: true, count: slides.length })
  })

  /**
   * Devuelve el guion de voz de un deck ya generado, slide a slide (panel "Guion").
   *
   * Params: id (deckId)
   * Respuestas: 200 { slides: [{ index, label, slideClass, narration, hasAudio }] }
   *             404 deck no encontrado
   *
   * `hasAudio` = esa slide tiene audio sintetizado en el store (la UI marca las mudas).
   */
  app.get('/api/deck/:id/narrations', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ctx = getDeck(id)
    if (!ctx) {
      return reply
        .status(404)
        .send({ error: 'El deck ya no está disponible en el servidor. Vuelve a generarlo.' })
    }

    return reply.send({
      slides: ctx.slides.slides.map((s, i) => ({
        index: i,
        label: slideLabel(s.html),
        slideClass: s.slideClass ?? '',
        narration: s.narration ?? '',
        hasAudio: Boolean(ctx.audio?.[i]),
      })),
    })
  })

  /**
   * Guarda el guion editado. No sintetiza nada: el audio se regenera aparte con
   * POST /api/audio, que re-sintetiza solo las slides cuya narración haya cambiado.
   *
   * Params: id (deckId)
   * Body JSON: { narrations: string[] } — una por slide, en orden ("" = slide sin narrar).
   * Respuestas: 200 { ok, count, changed } | 400 body inválido o longitud no coincide
   *             404 deck no encontrado
   */
  app.put('/api/deck/:id/narrations', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { narrations?: unknown }
    const narrations = body?.narrations

    if (!Array.isArray(narrations) || !narrations.every((n) => typeof n === 'string')) {
      return reply.status(400).send({ error: 'Body inválido: se espera { narrations: string[] }.' })
    }

    const ctx = getDeck(id)
    if (!ctx) {
      return reply
        .status(404)
        .send({ error: 'El deck ya no está disponible en el servidor. Vuelve a generarlo.' })
    }

    if (narrations.length !== ctx.slides.slides.length) {
      return reply.status(400).send({
        error: `Nº de slides no coincide (recibidas ${narrations.length}, esperadas ${ctx.slides.slides.length}).`,
      })
    }

    const changed = ctx.slides.slides.reduce(
      (n, s, i) => n + (normNarration(s.narration) === normNarration(narrations[i]) ? 0 : 1),
      0,
    )
    updateDeckNarrations(id, narrations as string[])
    return reply.send({ ok: true, count: narrations.length, changed })
  })

  /** Estado de Unsplash: la UI decide si el editor ofrece regenerar/buscar fotos. */
  app.get('/api/unsplash', async (_req, reply) => {
    return reply.send({ configured: isUnsplashConfigured() })
  })

  /**
   * Busca UNA foto en Unsplash para el editor visual (regenerar/reemplazar una
   * imagen del deck). No toca el deck-store: el cliente aplica la foto en el DOM
   * y persiste con PUT /api/deck/:id/slides al guardar.
   *
   * Body JSON: { query: string, orientation?: 'landscape'|'portrait', excludeIds?: string[] }
   * Respuestas: 200 { id, dataUri, photographer }
   *             400 falta query | 404 sin resultados | 409 sin configurar | 502 error de la API
   */
  app.post('/api/unsplash/photo', async (req, reply) => {
    if (!isUnsplashConfigured()) {
      return reply.status(409).send({ error: 'Unsplash no está configurado en el servidor.' })
    }

    const body = req.body as { query?: unknown; orientation?: unknown; excludeIds?: unknown }
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (!query) {
      return reply.status(400).send({ error: 'Falta la búsqueda (campo "query").' })
    }
    const orientation = body?.orientation === 'portrait' ? 'portrait' : 'landscape'
    const excludeIds = Array.isArray(body?.excludeIds)
      ? body.excludeIds.filter((x): x is string => typeof x === 'string')
      : []

    try {
      const pick = await pickUnsplashPhoto(query, orientation, excludeIds)
      if (!pick) {
        return reply.status(404).send({ error: `Sin resultados en Unsplash para "${query}".` })
      }
      return reply.send(pick)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(502).send({ error: `Error consultando Unsplash: ${msg}` })
    }
  })

  /**
   * Re-sintetiza el audio de un deck ya generado sin volver a llamar a Claude.
   *
   * Solo se sintetizan las slides cuya narración haya cambiado desde el último audio
   * (o que quedaran mudas por un fallo); el resto se reutiliza de la caché del deck-store.
   * Cambiar de voz o de modelo invalida la caché entera → se sintetiza todo.
   *
   * Body JSON: { deckId: string, voiceId?: string, subtitles?: boolean }
   * Response:  text/html (el deck con el nuevo audio embebido)
   * Headers:   X-Deck-Id (mismo id, reutilizable), X-Voice-Warning (si hubo degradación),
   *            X-Audio-Synth ("synthesized=N;reused=M;failed=K")
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

    const ttsOpts: SynthesizeOptions = {
      ...(voiceId && { voiceId }),
      ...(modelId && { modelId }),
    }
    const audioKey = voiceCacheKey(ttsOpts)

    // Reutilizable = misma voz/modelo + misma narración + ya tenía audio. Las slides
    // que quedaron mudas por un fallo NO se reutilizan: regenerar es su reintento.
    const cache = ctx.audioKey === audioKey ? ctx.audio : undefined
    const reused = narrations.map((n, i) => {
      const prev = cache?.[i]
      if (!prev) return null
      return ctx.audioNarrations?.[i] === normNarration(n) ? prev : null
    })
    // `undefined` → synthesizeDeck se la salta (no gasta petición ni cuota).
    const pending = narrations.map((n, i) => (reused[i] ? undefined : n))
    const pendingCount = pending.filter((n) => normNarration(n)).length

    let fresh: DeckAudio
    try {
      fresh = await synthesizeDeck(pending, ttsOpts)
    } catch (err) {
      if (isTransientApiError(err)) {
        return reply.status(503).send({
          error: 'Servicio de voz saturado. Espera unos segundos y vuelve a intentarlo.',
        })
      }
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(502).send({ error: `Error sintetizando audio: ${msg}` })
    }

    const audio: DeckAudio = fresh.map((a, i) => a ?? reused[i] ?? null)
    setDeckAudio(deckId, audio, audioKey, narrations.map(normNarration))

    const theme = await loadTheme(ctx.themeName).catch(async () => {
      const all = await listThemes()
      if (!all.length) throw new Error('No hay temas disponibles en themes/.')
      return all[0]!
    })

    const html = renderSlides(ctx.slides, theme, ctx.images, audio, {
      subtitles: subtitles !== false,
    })

    const reusedCount = reused.filter((a) => a !== null).length
    const failed = pending.filter((n, i) => normNarration(n) && !fresh[i]).length
    reply.header(
      'X-Audio-Synth',
      `synthesized=${pendingCount - failed};reused=${reusedCount};failed=${failed}`,
    )
    console.log(
      `[tts] regeneración deck=${deckId} sintetizadas=${pendingCount - failed} ` +
        `reutilizadas=${reusedCount} fallidas=${failed}`,
    )

    const allMute = audio.every((a) => a === null)
    if (allMute) {
      reply.header(
        'X-Voice-Warning',
        'Ninguna slide pudo sintetizarse. El deck se generó sin audio.',
      )
    } else if (failed > 0) {
      reply.header(
        'X-Voice-Warning',
        `${failed} slide(s) no pudieron sintetizarse y quedaron mudas. Vuelve a intentarlo.`,
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
