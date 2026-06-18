import { z } from 'zod'

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
  }),

  typography: z.object({
    headingFont: z.string(),
    bodyFont: z.string(),
    // URLs de @import o <link> de fuentes (p. ej. Google Fonts)
    fontLinks: z.array(z.string()).optional(),
  }),

  // CSS que reproduce el diseño sobre reveal.js (selectores `.reveal …`).
  css: z.string(),
})

export type Theme = z.infer<typeof ThemeSchema>
