import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright-core'

/**
 * Captura de slides en un navegador headless para la revisión visual.
 *
 * NOTA (prototipo): resolvemos el ejecutable de Chromium desde la caché de
 * ms-playwright (la misma que usa la skill `verify`) o desde CHROMIUM_PATH. Para un
 * despliegue real conviene fijar el navegador (playwright install / imagen con Chromium).
 */
function resolveExecutable(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const home = process.env.HOME || ''
  const base = join(home, 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(base)) return undefined
  const dirs = readdirSync(base)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse()
  for (const d of dirs) {
    const exe = join(
      base,
      d,
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    )
    if (existsSync(exe)) return exe
  }
  return undefined
}

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise
  const executablePath = resolveExecutable()
  if (!executablePath) {
    throw new Error(
      'No se encontró Chromium para la captura. Ejecuta "npx playwright install chromium" o define CHROMIUM_PATH.',
    )
  }
  browserPromise = chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  })
  return browserPromise
}

/**
 * Renderiza el HTML autónomo de una slide (renderSingleSlide) y devuelve un PNG
 * 1280×720 en base64, listo para pasárselo a Claude como bloque de imagen.
 */
export async function screenshotSlideHtml(html: string): Promise<string> {
  const browser = await getBrowser()
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  })
  try {
    await page.setContent(html, { waitUntil: 'load' })
    // Esperar a que las fuentes (Poppins/Inter del tema) estén listas antes de capturar.
    await page
      .evaluate(() => (document.fonts ? document.fonts.ready.then(() => undefined) : undefined))
      .catch(() => {})
    await page.waitForTimeout(180)
    const stage = await page.$('#stage')
    const buf = stage
      ? await stage.screenshot({ type: 'png' })
      : await page.screenshot({ type: 'png' })
    return buf.toString('base64')
  } finally {
    await page.close()
  }
}

/** Cierra el navegador compartido (para tests o apagado del server). */
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return
  const b = await browserPromise
  browserPromise = null
  await b.close()
}
