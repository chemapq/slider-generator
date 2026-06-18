/**
 * Shell de reveal.js (autocontenido, núcleo sin tema). El aspecto lo da el CSS
 * del tema, inyectado en `<style>` tras el core. Lo usan tanto el render de
 * producción (`services/slides.ts`) como el builder de temas (`scripts/build-theme.ts`).
 */

const REVEAL_CDN = 'https://cdn.jsdelivr.net/npm/reveal.js@5/dist'

export interface DeckParts {
  title: string
  css: string
  /** Slides ya montadas como `<section>…</section>` concatenadas. */
  slides: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderDeck({ title, css, slides }: DeckParts): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${REVEAL_CDN}/reset.css">
<link rel="stylesheet" href="${REVEAL_CDN}/reveal.css">
<style>
${css}
</style>
</head>
<body>
<div class="reveal"><div class="slides">
${slides}
</div></div>
<script src="${REVEAL_CDN}/reveal.js"></script>
<script>Reveal.initialize({ center: false, hash: true, width: 1280, height: 720, margin: 0 });</script>
</body>
</html>
`
}
