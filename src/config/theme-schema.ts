import { z } from 'zod'
import { DECOR_NAMES, OVERLAY_NAMES, SLIDE_TX_NAMES, TRANSITION_NAMES } from '../templates/motion.js'

/**
 * Un "tema" es la versión JSON (barata de consumir) de un diseño de slides,
 * derivada una sola vez a partir de imágenes de referencia. En runtime se usa
 * el tema (tokens + CSS) en lugar de mandar las imágenes a Claude en cada llamada.
 */
export const ThemeSchema = z.object({
  name: z.string(), // id en kebab-case, p. ej. "timely-ai"
  label: z.string().optional(), // nombre legible para la UI
  description: z.string().optional(),
  source: z.array(z.string()).optional(), // imágenes de las que se derivó

  palette: z.object({
    background: z.string(),
    text: z.string(),
    muted: z.string().optional(),
    primary: z.string(),
    card: z.string().optional(),
    dark: z.string().optional(),
    // Color del anillo del avatar-tutor (p. ej. "#6C4CF1"). Por defecto usa `primary`.
    avatarRing: z.string().optional(),
  }),

  typography: z.object({
    headingFont: z.string(),
    bodyFont: z.string(),
    // URLs de @import o <link> de fuentes (p. ej. Google Fonts)
    fontLinks: z.array(z.string()).optional(),
  }),

  // CSS que estiliza el deck propio (selectores sobre .slide, .deck, etc.; NO `.reveal`).
  css: z.string(),

  /**
   * Firma de movimiento del tema: la capa SVG que el deck monta POR ENCIMA de las slides
   * (#mo) más la cortina de transición (#mo-tx) y la transición de slide.
   *
   * Dos caminos, excluyentes:
   *   - `svg`: firma propia, SVG libre. Pasa SIEMPRE por `sanitizeMotionSvg` al cargar el
   *     tema (services/themes.ts) — es el límite de seguridad. Prevalece sobre `overlay`.
   *     El ambiente (deriva, respiración, rotación lenta) se escribe en `css` con
   *     selectores `#mo .mo-…`; las custom properties `--mo-i` y `--mo-speed` están
   *     disponibles en `#stage`. Los nodos se marcan con el vocabulario `mo-*`
   *     (.mo-draw .mo-pop .mo-shift .mo-spin .mo-fade .mo-scan) para que el deck sepa
   *     cómo hacerlos reaccionar a cada cambio de slide. Ver templates/motion.ts.
   *   - `overlay`: preset del catálogo del repo.
   *
   * Sin `motion`, el deck se comporta como siempre (frame + sweep + push + orbes).
   */
  motion: z
    .object({
      svg: z.string().max(16384).optional(),
      overlay: z.enum(OVERLAY_NAMES).optional(),
      transition: z.enum(TRANSITION_NAMES).optional(),
      slideTransition: z.enum(SLIDE_TX_NAMES).optional(),
      intensity: z.number().min(0).max(1).optional(),
      speed: z.number().min(0.5).max(2).optional(),
      flow: z.boolean().optional(),
      /**
       * Fija la composición del kit de decoración. Lo normal es NO declararla: se sortea una
       * de las 10 con la semilla del deck, y así dos decks del mismo tema no se parecen.
       */
      decor: z.enum(DECOR_NAMES).optional(),
    })
    .optional(),
})

export type Theme = z.infer<typeof ThemeSchema>
