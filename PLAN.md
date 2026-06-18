# Plan por fases: Generador de slides HTML a partir de PDFs con Claude

## Contexto

Proyecto desde cero que permite **subir un PDF a un backend**, que este se comunique con
**Claude**, y devuelva unas **slides en HTML** (reveal.js) basadas en el contenido del PDF,
**replicando el estilo visual** de un conjunto de slides de referencia (imágenes) que el
usuario mantiene.

Decisiones:
- **Stack:** Node + TypeScript (Fastify).
- **Referencias de diseño:** set **fijo** de **imágenes de slides** (carpeta `references/`)
  que Claude usa como **modelo de estilo visual** (colores, tipografía, layout, estética).
  No son citas ni bibliografía: su único fin es que las slides generadas se parezcan a ellas.
- **Interfaz:** API HTTP + UI web de subida (drag & drop) con vista/descarga.
- **Formato:** reveal.js (núcleo, **sin tema por defecto**; el aspecto lo define un CSS que
  genera Claude para imitar las referencias). **Modelo:** `claude-opus-4-8`.

Hechos clave:
- **Claude lee PDFs nativamente** (bloque `document` base64, `media_type: "application/pdf"`),
  GA en `messages.stream` — sin librería de parseo.
- **Claude acepta imágenes** (bloques `image` base64, PNG/JPEG/WebP/GIF). Se usan al **crear
  un tema** a partir de imágenes; no en cada generación.

Arquitectura de **temas** (clave): un diseño de slides se "deshidrata" UNA vez a un
**tema JSON** (`themes/*.json` = tokens + CSS). En runtime se usa ese JSON (barato), sin
mandar imágenes a Claude en cada llamada. Los temas por defecto se crean a mano desde
imágenes; nuevos temas podrán crearse subiendo imágenes desde el frontend (Claude las
"descifra" a un tema). Todos los temas comparten un **vocabulario de componentes** fijo
(`.split`, `.stack`, `.grid-cards`, `.card`/`.card--purple`/`.card--dark`, `.media`,
`.pill`, `.tag`, `.lead`, `.muted`, `.eyebrow`, `h1`/`h3`); el tema solo cambia su aspecto.

Arquitectura objetivo:
```
slider-generator/
  package.json  tsconfig.json  .env  .env.example  .gitignore
  references/                # imágenes fuente de slides (para crear temas por defecto)
  themes/                    # temas derivados (JSON: tokens + CSS) — se consumen en runtime
    timely-ai.json
  scripts/
    build-theme.ts           # builder de temas por defecto (+ preview HTML)
  src/
    server.ts                # Fastify + estáticos + registro de rutas
    routes/generate.ts       # POST /api/generate
    services/claude.ts       # llamada a Claude (PDF + tema -> JSON slides en HTML)
    services/slides.ts       # JSON slides + tema -> HTML reveal.js
    services/themes.ts       # carga/lista temas de themes/
    services/references.ts   # lee imágenes (para crear temas desde el frontend)
    config/schema.ts         # esquema Zod del output (contenido de slides)
    config/theme-schema.ts   # esquema Zod del tema
    templates/reveal.html    # shell reveal.js con {{TITLE}} / {{CSS}} / {{SLIDES}}
  public/
    index.html  app.js       # UI de subida (+ selector de tema)
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

## Fase 2 — Temas y esquemas (datos) ✅

**Objetivo:** definir el sistema de temas y los contratos de datos antes de tocar Claude.

Pasos:
1. `src/config/theme-schema.ts`: esquema Zod `ThemeSchema` (`name`, `label?`, `palette`,
   `typography`, `source?`, `css`). Un tema es un diseño "deshidratado" a JSON.
2. `scripts/build-theme.ts`: builder que define los temas por defecto (tokens + CSS en una
   plantilla legible), valida con `ThemeSchema`, escribe `themes/<name>.json` y genera un
   `preview.generated.html` para comparar a ojo. Primer tema creado: **`timely-ai`**.
3. `src/services/themes.ts`: `loadTheme(name)` y `listThemes()` leen y validan `themes/*.json`.
4. `src/services/references.ts`: `loadReferenceImages()` lee imágenes de `references/` a
   bloques `image` base64 — se usará para **crear temas** desde el frontend (Fase 6/7).
5. `src/config/schema.ts`: esquema Zod `SlidesSchema` (el CONTENIDO; el estilo viene del tema):
   ```ts
   const Slide = z.object({
     slideClass: z.string().optional(), // p. ej. "title-slide"
     html: z.string(),                  // HTML interno del <section>, con clases del tema
     notes: z.string().optional(),
   });
   export const SlidesSchema = z.object({
     title: z.string(),
     subtitle: z.string().optional(),
     slides: z.array(Slide),
   });
   export type Slides = z.infer<typeof SlidesSchema>;
   ```

**Verificación:** `tsc --noEmit` sin errores; `npx tsx scripts/build-theme.ts` genera el
JSON y el preview; `loadReferenceImages()` devuelve bloques base64 válidos.

---

## Fase 3 — Integración con Claude (`services/claude.ts`) ✅ (falta prueba en vivo)

**Objetivo:** función `generateSlides(pdfBase64, theme)` que devuelve un `Slides` validado
(contenido en HTML usando el vocabulario de componentes del tema).

Pasos hechos:
1. `new Anthropic()` (lee `ANTHROPIC_API_KEY` del entorno).
2. **System prompt** (rol "diseñador de presentaciones", `cache_control: ephemeral`):
   incluye el **vocabulario de componentes** compartido y la paleta del tema; reglas —
   derivar TODO del PDF (no inventar), portada `title-slide`, texto conciso, organizar en
   tarjetas/rejillas, devolver solo el HTML interno en `html`. **No** genera CSS (lo aporta
   el tema). El idioma sale del PDF.
3. Mensaje `user`: bloque `document` (PDF base64) + texto pidiendo generar las slides.
4. `client.messages.stream({...})`: `model: "claude-opus-4-8"`, `max_tokens: 64000`,
   `thinking: { type: "adaptive" }`, `output_config: { effort: "high", format: zodOutputFormat(SlidesSchema) }`.
5. `.finalMessage()`: comprobar `stop_reason` (`refusal`/`max_tokens` → error claro) y
   devolver `parsed_output` (ya validado por el helper de Zod).

**Verificación (pendiente, consume tokens):** con `.env` y una API key, un script temporal
que pase un PDF de prueba + `loadTheme("timely-ai")` y haga `console.log` del `Slides`.

---

## Fase 4 — Renderizado a reveal.js (`services/slides.ts` + plantilla)

**Objetivo:** convertir `(Slides, Theme)` en un HTML reveal.js autocontenible que **luzca
como el tema** (inyectando `theme.css`).

Pasos:
1. `src/templates/reveal.html`: shell reveal.js por CDN cargando **solo el núcleo**
   (`reveal.css` + `reset.css`, **sin tema**) con placeholders `{{TITLE}}`, `{{CSS}}` y
   `{{SLIDES}}`. El `{{CSS}}` va en un `<style>` tras el core. `Reveal.initialize` con
   `center:false, width:1280, height:720, margin:0` (ver `scripts/build-theme.ts` como
   referencia ya probada del shell).
2. `src/services/slides.ts`:
   - función `renderSlides(data: Slides, theme: Theme): string`,
   - por cada slide → `<section class="{slideClass}">{html}</section>` (el `html` ya viene
     con las clases del tema; **no** se escapa: es HTML intencional del modelo),
   - notas del ponente en `<aside class="notes">` si existen,
   - inyectar `title`, `theme.css` y el markup en la plantilla.

**Verificación:** alimentar `renderSlides` con un `Slides` fixture + `loadTheme("timely-ai")`,
escribir el HTML a disco y abrirlo: navega como slides y se aplica el estilo del tema.

---

## Fase 5 — Endpoint `POST /api/generate`

**Objetivo:** unir todo en la ruta HTTP.

Pasos:
1. `src/routes/generate.ts`: handler multipart que
   - valida que el archivo sea PDF (mimetype/extensión) y exista,
   - lee el buffer → base64,
   - carga el tema elegido con `loadTheme(name)` (campo del form; por defecto `timely-ai`),
   - llama a `generateSlides(pdfBase64, theme)` y luego a `renderSlides(slides, theme)`,
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
1. `public/index.html`: zona drag & drop + input file + **selector de tema** (poblado desde
   `GET /api/themes`) + botón "Generar" + contenedor `<iframe>` + botón "Descargar HTML" +
   estado de carga/errores.
2. `public/app.js`: `fetch('/api/generate', { method:'POST', body: FormData })` (con el tema
   elegido), mostrar el HTML en el `<iframe>` (`srcdoc` o Blob URL) y descargar como `.html`.
3. Endpoint auxiliar `GET /api/themes` que devuelve `listThemes()` (name/label) para el selector.

**Verificación:** abrir `http://localhost:3000`, arrastrar un PDF, elegir tema, generar,
navegar las slides en el iframe y descargar el `.html`.

---

## Fase 7 — Pulido y robustez (opcional)

- **Crear temas desde el frontend:** subir imágenes → `loadReferenceImages()` → Claude las
  "descifra" a un `ThemeSchema` (con `output_config.format`) → guardar en `themes/`. Así el
  usuario añade diseños nuevos sin tocar el builder.
- **Refinar temas existentes:** ajustar tonos/tipografía/tamaños del CSS en `build-theme.ts`
  y regenerar (comparar con el preview).
- Mejorar estética de la plantilla y la UI (puede usarse la skill `frontend-design`).
- Configurar `max` tamaño y mensajes de error finos.
- Aviso si el PDF es demasiado grande para el contexto (no truncar en silencio).
- `README.md` con instrucciones de uso (ya iniciado).

---

## Orden de ejecución sugerido

Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 → (7). Las fases 2 y 4 se validan con fixtures sin gastar
API; la fase 3 es la única que consume tokens (su prueba en vivo necesita `.env` con clave).
Cada fase tiene su verificación para avanzar con seguridad.

Estado: Fases 0, 1, 2 y 3 (código) hechas. Pendiente: prueba en vivo de la 3, y Fases 4–7.
