# Conversación de la sesión — Presentación Growth & Revenue OPS

Registro de los prompts del usuario, las preguntas de aclaración y las respuestas de Claude (Cowork) durante la creación de la presentación.

> Sesión del 15 de junio de 2026 · Proyecto "awk-video-test"

---

## Instrucciones iniciales del proyecto (configuradas en Cowork)

Esta es una carpeta que contiene varios archivos con la finalidad de hacer una presentación corporativa en formato HTML:

1. En `./references` hay imágenes de referencia para el estilo, tipo de fuentes y colores de los slides.
2. En `./images` hay varias imágenes en diferentes formatos, usadas como placeholders de las imágenes reales que se colocarán en producción.
3. En `./02-002-1-RFK_T1_guion tema.pdf` está todo el contenido de los slides.
4. El archivo `./avatar.jpg` se usa para generar una imagen placeholder tipo avatar-tutor, con una máscara circular lo bastante grande como para parecer un tutor narrando el texto.

---

## 1. Usuario

> Quiero que generes una presentación en formato HTML usando los recursos que he explicado previamente. La presentación debe ser corporativa, las imágenes serán usadas como placeholders así que no te preocupes por el contenido de ellas, mantén un estilo moderno y consistente en todos los slides. El texto que deberás distribuir en las presentaciones lo extraes literalmente del archivo `./02-002-1-RFK_T1_guion tema.pdf`. Deberás generar los layouts que consideres necesarios, no solo los de la referencia — intenta ser creativo, pero los diseños tienen que mantener la misma imagen corporativa, estilos, deben ser equilibrados sin desajustes gráficos, etc. Guarda el HTML en este mismo directorio.

### Claude — exploración previa

Antes de construir, revisé los recursos del proyecto:

- **Referencias de estilo** (`references/slide01-03.png`): paleta violeta corporativo, tarjetas negras y grises claras, fondo blanco, tipografía sans moderna y bold, esquinas redondeadas, imágenes 3D con degradados violeta.
- **Guion** (`02-002-1-RFK_T1_guion tema.pdf`, 4 páginas): introducción, tres subapartados (1.1 diferencias entre marketing digital / growth / RevOps, 1.2 frameworks básicos — AARRR y growth hacking, 1.3 roles y habilidades clave) y conclusión.
- **Imágenes placeholder**: 5 horizontales (`img-h-*`) y 6 verticales (`img-v-*`).
- **Avatar** (`avatar.jpg`): retrato vertical para el avatar-tutor.

### Claude — preguntas de aclaración

**P1. ¿Cómo quieres que funcione la presentación HTML?**
→ Respuesta: **Deck navegable** (slides 16:9 a pantalla completa, navegación con flechas/teclado y barra de progreso).

**P2. ¿Dónde debe aparecer el avatar-tutor (placeholder con máscara circular)?**
→ Respuesta: **Solo intro y conclusión** (el tutor aparece grande en el slide de bienvenida y en el de cierre).

### Claude — respuesta final

Construí una presentación corporativa de **19 slides** guardada como `presentacion-growth-revops.html`, que incluye:

- **Deck navegable 16:9** con flechas/teclado, barra de progreso, contador y puntos. Se reescala solo a cualquier pantalla.
- **Texto literal del guion** distribuido en layouts variados: portada, bienvenida, agenda (1.1/1.2/1.3), tres divisores de sección, conceptos (marketing digital, growth, RevOps), la analogía del coche de carreras, el funnel AARRR + sus 5 etapas, método científico/growth hacking, casos Airbnb y Dropbox, roles, las 5 competencias, cierre y conclusión.
- **Estilo de las referencias**: violeta corporativo, tarjetas negras y grises, tipografía Inter bold, esquinas redondeadas e imágenes 3D placeholder.
- **Avatar-tutor** con máscara circular grande y anillo "en directo" en intro y conclusión, usando `avatar.jpg`.

Verifiqué el render real de los 19 slides (capturas headless): sin recortes de texto ni desajustes y con imagen corporativa uniforme. Las imágenes apuntan a `images/` y `avatar.jpg`, así que solo hay que reemplazar esos archivos en producción.

---

## 2. Usuario

> Quiero compartir este proyecto con otro miembro de mi equipo, ¿qué debo hacer? Quiero incluir todo: descripción (instrucciones iniciales), assets, prompts, tus respuestas, etc.

### Claude — preguntas de aclaración

**P1. ¿Cómo prefieres entregar el paquete a tu compañero?**
→ Respuesta: **ZIP listo para enviar** (todo empaquetado en un `.zip` autocontenido).

**P2. ¿En qué formato incluyo la conversación (prompts + respuestas)?**
→ Respuesta: **Markdown (.md)**.

### Claude — respuesta final

Generé dos documentos nuevos (`LEEME.md` y este `CONVERSACION.md`) y empaqueté la carpeta completa —assets, referencias, guion, HTML y documentación— en un único archivo `.zip` listo para compartir con el equipo.

---

*Documento generado automáticamente como parte del paquete del proyecto.*
