/**
 * Búsqueda automática de fotos en Unsplash.
 *
 * Cuando el usuario NO sube imágenes placeholder, el generador pide a Claude
 * que marque los huecos con `data-img-query="palabras clave"` (+ opcional
 * `data-img-orient="landscape|portrait"`). Este servicio resuelve esos slots:
 * busca la foto, la descarga, la registra como data URI en el mapa de
 * placeholders (ids "u1", "u2"…) y reescribe el HTML a `data-img="uN"`,
 * de modo que el resto del pipeline (render, editor, deck-store, re-audio)
 * funciona sin cambios.
 *
 * Requiere UNSPLASH_ACCESS_KEY (https://unsplash.com/developers).
 */

const API_ROOT = 'https://api.unsplash.com'
const FETCH_TIMEOUT_MS = 15_000
const RESULTS_PER_QUERY = 10

export function isUnsplashConfigured(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY)
}

interface UnsplashPhoto {
  id: string
  urls: { regular: string }
  links: { download_location: string }
  user: { name: string }
}

export interface UnsplashResolution {
  /** HTML de cada slide con los slots reescritos (mismo orden de entrada). */
  htmls: string[]
  resolved: number
  failed: number
}

export type Orientation = 'landscape' | 'portrait'

interface Slot {
  slide: number
  query: string
  orientation: Orientation
  isImg: boolean
  photo: UnsplashPhoto | null
}

/** Tag completo (img o div) que lleva data-img-query. */
const SLOT_RE = /<[a-zA-Z][^>]*\bdata-img-query\s*=\s*"[^"]*"[^>]*>/g

/**
 * Badge "Foto · Unsplash" / "Imagen · placeholder". En modo Unsplash las fotos
 * son reales, no placeholders, así que se elimina cualquiera que Claude añada.
 */
const PH_BADGE_RE = /<span\b[^>]*\bclass\s*=\s*"[^"]*\bph-badge\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseSlot(tag: string): { query: string; orientation: Orientation; isImg: boolean } {
  const query = (/\bdata-img-query\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? '').trim()
  const orient = /\bdata-img-orient\s*=\s*"([^"]*)"/i.exec(tag)?.[1]
  return {
    query,
    orientation: orient === 'portrait' ? 'portrait' : 'landscape',
    isImg: /^<img\b/i.test(tag),
  }
}

/**
 * Quita data-img-orient pero CONSERVA data-img-query: el editor visual la usa
 * como búsqueda por defecto al "regenerar" la foto de ese slot. Es inocua para
 * fillSlots (sus regex exigen `data-img=`, no `data-img-query=`).
 */
function stripOrientAttr(tag: string): string {
  return tag.replace(/\s*\bdata-img-orient\s*=\s*"[^"]*"/gi, '')
}

/** alt de atribución (requerida por las guidelines de Unsplash). Respeta un alt no vacío. */
function withAttribution(imgTag: string, photographer: string): string {
  const alt = escapeAttr(`Foto de ${photographer} en Unsplash`)
  if (/\balt\s*=\s*""/i.test(imgTag)) return imgTag.replace(/\balt\s*=\s*""/i, `alt="${alt}"`)
  if (/\balt\s*=\s*"/i.test(imgTag)) return imgTag
  return imgTag.replace(/^<img\b/i, `<img alt="${alt}"`)
}

function authHeaders(accessKey: string): Record<string, string> {
  return { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' }
}

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

async function searchPhotos(
  query: string,
  orientation: Orientation,
  accessKey: string,
): Promise<UnsplashPhoto[]> {
  const url = new URL(`${API_ROOT}/search/photos`)
  url.searchParams.set('query', query)
  url.searchParams.set('orientation', orientation)
  url.searchParams.set('per_page', String(RESULTS_PER_QUERY))
  url.searchParams.set('content_filter', 'high')
  const res = await fetchWithTimeout(url.toString(), { headers: authHeaders(accessKey) })
  if (!res.ok) throw new Error(`Unsplash search HTTP ${res.status}`)
  const data = (await res.json()) as { results?: UnsplashPhoto[] }
  return data.results ?? []
}

async function downloadAsDataUri(photo: UnsplashPhoto, accessKey: string): Promise<string> {
  // Registrar la descarga (requisito de las guidelines de la API de Unsplash).
  // Fallo aislado: no bloquea la obtención de la imagen.
  fetchWithTimeout(photo.links.download_location, { headers: authHeaders(accessKey) }).catch(
    () => {},
  )
  const res = await fetchWithTimeout(photo.urls.regular)
  if (!res.ok) throw new Error(`Unsplash download HTTP ${res.status}`)
  const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  const buffer = Buffer.from(await res.arrayBuffer())
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * Resuelve todos los slots `data-img-query` de las slides. Nunca lanza:
 * un slot que falla (búsqueda sin resultados, descarga rota, query vacía)
 * se elimina (img) o se limpia (div), dejando el fondo degradado de fallback.
 * Muta `placeholders` añadiendo las fotos descargadas.
 */
export async function resolveUnsplashSlots(
  htmls: string[],
  placeholders: Map<string, string>,
): Promise<UnsplashResolution> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) return { htmls, resolved: 0, failed: 0 }

  // 1. Recoger los slots en orden de documento.
  const slots: Slot[] = []
  htmls.forEach((html, slide) => {
    for (const m of html.matchAll(SLOT_RE)) {
      slots.push({ slide, ...parseSlot(m[0]), photo: null })
    }
  })
  if (!slots.length) return { htmls, resolved: 0, failed: 0 }

  // 2. Búsquedas únicas en paralelo (query + orientación).
  const keyOf = (s: Slot) => `${s.orientation}|${s.query.toLowerCase()}`
  const searches = new Map<string, UnsplashPhoto[]>()
  await Promise.all(
    [...new Set(slots.filter((s) => s.query).map(keyOf))].map(async (key) => {
      const sep = key.indexOf('|')
      const orientation = key.slice(0, sep) as Orientation
      const query = key.slice(sep + 1)
      try {
        searches.set(key, await searchPhotos(query, orientation, accessKey))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[unsplash] búsqueda "${query}" falló:`, msg)
        searches.set(key, [])
      }
    }),
  )

  // 3. Asignar una foto a cada slot evitando repetir la misma en el deck.
  const usedPhotoIds = new Set<string>()
  for (const slot of slots) {
    const results = slot.query ? (searches.get(keyOf(slot)) ?? []) : []
    slot.photo = results.find((p) => !usedPhotoIds.has(p.id)) ?? results[0] ?? null
    if (slot.photo) usedPhotoIds.add(slot.photo.id)
  }

  // 4. Descargar las fotos únicas en paralelo y registrarlas como placeholders.
  const byPhotoId = new Map<string, { placeholderId: string; photo: UnsplashPhoto }>()
  for (const slot of slots) {
    if (slot.photo && !byPhotoId.has(slot.photo.id)) {
      byPhotoId.set(slot.photo.id, { placeholderId: `u${byPhotoId.size + 1}`, photo: slot.photo })
    }
  }
  await Promise.all(
    [...byPhotoId.values()].map(async ({ placeholderId, photo }) => {
      try {
        placeholders.set(placeholderId, await downloadAsDataUri(photo, accessKey))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[unsplash] descarga de la foto ${photo.id} falló:`, msg)
      }
    }),
  )

  // 5. Reescribir el HTML. String.replace procesa los matches en el mismo
  //    orden de documento que matchAll, así que una cola por slide alinea
  //    cada tag con su slot.
  let resolved = 0
  let failed = 0
  const out = htmls.map((html, slide) => {
    const queue = slots.filter((s) => s.slide === slide)
    const rewritten = html.replace(SLOT_RE, (tag) => {
      const slot = queue.shift()
      const entry = slot?.photo ? byPhotoId.get(slot.photo.id) : undefined
      if (!slot || !entry || !placeholders.has(entry.placeholderId)) {
        failed += 1
        // El div fallido conserva data-img-query: el editor visual puede reintentarlo.
        return slot && !slot.isImg ? stripOrientAttr(tag) : ''
      }
      resolved += 1
      // data-img-id identifica la foto actual: el editor lo excluye al regenerar.
      let out = stripOrientAttr(tag).replace(
        /^<([a-zA-Z][\w-]*)/,
        `<$1 data-img="${entry.placeholderId}" data-img-id="${escapeAttr(entry.photo.id)}"`,
      )
      if (slot.isImg) out = withAttribution(out, entry.photo.user.name)
      return out
    })
    // Las fotos de Unsplash son reales: fuera cualquier badge de placeholder.
    return rewritten.replace(PH_BADGE_RE, '')
  })

  if (failed) console.warn(`[unsplash] ${failed} slot(s) sin foto (de ${slots.length}).`)
  return { htmls: out, resolved, failed }
}

export interface UnsplashPick {
  id: string
  dataUri: string
  photographer: string
}

/**
 * Busca y descarga UNA foto para el editor visual (regenerar/reemplazar una
 * imagen concreta del deck). Elige al azar entre los resultados no excluidos
 * para que "regenerar" traiga variedad; si todos están excluidos (el usuario
 * ya los vio), reutiliza el conjunto completo. Devuelve null sin resultados.
 */
export async function pickUnsplashPhoto(
  query: string,
  orientation: Orientation,
  excludeIds: readonly string[] = [],
): Promise<UnsplashPick | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) return null

  const results = await searchPhotos(query, orientation, accessKey)
  if (!results.length) return null

  const excluded = new Set(excludeIds)
  const fresh = results.filter((p) => !excluded.has(p.id))
  const pool = fresh.length ? fresh : results
  const photo = pool[Math.floor(Math.random() * pool.length)]!

  return {
    id: photo.id,
    dataUri: await downloadAsDataUri(photo, accessKey),
    photographer: photo.user.name,
  }
}
