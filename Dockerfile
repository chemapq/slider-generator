# Despliegue ALTERNATIVO al runtime nativo de Render, solo necesario si quieres conservar
# la revisión visual (VISUAL_REVIEW): esa función abre Chromium, y el runtime nativo no lo
# trae ni permite instalar las librerías de sistema que necesita.
#
# Con el runtime nativo + VISUAL_REVIEW=off (lo que configura render.yaml) esta imagen NO
# hace falta: el deck se genera igual, solo se pierde el repaso de contraste y solapes.
#
# Para usarla: en render.yaml cambia `runtime: node` por `runtime: docker` y borra el
# envVar VISUAL_REVIEW.
#
# La etiqueta debe ir SINCRONIZADA con la versión de playwright-core del package.json
# (ahora 1.62.0): la imagen trae el Chromium que espera esa versión exacta.
FROM mcr.microsoft.com/playwright:v1.62.0-noble

WORKDIR /app
ENV NODE_ENV=production

# Capa de dependencias aparte para que un cambio en el código no reinstale todo.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build && npm prune --omit=dev

# La imagen de Playwright deja los navegadores aquí; render-image.ts los busca en esta ruta.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 3000
CMD ["node", "dist/server.js"]
