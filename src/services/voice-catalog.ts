/**
 * Catálogo de "presentadores": cada voz del selector lleva asociada, opcionalmente, la
 * cara con la que se locuta. Vive en `ELEVENLABS_VOICES` (JSON en el entorno) para que
 * añadir o reemparejar presentadores no requiera tocar código.
 *
 * `avatarId` es un LOOK id de HeyGen (`GET /v3/avatars/looks/{id}`), NO el id del grupo:
 * es el valor que espera `avatar_id` en `POST /v3/videos`. Que un id de grupo funcione a
 * veces es casualidad de los grupos de un solo look, donde ambos ids coinciden.
 *
 * Parseo deliberadamente tolerante (igual que el que había inline en /api/voices): un JSON
 * malformado deja el catálogo vacío en vez de tumbar el arranque, y la UI cae al selector
 * mínimo construido con ELEVENLABS_VOICE_ID.
 */

export interface VoiceOption {
  id: string
  label: string
  /** Look de HeyGen que pone cara a esta voz. Sin él se usa HEYGEN_AVATAR_ID. */
  avatarId?: string
}

function isVoiceOption(v: unknown): v is VoiceOption {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.label !== 'string') return false
  return o.avatarId === undefined || typeof o.avatarId === 'string'
}

/**
 * Voces del selector de la UI. Si `ELEVENLABS_VOICES` falta o está malformado pero hay
 * `ELEVENLABS_VOICE_ID`, se devuelve esa única voz como "Voz por defecto".
 */
export function listVoiceOptions(): VoiceOption[] {
  const raw = process.env.ELEVENLABS_VOICES
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        const voices = parsed.filter(isVoiceOption)
        if (voices.length) return voices
      }
    } catch {
      // ELEVENLABS_VOICES malformado: caemos al fallback de abajo (no rompemos).
    }
  }

  const fallback = process.env.ELEVENLABS_VOICE_ID
  return fallback ? [{ id: fallback, label: 'Voz por defecto' }] : []
}

/**
 * Look de HeyGen con el que se graba una voz concreta. Sin mapeo explícito cae a
 * `HEYGEN_AVATAR_ID`, que actúa de presentador por defecto para voces sin emparejar.
 */
export function avatarIdForVoice(voiceId: string): string | undefined {
  const mapped = listVoiceOptions().find((v) => v.id === voiceId)?.avatarId
  return mapped || process.env.HEYGEN_AVATAR_ID || undefined
}

/** True si alguna voz del catálogo declara su propio avatar. */
export function hasVoiceAvatars(): boolean {
  return listVoiceOptions().some((v) => Boolean(v.avatarId))
}
