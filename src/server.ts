import 'dotenv/config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import { generateRoutes } from './routes/generate.js'
import { authRoutes, authGuard } from './routes/auth.js'
import { isAuthEnabled } from './services/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// `trustProxy` es imprescindible detrás del balanceador de Render: sin él `req.ip` sería
// siempre la IP del proxy (el freno de fuerza bruta bloquearía a todo el mundo a la vez) y
// `req.protocol` diría http, así que la cookie de sesión nunca llevaría el flag Secure.
const app = Fastify({ logger: true, trustProxy: true })

// El guardián va en la raíz y ANTES que nada: los hooks de la instancia raíz sí alcanzan
// a los plugins hijos (estáticos incluidos), al revés no. Sin APP_PASSWORD no hace nada.
app.addHook('onRequest', authGuard)

// El <form> del login envía urlencoded, que Fastify no parsea de serie. Un parser de tres
// líneas evita tener que añadir @fastify/formbody solo para esto.
app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(body as string)))
    } catch (err) {
      done(err as Error, undefined)
    }
  },
)

await app.register(fastifyMultipart, {
  limits: { fileSize: 25 * 1024 * 1024 },
})

await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
})

await app.register(authRoutes)
await app.register(generateRoutes)

// Sonda de salud para Render (fuera del login: el health check no lleva cookie).
app.get('/healthz', async () => ({ ok: true }))

const port = Number(process.env.PORT) || 3000
// En un PaaS hay que escuchar en todas las interfaces o el balanceador no llega al proceso;
// en local se sigue pudiendo forzar 127.0.0.1 con HOST para no exponerse en la red wifi.
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1')
await app.listen({ port, host })
app.log.info(
  isAuthEnabled()
    ? 'Acceso protegido por contraseña (APP_PASSWORD).'
    : 'Acceso ABIERTO: define APP_PASSWORD para exigir contraseña.',
)
