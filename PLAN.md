# Plan por fases: Generador de slides HTML a partir de PDFs con Claude

## Contexto

Proyecto desde cero que permite **subir un PDF a un backend**, que este se comunique con
**Claude**, y devuelva unas **slides en HTML** (reveal.js) basadas en el contenido del PDF,
incorporando **referencias para la temática** que el usuario mantiene en una lista propia.

Decisiones:
- **Stack:** Node + TypeScript (Fastify).
- **Referencias:** lista fija editable (`config/references.json`). Claude selecciona y cita
  las relevantes según el tema del PDF.
- **Interfaz:** API HTTP + UI web de subida (drag & drop) con vista/descarga.
- **Formato:** reveal.js. **Modelo:** `claude-opus-4-8`.

Hecho clave: **Claude lee PDFs nativamente** (bloque `document` base64,
`media_type: "application/pdf"`), GA en `messages.stream` — sin librería de parseo.

Arquitectura objetivo:
```
slider-generator/
  package.json  tsconfig.json  .env  .env.example  .gitignore
  src/
    server.ts                # Fastify + estáticos + registro de rutas
    routes/generate.ts       # POST /api/generate
    services/claude.ts       # llamada a Claude (PDF + refs -> JSON slides)
    services/slides.ts       # JSON -> HTML reveal.js
    config/references.json   # referencias curadas (editable)
    config/schema.ts         # esquema Zod del output
    templates/reveal.html    # shell reveal.js con {{TITLE}} / {{SLIDES}}
  public/
    index.html  app.js       # UI de subida
```

---

## Fase 0 — Andamiaje del proyecto

**Objetivo:** estructura base, dependencias y TypeScript compilando.

Pasos:
1. Inicializar y instalar dependencias (instalar con `npm install`, no escribir versiones a mano):
   ```bash
   npm init -y
   npm install fastify @fastify/multipart @anthropic-ai/sdk zod dotenv
   npm install -D typescript tsx @types/node
   ```
2. Crear `tsconfig.json` (target ESNext/NodeNext, `outDir: dist`, `strict: true`, `rootDir: src`).
3. Editar `package.json`: `"type": "module"` y scripts:
   - `"dev": "tsx watch src/server.ts"`
   - `"build": "tsc"`
   - `"start": "node dist/server.js"`
4. Crear `.gitignore` (`node_modules`, `dist`, `.env`).
5. Crear `.env.example` con `ANTHROPIC_API_KEY=` y `PORT=3000`; crear `.env` real con la clave.
6. Crear las carpetas `src/{routes,services,config,templates}` y `public/`.

**Verificación:** `npx tsc --noEmit` no da errores (aún sin código, o con un `server.ts` mínimo).

---

## Fase 1 — Servidor base y estáticos

**Objetivo:** servidor Fastify levantado sirviendo la UI estática.

Pasos:
1. `src/server.ts`: cargar `dotenv`, crear instancia Fastify, registrar `@fastify/multipart`
   (con límite de tamaño de archivo, p. ej. 25 MB), servir `public/` como estáticos, y
   escuchar en `PORT`.
2. `public/index.html`: placeholder mínimo ("Generador de slides") para comprobar el servido.

**Verificación:** `npm run dev`, abrir `http://localhost:3000` y ver la página placeholder.

---

## Fase 2 — Referencias y esquema de salida

**Objetivo:** definir el contrato de datos antes de tocar Claude.

Pasos:
1. `src/config/references.json`: array de referencias con forma
   `{ id, title, url, topics? }` (2–3 de ejemplo para pruebas).
2. `src/config/schema.ts`: esquema Zod `SlidesSchema`:
   ```ts
   const Slide = z.object({
     heading: z.string(),
     bullets: z.array(z.string()),
     notes: z.string().optional(),
     referenceIds: z.array(z.string()),
   });
   export const SlidesSchema = z.object({
     title: z.string(),
     subtitle: z.string().optional(),
     slides: z.array(Slide),
   });
   export type Slides = z.infer<typeof SlidesSchema>;
   ```
   (Mantener simple: structured outputs no admite `minLength`/`maxLength`.)

**Verificación:** importar `SlidesSchema` desde un script de prueba o `tsc --noEmit` sin errores.

---

## Fase 3 — Integración con Claude (`services/claude.ts`)

**Objetivo:** función que recibe `(pdfBase64, references)` y devuelve un `Slides` validado.

Pasos:
1. Inicializar `new Anthropic()` (lee `ANTHROPIC_API_KEY` del entorno).
2. Construir el mensaje con un único turno `user`:
   - bloque `document` con `source: { type: "base64", media_type: "application/pdf", data }`,
   - bloque `text` con instrucciones + las referencias como JSON.
3. **System prompt** (rol "diseñador de presentaciones"): derivar la temática del PDF,
   estructurar slides claras, **seleccionar y citar solo referencias relevantes** por `id`,
   no inventar referencias fuera de la lista, incluir slide final de referencias.
4. Llamada con `client.messages.stream({...})`:
   - `model: "claude-opus-4-8"`, `max_tokens: 64000`,
   - `thinking: { type: "adaptive" }`, `output_config: { effort: "high", format: zodOutputFormat(SlidesSchema) }`,
   - `cache_control: { type: "ephemeral" }` sobre el bloque estable (system + referencias),
     dejando el PDF al final (prompt caching).
5. Recoger con `.finalMessage()`; comprobar `stop_reason` (`refusal` → error claro;
   `max_tokens` → sugerir subir límite); parsear/validar el JSON con `SlidesSchema`.

**Verificación:** script temporal que pase un PDF de prueba (base64) y haga `console.log`
del objeto `Slides` validado.

---

## Fase 4 — Renderizado a reveal.js (`services/slides.ts` + plantilla)

**Objetivo:** convertir `Slides` en un HTML reveal.js autocontenible.

Pasos:
1. `src/templates/reveal.html`: shell reveal.js (CSS/JS por CDN) con `{{TITLE}}` y `{{SLIDES}}`.
2. `src/services/slides.ts`:
   - función `renderSlides(data: Slides, refs): string`,
   - por cada slide → `<section><h2>heading</h2><ul>bullets…</ul></section>` (escapando HTML),
   - notas del ponente en `<aside class="notes">` si existen,
   - slide final "Referencias": dedupe por `id` de los `referenceIds` citados, con título y enlace,
   - inyectar en la plantilla.

**Verificación:** alimentar `renderSlides` con un `Slides` de ejemplo (fixture), escribir el
HTML a disco y abrirlo en el navegador: navega como slides y muestra la slide de referencias.

---

## Fase 5 — Endpoint `POST /api/generate`

**Objetivo:** unir todo en la ruta HTTP.

Pasos:
1. `src/routes/generate.ts`: handler multipart que
   - valida que el archivo sea PDF (mimetype/extensión) y exista,
   - lee el buffer → base64,
   - carga `references.json` (o usa `references` del body si se envía),
   - llama a `services/claude.ts` y luego a `services/slides.ts`,
   - responde `Content-Type: text/html` con el HTML resultante.
2. Registrar la ruta en `src/server.ts`.
3. Manejo de errores: 400 si no es PDF; 413 si excede tamaño; 502/500 con mensaje claro si
   falla Claude o el `stop_reason` es problemático.

**Verificación:**
`curl -F "file=@muestra.pdf" http://localhost:3000/api/generate -o out.html` y abrir `out.html`.
Probar también subir un no-PDF y comprobar el error 400.

---

## Fase 6 — UI de subida (`public/`)

**Objetivo:** página para arrastrar el PDF y ver/descargar el resultado.

Pasos:
1. `public/index.html`: zona drag & drop + input file + botón "Generar" + contenedor `<iframe>`
   + botón "Descargar HTML" + estado de carga/errores.
2. `public/app.js`: `fetch('/api/generate', { method:'POST', body: FormData })`,
   mostrar el HTML devuelto en el `<iframe>` (vía `srcdoc` o Blob URL) y permitir descargar
   como `.html` (`Blob` → enlace temporal).

**Verificación:** abrir `http://localhost:3000`, arrastrar un PDF, generar, navegar las slides
en el iframe y descargar el `.html`.

---

## Fase 7 — Pulido y robustez (opcional)

- Mejorar estética de la plantilla y la UI (puede usarse la skill `frontend-design`).
- Tema/portada con `title`/`subtitle`; configurar `max` tamaño y mensajes de error finos.
- Aviso si el PDF es demasiado grande para el contexto (no truncar en silencio).
- `README.md` con instrucciones de uso.

---

## Orden de ejecución sugerido

Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 → (7). Las fases 2–4 pueden validarse con fixtures sin gastar
llamadas a la API; la fase 3 es la única que consume tokens. Cada fase tiene su verificación
para avanzar con seguridad.
