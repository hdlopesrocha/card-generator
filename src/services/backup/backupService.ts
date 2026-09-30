import { BACKUP_APP_ID, BACKUP_VERSION, CARD_LIMITS } from '@/config/constants'
import { translate } from '@/config/languages'
import {
  createCardId,
  isZone,
  normalizeTranslations,
  normalizeZone,
  type Card,
  type CardTranslations,
} from '@/models/Card'
import { isLanguage, type Language } from '@/models/Language'
import { isCardValid, parseStatValue } from '@/services/validation/cardValidation'

export interface CardBackup {
  appId: string
  version: number
  exportedAt: string
  cards: Card[]
}

export type BackupParseResult =
  | { ok: true; cards: Card[] }
  | { ok: false; error: string }

export function createBackup(cards: Card[]): CardBackup {
  return {
    appId: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    cards: cards.map((card) => ({ ...card })),
  }
}

export function serializeBackup(cards: Card[]): string {
  return JSON.stringify(createBackup(cards), null, 2)
}

export function parseBackup(json: string, language: Language = 'EN'): BackupParseResult {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return { ok: false, error: translate('error.backupInvalid', language) }
  }

  if (!isRecord(value)) return { ok: false, error: translate('error.backupInvalid', language) }

  const appId = typeof value.appId === 'string' ? value.appId : typeof value.app === 'string' ? value.app : ''
  if (appId !== BACKUP_APP_ID) return { ok: false, error: translate('error.backupInvalid', language) }

  if (value.version !== BACKUP_VERSION) {
    return { ok: false, error: translate('error.backupVersion', language) }
  }

  if (!Array.isArray(value.cards)) return { ok: false, error: translate('error.backupInvalid', language) }

  const cards: Card[] = []
  for (const rawCard of value.cards) {
    const card = normalizeImportedCard(rawCard)
    if (!card) return { ok: false, error: translate('error.backupCardInvalid', language) }
    cards.push(card)
  }

  return { ok: true, cards }
}

export async function parseBackupFile(file: File, language: Language = 'EN'): Promise<BackupParseResult> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: translate('error.backupRead', language) }
  }
  return parseBackup(text, language)
}

export function downloadBackup(cards: Card[], fileName?: string): void {
  const blob = new Blob([serializeBackup(cards)], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = sanitizeFileName(fileName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Strictly validates imported translations. Legacy cards without translations
 * are valid and receive an empty object; malformed entries invalidate the card.
 */
function normalizeImportedTranslations(value: unknown): CardTranslations | null {
  if (value === undefined || value === null) return {}

  if (!isRecord(value)) return null

  for (const [language, entry] of Object.entries(value)) {
    if (!isLanguage(language)) continue
    if (!isRecord(entry)) return null

    const { title, subtitle, action } = entry
    if (title !== undefined && typeof title !== 'string') return null
    if (subtitle !== undefined && typeof subtitle !== 'string') return null
    if (action !== undefined && typeof action !== 'string') return null

    if (
      (typeof title === 'string' && title.length > CARD_LIMITS.title.maxLength) ||
      (typeof subtitle === 'string' && subtitle.length > CARD_LIMITS.subtitle.maxLength) ||
      (typeof action === 'string' && action.length > CARD_LIMITS.action.maxLength)
    ) {
      return null
    }
  }

  return normalizeTranslations(value)
}

function normalizeImportedCard(value: unknown): Card | null {
  if (!isRecord(value)) return null

  const attack = parseStatValue(value.attack)
  const defense = parseStatValue(value.defense)
  if (!attack.ok || !defense.ok) return null

  if (!isZone(value.zone)) return null

  const title = typeof value.title === 'string' ? value.title : ''
  const subtitle = typeof value.subtitle === 'string' ? value.subtitle : ''
  const action = typeof value.action === 'string' ? value.action : ''
  const image = typeof value.image === 'string' ? value.image : null

  const translations = normalizeImportedTranslations(value.translations)
  if (translations === null) return null

  // Backups created before the stars field existed default to one star.
  let stars = 1
  if (value.stars !== undefined && value.stars !== null && value.stars !== '') {
    const numeric = Number(value.stars)
    if (!Number.isInteger(numeric) || numeric < CARD_LIMITS.stars.min || numeric > CARD_LIMITS.stars.max) {
      return null
    }
    stars = numeric
  }

  const valid = isCardValid({
    title,
    subtitle,
    action,
    attack: attack.value,
    defense: defense.value,
    image,
    zone: value.zone,
    stars,
  })
  if (!valid) return null

  return {
    id: typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : createCardId(),
    title: title.trim(),
    subtitle: subtitle.trim(),
    attack: attack.value,
    defense: defense.value,
    action: action.trim(),
    image,
    zone: normalizeZone(value.zone),
    stars,
    translations,
  }
}

function sanitizeFileName(fileName?: string): string {
  const fallback = `card-generator-backup-${new Date().toISOString().slice(0, 10)}.json`
  if (!fileName) return fallback

  const cleaned = fileName.replace(/[\\/:*?"<>|]+/g, '-').trim()
  return cleaned.length > 0 ? cleaned : fallback
}
