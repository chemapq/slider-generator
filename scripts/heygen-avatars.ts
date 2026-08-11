/**
 * Inventario y validación de presentadores de HeyGen.
 *
 * Modos:
 *   npm run heygen:avatars                     → lista avatares generados y VALIDA el mapeo
 *                                                voz→cara de ELEVENLABS_VOICES. Gratis: solo
 *                                                GETs, no genera vídeo ni gasta créditos.
 *   npm run heygen:avatars -- --create "<prompt>" [--name "<nombre>"]
 *                                              → crea un avatar generado por IA y espera a
 *                                                que termine de entrenarse.
 *
 * Por qué la validación es barata: cada look declara en `supported_api_engines` qué motores
 * admite. Comprobarlo de antemano evita descubrir a base de vídeos fallidos que un avatar no
 * sirve — que es como se descubrió que el motor por defecto (avatar_iv) dejaba fuera a medio
 * catálogo.
 *
 * Solo se listan avatares GENERADOS (GENERATED_PHOTO). Los avatares de persona real quedan
 * fuera a propósito: los presentadores del deck son personajes, no personas.
 */
import 'dotenv/config'
import { fetchAvatarLook, heygenEngine, type AvatarLook } from '../src/services/heygen.js'
import { listVoiceOptions } from '../src/services/voice-catalog.js'

const API_BASE = 'https://api.heygen.com'
const POLL_INTERVAL_MS = 10_000
const TRAIN_TIMEOUT_MS = 20 * 60 * 1000

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
}

const ok = (s: string) => `${C.green}${s}${C.reset}`
const bad = (s: string) => `${C.red}${s}${C.reset}`
const warn = (s: string) => `${C.yellow}${s}${C.reset}`
const dim = (s: string) => `${C.dim}${s}${C.reset}`

function apiKey(): string {
  const key = process.env.HEYGEN_API_KEY
  if (!key) {
    console.error(bad('Falta HEYGEN_API_KEY en el entorno (.env).'))
    process.exit(1)
  }
  return key
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'x-api-key': apiKey(), ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`HeyGen ${res.status} en ${path}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()) as T
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── Inventario ───────────────────────────────────────────────────────────────

interface AvatarGroup {
  id: string
  name: string
  group_type?: string
  train_status?: string
}

/** Grupos propios GENERADOS y ya entrenados. Excluye los basados en personas reales. */
async function listGeneratedGroups(): Promise<AvatarGroup[]> {
  const json = await api<{ data?: { avatar_group_list?: AvatarGroup[] } }>(
    '/v2/avatar_group.list?include_public=false',
  )
  return (json.data?.avatar_group_list ?? []).filter(
    (g) => g.group_type === 'GENERATED_PHOTO' && g.train_status === 'ready',
  )
}

/** Looks de un grupo, deduplicados: la API repite el mismo look varias veces. */
async function listGroupLooks(groupId: string): Promise<{ id: string; name: string }[]> {
  const json = await api<{ data?: { avatar_list?: { id: string; name: string }[] } }>(
    `/v2/avatar_group/${encodeURIComponent(groupId)}/avatars`,
  )
  const seen = new Map<string, { id: string; name: string }>()
  for (const l of json.data?.avatar_list ?? []) if (!seen.has(l.id)) seen.set(l.id, l)
  return [...seen.values()]
}

async function printInventory(): Promise<void> {
  const engine = heygenEngine()
  console.log(`\n${C.bold}Avatares generados de la cuenta${C.reset} ${dim(`(motor: ${engine})`)}\n`)

  const groups = await listGeneratedGroups()
  if (!groups.length) {
    console.log(warn('  No hay avatares generados y entrenados. Créalos con --create.'))
    return
  }

  for (const g of groups) {
    const looks = await listGroupLooks(g.id)
    console.log(`  ${C.bold}${g.name}${C.reset} ${dim(`· ${looks.length} look(s)`)}`)
    // Detallar TODOS los looks de un grupo con 50 sería un muro de texto y 50 peticiones;
    // con los primeros basta para elegir uno y copiar su id.
    for (const l of looks.slice(0, 5)) {
      const look = await fetchAvatarLook(l.id)
      if (!look) {
        console.log(`    ${bad('✗')} ${l.id}  ${dim('(no se pudo leer)')}`)
        continue
      }
      const usable = look.status === 'completed' && look.supportedEngines.includes(engine)
      console.log(
        `    ${usable ? ok('✓') : bad('✗')} ${C.cyan}${look.id}${C.reset}  ` +
          `${look.name.slice(0, 32).padEnd(34)}${dim(`${look.gender} · ${look.supportedEngines.join(',')}`)}`,
      )
    }
    if (looks.length > 5) console.log(dim(`    … y ${looks.length - 5} look(s) más`))
    console.log()
  }
}

// ── Validación del mapeo ─────────────────────────────────────────────────────

async function validateMapping(): Promise<boolean> {
  const engine = heygenEngine()
  const voices = listVoiceOptions()
  console.log(`${C.bold}Mapeo voz → presentador${C.reset}\n`)

  if (!voices.length) {
    console.log(warn('  ELEVENLABS_VOICES vacío o malformado.\n'))
    return false
  }

  // Una sola lectura por look aunque varias voces compartan cara.
  const looks = new Map<string, AvatarLook | null>()
  for (const v of voices) {
    const id = v.avatarId || process.env.HEYGEN_AVATAR_ID
    if (id && !looks.has(id)) looks.set(id, await fetchAvatarLook(id))
  }

  const uses = new Map<string, number>()
  let problems = 0

  for (const v of voices) {
    const id = v.avatarId || process.env.HEYGEN_AVATAR_ID
    const label = v.label.slice(0, 34).padEnd(36)

    if (!id) {
      console.log(`  ${bad('✗')} ${label}${bad('sin avatarId y sin HEYGEN_AVATAR_ID')}`)
      problems++
      continue
    }
    uses.set(id, (uses.get(id) ?? 0) + 1)

    const look = looks.get(id)
    if (!look) {
      console.log(`  ${bad('✗')} ${label}${bad(`look ${id} inexistente`)}`)
      problems++
      continue
    }
    const issues: string[] = []
    if (look.status !== 'completed') issues.push(`status=${look.status}`)
    if (!look.supportedEngines.includes(engine)) issues.push(`no soporta ${engine}`)

    const via = v.avatarId ? '' : dim(' (fallback)')
    if (issues.length) {
      console.log(`  ${bad('✗')} ${label}${look.name.slice(0, 26).padEnd(28)}${bad(issues.join(', '))}`)
      problems++
    } else {
      console.log(`  ${ok('✓')} ${label}${look.name.slice(0, 26).padEnd(28)}${dim(look.gender)}${via}`)
    }
  }

  const shared = [...uses.entries()].filter(([, n]) => n > 1)
  if (shared.length) {
    console.log(`\n  ${warn('!')} ${shared.length} cara(s) compartidas por varias voces:`)
    for (const [id, n] of shared) {
      console.log(dim(`      ${looks.get(id)?.name ?? id} → ${n} voces`))
    }
    console.log(dim('      Genera más presentadores con --create para que cada voz tenga la suya.'))
  }

  console.log(
    problems === 0
      ? `\n  ${ok(`Mapeo válido: ${voices.length} voces listas.`)}\n`
      : `\n  ${bad(`${problems} problema(s) en el mapeo.`)}\n`,
  )
  return problems === 0
}

// ── Creación de avatares ─────────────────────────────────────────────────────

async function createAvatar(prompt: string, name: string): Promise<void> {
  console.log(`\nCreando avatar ${C.bold}${name}${C.reset}…`)
  console.log(dim(`  prompt: ${prompt}\n`))

  const created = await api<{
    data?: { avatar_item?: { id?: string }; avatar_group?: { id?: string } }
  }>('/v3/avatars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'prompt', name, prompt }),
  })

  const lookId = created.data?.avatar_item?.id ?? created.data?.avatar_group?.id
  if (!lookId) {
    console.error(bad('  HeyGen no devolvió ningún id.'), JSON.stringify(created).slice(0, 300))
    process.exit(1)
  }
  console.log(`  id: ${C.cyan}${lookId}${C.reset}\n  Entrenando…`)

  const deadline = Date.now() + TRAIN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const look = await fetchAvatarLook(lookId)
    if (look?.status === 'completed') {
      const engine = heygenEngine()
      const usable = look.supportedEngines.includes(engine)
      console.log(`\n  ${ok('Listo.')} ${look.name} · ${look.gender} · ${look.supportedEngines.join(',')}`)
      if (!usable) console.log(`  ${warn(`Ojo: no soporta ${engine} (el motor configurado).`)}`)
      console.log(`\n  Añádelo a una voz en ELEVENLABS_VOICES:\n    ${dim(`"avatarId":"${lookId}"`)}\n`)
      return
    }
    if (look?.status === 'failed') {
      console.error(bad('\n  El entrenamiento falló.'))
      process.exit(1)
    }
    process.stdout.write('.')
    await sleep(POLL_INTERVAL_MS)
  }
  console.error(bad(`\n  Timeout tras ${TRAIN_TIMEOUT_MS / 60000} min. Revisa el estado en app.heygen.com.`))
  process.exit(1)
}

// ── Entrada ──────────────────────────────────────────────────────────────────

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const prompt = flag('create')
  if (prompt !== undefined) {
    if (!prompt || prompt.startsWith('--')) {
      console.error(bad('--create necesita un prompt: --create "profesora joven, fondo neutro"'))
      process.exit(1)
    }
    await createAvatar(prompt, flag('name') || `Presentador ${prompt.slice(0, 20)}`)
    return
  }

  await printInventory()
  const valid = await validateMapping()
  if (!valid) process.exit(1)
}

main().catch((err) => {
  console.error(bad(`\n${err instanceof Error ? err.message : String(err)}`))
  process.exit(1)
})
