---
name: verify
description: Verificar cambios del deck (templates/deck.ts, slides.ts) ejercitando el HTML generado en Chromium headless, sin gastar Claude/ElevenLabs.
---

# Verificar el deck generado

La superficie de los cambios en `src/templates/deck.ts` / `src/services/slides.ts` es el
HTML autocontenido corriendo en un navegador. No hace falta el server ni las APIs:

1. **Generar un deck de prueba por el pipeline real** — script tsx (extensión `.mts`,
   el scratchpad no es ESM) que importa `renderSlides` de `src/services/slides.js` y
   `ThemeSchema` de `src/config/theme-schema.js`, carga un tema de `themes/*.json`
   (p. ej. `meridian.json`) y pasa un `DeckAudio` con WAV sintetizado (RIFF PCM 8 kHz
   mono, seno, base64; `mime: 'audio/wav'`) + `cues`. Ejecutar con
   `npx --prefix <repo> tsx gen-preview.mts`.
   Incluir siempre: un slide con audio corto, otro con cues de subtítulos y otro SIN
   audio (`null`) para probar la ocultación de controles.

2. **Conducirlo con playwright-core** (`npm i playwright-core` en el scratchpad; los
   navegadores ya están cacheados). Ejecutable:
   `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
   Lanzar con `--autoplay-policy=no-user-gesture-required`.

3. **Gotchas del motor de audio**: el audio no arranca hasta un gesto (`unlock()` va en
   los handlers de nav/teclado — click en `#next` es el gesto más simple); la tecla `p`
   pausa, `m` mute, `c` subtítulos; al comparar `stroke-dashoffset` del anillo tras una
   pausa, esperar >0.3 s (transición CSS) y el timeupdate final que dispara `pause()`.

4. Capturar screenshots + estado DOM (`#audio-timer`, `#captions`, `.slide.active`) y
   errores de consola.
