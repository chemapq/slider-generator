/**
 * Pantalla de acceso. Se sirve como cadena desde la ruta (no desde `public/`) para no
 * tener que abrir un agujero en el handler de estáticos, que está detrás del guardián.
 *
 * Identidad Awakelab 2026: Poppins, azules profundos de fondo y cian vivo como acento.
 * Logo sobre fondo oscuro (variante `fondo-oscuro`) e isotipo como favicon.
 */

const LOGO_DARK = 'https://media.awakelab.world/MARCA_AWK26/awakelab_logo_fondo-oscuro_transparente.png'
const ISOTIPO_DARK = 'https://media.awakelab.world/MARCA_AWK26/awakelab_isotipo_fondo-oscuro_transparente.png'

/** `error` se pinta como aviso; `next` vuelve a la ruta que disparó el login. */
export function renderLogin(opts: { error?: string; next?: string } = {}): string {
  const error = opts.error
    ? `<p class="err" role="alert">${opts.error.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>`
    : ''
  const next = opts.next
    ? `<input type="hidden" name="next" value="${opts.next.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)}">`
    : ''

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Acceso · Awakelab</title>
<link rel="icon" href="${ISOTIPO_DARK}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --deep-900: #011932; --deep-800: #012142; --deep-700: #01264C; --deep-600: #003260;
    --deep-400: #27334F; --deep-300: #314668;
    --cyan-300: #D9FBFF; --cyan-500: #19F7F1; --cyan-600: #11EAEA; --cyan-700: #0ABCC9;
    --ink: #F0F3FC;
  }
  html, body { height: 100%; }
  body {
    margin: 0; font-family: Poppins, system-ui, sans-serif; color: var(--ink);
    background: var(--deep-900);
    display: grid; place-items: center; padding: 24px;
  }
  /* Destellos cian sobre el azul profundo: acento de marca sin restar contraste al texto. */
  body::before {
    content: ""; position: fixed; inset: 0; pointer-events: none;
    background:
      radial-gradient(60vw 60vw at 12% -10%, rgba(25,247,241,.16), transparent 60%),
      radial-gradient(50vw 50vw at 100% 110%, rgba(11,147,170,.20), transparent 60%);
  }
  .card {
    position: relative; width: 100%; max-width: 420px;
    background: linear-gradient(180deg, var(--deep-700), var(--deep-800));
    border: 1px solid rgba(25,247,241,.18); border-radius: 18px;
    padding: 40px 34px 34px; box-shadow: 0 24px 60px rgba(1,25,50,.55);
  }
  .logo { display: block; height: 38px; width: auto; margin: 0 auto 28px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; text-align: center; letter-spacing: -.01em; }
  .sub { margin: 0 0 26px; text-align: center; font-size: 13.5px; font-weight: 400; color: #A9C4DA; }
  label { display: block; font-size: 12.5px; font-weight: 500; color: var(--cyan-300); margin-bottom: 8px; }
  input[type=password] {
    width: 100%; padding: 13px 14px; font: inherit; font-size: 15px; color: var(--ink);
    background: rgba(1,25,50,.55); border: 1px solid var(--deep-300); border-radius: 10px;
    transition: border-color .15s, box-shadow .15s;
  }
  input[type=password]:focus {
    outline: none; border-color: var(--cyan-600);
    box-shadow: 0 0 0 3px rgba(17,234,234,.22);
  }
  button {
    width: 100%; margin-top: 20px; padding: 13px 16px; font: inherit; font-size: 15px; font-weight: 600;
    color: var(--deep-900); background: var(--cyan-500); border: 0; border-radius: 10px; cursor: pointer;
    transition: background .15s, transform .06s;
  }
  button:hover { background: var(--cyan-600); }
  button:active { transform: translateY(1px); }
  button:focus-visible { outline: 3px solid var(--cyan-300); outline-offset: 2px; }
  .err {
    margin: 0 0 18px; padding: 10px 12px; border-radius: 9px; font-size: 13px;
    color: #FFE2E2; background: rgba(220,38,38,.16); border: 1px solid rgba(248,113,113,.42);
  }
  .foot { margin: 22px 0 0; text-align: center; font-size: 11.5px; color: #7E9BB5; }
</style>
</head>
<body>
  <main class="card">
    <img class="logo" src="${LOGO_DARK}" alt="Awakelab">
    <h1>Generador de clases</h1>
    <p class="sub">Introduce la contraseña para continuar</p>
    ${error}
    <form method="POST" action="/login">
      ${next}
      <label for="password">Contraseña</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">Entrar</button>
    </form>
    <p class="foot">Acceso restringido</p>
  </main>
</body>
</html>`
}
