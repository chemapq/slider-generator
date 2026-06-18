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
