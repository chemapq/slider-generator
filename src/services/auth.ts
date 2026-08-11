/**
 * Puerta de acceso por contraseña, opcional y controlada por entorno.
 *
 * Sin `APP_PASSWORD` la app queda EXACTAMENTE como antes (abierta): es una herramienta
 * pensada para correr en local, y obligar a login por defecto rompería ese uso. Con la
 * variable puesta, todo queda detrás de un formulario.
 *
 * La sesión es una cookie firmada (HMAC-SHA256), sin estado en servidor: así sobrevive a
 * los reinicios de `tsx watch` sin arrastrar un store de sesiones ni una dependencia nueva.
 * El secreto sale de `SESSION_SECRET` o, en su defecto, se deriva de la propia contraseña
 * — cambiar la contraseña invalida todas las sesiones vivas, que es lo que se espera.
 */
import { createHmac, timingSafeEqual, createHash, randomBytes } from 'crypto'

const COOKIE_NAME = 'awk_session'
const DEFAULT_TTL_HOURS = 12

/** True si hay que pedir contraseña. Sin `APP_PASSWORD` la app va abierta. */
export function isAuthEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD)
}

export { COOKIE_NAME }

function sessionSecret(): Buffer {
  const explicit = process.env.SESSION_SECRET
  if (explicit) return Buffer.from(explicit, 'utf-8')
  // Derivado de la contraseña: sin secreto propio la firma sigue siendo impredecible para
  // quien no la conozca, y rotar la contraseña caduca las sesiones emitidas con la anterior.
  return createHash('sha256').update(`awk-session:${process.env.APP_PASSWORD ?? ''}`).digest()
}

function ttlMs(): number {
  const raw = Number(process.env.SESSION_TTL_HOURS)
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HOURS
  return hours * 60 * 60 * 1000
}

const b64url = (b: Buffer) => b.toString('base64url')

function sign(payload: string): string {
  return b64url(createHmac('sha256', sessionSecret()).update(payload).digest())
}

/**
 * Comparación en tiempo constante. Se hashean ambos lados primero para que la longitud
 * de la contraseña no se filtre por el tamaño del buffer ni por un early-return.
 */
export function verifyPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected) return false
  const a = createHash('sha256').update(candidate).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Token de sesión firmado: `<payload>.<hmac>`, con la caducidad dentro del payload. */
export function issueSession(): string {
  const payload = b64url(
    Buffer.from(JSON.stringify({ exp: Date.now() + ttlMs(), jti: randomBytes(8).toString('hex') })),
  )
  return `${payload}.${sign(payload)}`
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return false

  const payload = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const good = Buffer.from(sign(payload))
  if (given.length !== good.length || !timingSafeEqual(given, good)) return false

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { exp?: number }
    return typeof exp === 'number' && Date.now() < exp
  } catch {
    return false
  }
}

/** Lee una cookie de la cabecera cruda (no usamos @fastify/cookie por no añadir dependencia). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

/**
 * `Secure` solo cuando la petición llegó por https (directa o vía proxy): ponerlo siempre
 * rompería el uso en `http://localhost`, que es el caso normal de esta herramienta.
 */
export function sessionCookie(token: string, https: boolean): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(ttlMs() / 1000)}`,
  ]
  if (https) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearCookie(https: boolean): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0']
  if (https) attrs.push('Secure')
  return attrs.join('; ')
}

// ── Freno a la fuerza bruta ──────────────────────────────────────────────────
// En memoria y por IP. No pretende ser un rate-limiter serio (esto corre en local o tras
// un proxy), solo encarecer el tanteo automatizado de contraseñas.

const MAX_ATTEMPTS = 8
const WINDOW_MS = 10 * 60 * 1000
const attempts = new Map<string, { n: number; until: number }>()

export function tooManyAttempts(ip: string): boolean {
  const rec = attempts.get(ip)
  if (!rec) return false
  if (Date.now() > rec.until) {
    attempts.delete(ip)
    return false
  }
  return rec.n >= MAX_ATTEMPTS
}

export function noteFailedAttempt(ip: string): void {
  const now = Date.now()
  const rec = attempts.get(ip)
  if (!rec || now > rec.until) attempts.set(ip, { n: 1, until: now + WINDOW_MS })
  else rec.n += 1
}

export function resetAttempts(ip: string): void {
  attempts.delete(ip)
}
