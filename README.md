# slider-generator

Genera **slides HTML (reveal.js)** a partir de un **PDF**, usando **Claude**. Subes un PDF a
un backend en Node + TypeScript; Claude lee el PDF de forma nativa, estructura la
presentación y **replica el estilo visual** de un conjunto de **slides de referencia
(imágenes)** que tú mantienes.

## Stack

- **Backend:** Node + TypeScript (Fastify)
- **IA:** `@anthropic-ai/sdk` — modelo `claude-opus-4-8` (PDF nativo en base64)
- **Salida:** reveal.js (HTML autocontenible)
- **Validación:** Zod (salida estructurada)

## Requisitos

- Node.js 20+
- Una clave de API de Claude

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar el entorno
cp .env.example .env
# editar .env y poner ANTHROPIC_API_KEY

# 3. Arrancar en desarrollo
npm run dev
```

Luego abre `http://localhost:3000`, arrastra un PDF y genera las slides.

## Scripts

| Script              | Acción                                  |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Servidor en desarrollo (recarga)        |
| `npm run build`     | Compila TypeScript a `dist/`            |
| `npm start`         | Ejecuta la build de `dist/`             |
| `npm run typecheck` | Comprobación de tipos sin emitir        |

## Estructura

```
references/                # imágenes de slides de referencia (set fijo, lo mantienes tú)
src/
  server.ts                # Fastify + estáticos + rutas
  routes/generate.ts       # POST /api/generate
  services/claude.ts       # llamada a Claude (PDF + imágenes ref -> JSON slides + CSS)
  services/slides.ts       # JSON -> HTML reveal.js (inyecta el CSS generado)
  services/references.ts   # lee references/ y pasa las imágenes a base64
  config/schema.ts         # esquema Zod del output
  templates/reveal.html    # shell reveal.js (núcleo, sin tema)
public/
  index.html  app.js       # UI de subida
```

## Cómo funciona

1. Subes un PDF a `POST /api/generate` (multipart).
2. El backend lo pasa a base64 y llama a Claude con el PDF + tus imágenes de referencia.
3. Claude devuelve un JSON estructurado de slides + un CSS que imita el diseño (validado con Zod).
4. El backend lo renderiza a HTML reveal.js aplicando ese CSS y lo devuelve para ver/descargar.

El plan de desarrollo por fases está en [PLAN.md](PLAN.md).

## Referencias de diseño

Deja tus **imágenes de slides** en la carpeta `references/` (PNG/JPEG/WebP/GIF). Claude las
analiza y **replica su estilo visual** (paleta, tipografía, layout) al generar las slides del
PDF. No son citas ni bibliografía: solo sirven de modelo de aspecto. Cambia las imágenes para
cambiar el look de las presentaciones generadas.

## Despliegue en Render

El repo trae un [`render.yaml`](render.yaml). En Render: **New → Blueprint**, apunta al repo y
Render pedirá los secretos marcados como `sync: false` (claves de API y `APP_PASSWORD`).
`SESSION_SECRET` se genera solo.

```bash
Build:  npm ci --include=dev && npm run build   # tsc es devDependency: --include=dev es obligatorio
Start:  npm start
Health: /healthz                                # queda fuera del login a propósito
```

El servidor escucha en `0.0.0.0` solo cuando detecta la variable `RENDER`; en local sigue
atado a `127.0.0.1`. `HOST` lo fuerza en cualquier caso.

### Antes de exponerlo a internet

- **Pon `APP_PASSWORD`.** Sin ella la app queda abierta y cualquiera puede gastar tus créditos
  de Claude, ElevenLabs y HeyGen.
- **Nunca metas secretos en `.env.example`**: ese fichero está versionado. Van en `.env`
  (ignorado por git) y en el dashboard de Render.

### Limitaciones conocidas en Render

- **La revisión visual va apagada** (`VISUAL_REVIEW=off`). Necesita Chromium y el runtime
  nativo no lo trae. Para recuperarla, despliega con el [`Dockerfile`](Dockerfile) incluido
  (`runtime: docker`), que parte de la imagen oficial de Playwright.
- **Los decks viven en memoria.** Cada reinicio, redeploy o sueño del plan `free` los borra.
- **Generar una clase tarda minutos, y una petición ya en curso no se corta:** Render
  mantiene abiertas las peticiones de un Web Service **hasta 100 minutos**. El sueño por
  inactividad (siguiente sección) es un mecanismo aparte, a nivel de instancia — no aplica
  mientras hay una petición en marcha.

### El plan `free` (el que usa este blueprint) y el sueño por inactividad

Render **duerme un servicio free tras 15 minutos sin tráfico entrante** (una petición nueva,
no una que ya esté en curso), y despertarlo tarda **alrededor de 1 minuto** (el visitante ve
una pantalla de carga mientras tanto). Como los decks viven en memoria, dormirse también los
borra — asúmelo mientras esto sea solo para probar.

Si en algún momento quieres mantenerlo siempre despierto, basta con llamar a `/healthz` cada
menos de 15 minutos desde un pinger externo (cron-job.org, UptimeRobot, una GitHub Action
programada…) — la sonda está fuera del login a propósito, así que no necesita credenciales.
Ojo entonces al presupuesto: Render da **750 horas de instancia free al mes por workspace**,
y un servicio despierto 24/7 casi lo agota él solo. Sube a `starter` (`plan: starter` en
`render.yaml`) cuando esto deje de ser solo para pruebas.
