import 'dotenv/config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import { generateRoutes } from './routes/generate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = Fastify({ logger: true })

await app.register(fastifyMultipart, {
  limits: { fileSize: 25 * 1024 * 1024 },
})

await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
})

await app.register(generateRoutes)

const port = Number(process.env.PORT) || 3000
await app.listen({ port, host: '127.0.0.1' })
