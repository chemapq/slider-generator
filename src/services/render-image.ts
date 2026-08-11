import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright-core'

/**
 * Captura de slides en un navegador headless para la revisión visual.
 *
 * Resolvemos el ejecutable de Chromium desde `CHROMIUM_PATH`, desde la ruta que fije
 * `PLAYWRIGHT_BROWSERS_PATH` o desde la caché por defecto de ms-playwright (la misma que
 * usa la skill `verify`). Contempla macOS y Linux: en el contenedor de un PaaS la caché
 * vive en `~/.cache/ms-playwright` y el binario es `chrome-linux/chrome`, no un .app.
 *
 * Si no hay navegador, `getBrowser()` lanza y la revisión visual queda desactivada de
 * hecho (el llamador la trata como fallo aislado). En un despliegue sin Chromium conviene
 * apagarla explícitamente con `VISUAL_REVIEW=off` para no perder tiempo intentándolo.
 */
const CANDIDATE_BINARIES = [
  // Linux (contenedores, Render)
  join('chrome-linux', 'chrome'),
  join('chrome-linux64', 'chrome'),
  // macOS
  join('chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
  join('chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
]

function browserCacheDirs(): string[] {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return [process.env.PLAYWRIGHT_BROWSERS_PATH]
  const home = process.env.HOME || ''
  if (!home) return []
  return [join(home, '.cache', 'ms-playwright'), join(home, 'Library', 'Caches', 'ms-playwright')]
}

function resolveExecutable(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH

  for (const base of browserCacheDirs()) {
    if (!existsSync(base)) continue
    const dirs = readdirSync(base)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse()
    for (const d of dirs) {
      for (const bin of CANDIDATE_BINARIES) {
        const exe = join(base, d, bin)
        if (existsSync(exe)) return exe
      }
    }
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
