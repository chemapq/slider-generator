/**
 * Rutas de acceso y guardián global.
 *
 * El guardián es un hook `onRequest` en la instancia raíz, así que cubre TODO —incluidos
 * los estáticos de `public/` y los decks generados— sin tener que ir marcando ruta por ruta.
 * Se registra antes que nada y se autoexcluye si `APP_PASSWORD` no está puesta.
 */
import type { FastifyInstance, FastifyRequest, onRequestHookHandler } from 'fastify'
import { renderLogin } from '../templates/login.js'
import {
  COOKIE_NAME,
  isAuthEnabled,
  isValidSession,
  issueSession,
  verifyPassword,
  readCookie,
  sessionCookie,
  clearCookie,
  tooManyAttempts,
  noteFailedAttempt,
  resetAttempts,
} from '../services/auth.js'

/** https directo o anunciado por el proxy: decide el flag `Secure` de la cookie. */
function isHttps(req: FastifyRequest): boolean {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim()
  return proto === 'https' || req.protocol === 'https'
}

function clientIp(req: FastifyRequest): string {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()
  return fwd || req.ip
}

/**
 * Destino tras el login. Solo se aceptan rutas propias que empiecen por una única `/`:
 * `//evil.com` o `https://evil.com` serían redirecciones abiertas.
 */
function safeNext(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : ''
  return /^\/(?!\/)/.test(s) ? s : '/'
}

/**
 * Guardián. Va en la instancia RAÍZ (no dentro de un plugin): Fastify encapsula los
 * plugins, así que un hook registrado dentro de `authRoutes` no cubriría los estáticos
 * de `public/` ni las rutas de generación — justo lo que hay que proteger.
 */
export const authGuard: onRequestHookHandler = async (req, reply) => {
  if (!isAuthEnabled()) return
  // Las propias rutas de login quedan fuera, o no habría forma de autenticarse. La sonda
  // de salud también: Render la llama sin cookie y un 302 la daría por caída.
  const path = req.url.split('?')[0]
  if (path === '/login' || path === '/logout' || path === '/healthz') return
  if (isValidSession(readCookie(req.headers.cookie, COOKIE_NAME))) return

  // Las llamadas del front esperan JSON; devolverles el HTML del login las confundiría.
  if (path?.startsWith('/api/')) {
    return reply.status(401).send({ error: 'Sesión expirada. Vuelve a iniciar sesión.' })
  }
  return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`, 302)
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/login', async (req, reply) => {
    if (!isAuthEnabled()) return reply.redirect('/', 302)
    if (isValidSession(readCookie(req.headers.cookie, COOKIE_NAME))) return reply.redirect('/', 302)
    const next = safeNext((req.query as { next?: string })?.next)
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(renderLogin({ next: next === '/' ? undefined : next }))
  })

  app.post('/login', async (req, reply) => {
    if (!isAuthEnabled()) return reply.redirect('/', 302)

    const body = (req.body ?? {}) as { password?: unknown; next?: unknown }
    const next = safeNext(body.next)
    const ip = clientIp(req)
    const html = (error: string, status = 401) =>
      reply
        .status(status)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(renderLogin({ error, next: next === '/' ? undefined : next }))

    if (tooManyAttempts(ip)) {
      req.log.warn({ ip }, 'login bloqueado por demasiados intentos')
      return html('Demasiados intentos fallidos. Espera unos minutos.', 429)
    }

    const password = typeof body.password === 'string' ? body.password : ''
    if (!password || !verifyPassword(password)) {
      noteFailedAttempt(ip)
      req.log.warn({ ip }, 'login fallido')
      return html('Contraseña incorrecta.')
    }

    resetAttempts(ip)
    return reply
      .header('Set-Cookie', sessionCookie(issueSession(), isHttps(req)))
      .redirect(next, 302)
  })

  app.post('/logout', async (req, reply) => {
    return reply.header('Set-Cookie', clearCookie(isHttps(req))).redirect('/login', 302)
  })
}
