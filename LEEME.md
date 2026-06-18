# Presentación corporativa · Growth & Revenue OPS — Tema 1

**Fundamentos de Growth Marketing y Revenue Operations**

Este paquete contiene una presentación corporativa en formato HTML (deck navegable 16:9) junto con todos los recursos usados para generarla. Está pensado para compartirse con el equipo.

> Generado en Cowork · Última actualización: 15 de junio de 2026

---

## 1. Cómo abrir la presentación

1. Descomprime el ZIP manteniendo la estructura de carpetas intacta (el HTML usa rutas relativas a `images/` y `avatar.jpg`).
2. Haz doble clic en **`presentacion-growth-revops.html`** — se abre en cualquier navegador moderno (Chrome, Edge, Safari, Firefox). No requiere internet ni instalación.

### Navegación

| Acción | Cómo |
|---|---|
| Siguiente slide | `→`, `↓`, barra espaciadora, o el botón `›` |
| Slide anterior | `←`, `↑`, o el botón `‹` |
| Ir al inicio / final | `Inicio` / `Fin` |
| Saltar a un slide | Clic en los puntos de la barra inferior |

La presentación se reescala automáticamente para llenar cualquier pantalla manteniendo la proporción 16:9.

---

## 2. Contenido del paquete

```
awk-video-test/
├── presentacion-growth-revops.html   ← El entregable (19 slides)
├── LEEME.md                          ← Este documento
├── CONVERSACION.md                   ← Prompts y respuestas de la sesión
├── 02-002-1-RFK_T1_guion tema.pdf    ← Guion fuente (texto de los slides)
├── avatar.jpg                        ← Foto del avatar-tutor (placeholder)
├── references/                       ← Referencias de estilo (3 slides de muestra)
│   ├── slide01.png
│   ├── slide02.png
│   └── slide03.png
└── images/                           ← Imágenes placeholder (reemplazar en producción)
    ├── img-h-01.jpg … img-h-05.jpg   (horizontales)
    └── img-v-01.jpg … img-v-06.jpg   (verticales)
```

---

## 3. Descripción / Instrucciones iniciales del proyecto

Instrucciones configuradas para el proyecto "awk-video-test":

> Esta es una carpeta que contiene varios archivos con la finalidad de hacer una presentación corporativa en formato HTML. Descripción de carpetas y archivos:
> 1. En `./references` hay imágenes de referencia para el estilo, tipo de fuentes y colores que deben tener los slides.
> 2. En `./images` hay varias imágenes en distintos formatos, usadas como placeholders de las imágenes reales que irán en producción.
> 3. En `./02-002-1-RFK_T1_guion tema.pdf` está todo el contenido de los slides.
> 4. El archivo `./avatar.jpg` se usa para generar un placeholder tipo avatar-tutor, con una máscara circular lo bastante grande como para parecer un tutor narrando el texto.

El encargo: generar la presentación HTML corporativa usando esos recursos; imágenes como placeholders; estilo moderno y consistente; texto extraído **literalmente** del guion en PDF; layouts creativos y variados que mantengan la misma imagen corporativa, equilibrados y sin desajustes gráficos.

---

## 4. Estructura de los slides

La presentación tiene **19 slides** que siguen el guion del PDF:

1. Portada
2. Bienvenida (avatar-tutor)
3. Agenda — subapartados 1.1 / 1.2 / 1.3
4. Sección 01 (divisor)
5. Marketing digital
6. Growth marketing
7. Revenue Operations (RevOps)
8. La analogía del coche de carreras
9. Sección 02 (divisor)
10. El modelo AARRR — el "funnel pirata"
11. Las cinco etapas medibles
12. Growth hacking — el método científico
13. Casos célebres (Airbnb · Dropbox)
14. Sección 03 (divisor)
15. Roles y perfiles
16. Competencias clave
17. En resumen (cita)
18. Conclusión (avatar-tutor)
19. Cierre

---

## 5. Sistema de diseño

- **Color principal:** violeta corporativo (`#6C4CF1`) con degradados a `#5B3CE0` / `#3F27B8`.
- **Acentos:** tarjetas negras (`#0C0B10`) y grises claras (`#F2F1F6`); fondo blanco.
- **Tipografía:** Inter (Google Fonts), con pesos altos para titulares.
- **Componentes:** tarjetas redondeadas, badges/píldoras, botón estilo "pill", avatar circular con anillo "en directo".

---

## 6. Notas para producción

- **Las imágenes son placeholders.** Reemplaza los archivos dentro de `images/` y `avatar.jpg` por los definitivos **conservando los mismos nombres** y la presentación se actualizará sola. (Si cambias los nombres, ajusta las rutas `src="..."` en el HTML.)
- El texto de los slides se tomó literalmente del guion `02-002-1-RFK_T1_guion tema.pdf`.
- Todo está en un único archivo HTML autocontenido (CSS y JS incluidos); la única dependencia externa es la fuente Inter desde Google Fonts.
