import { CARD_LIMITS } from '@/config/constants'
import { translate } from '@/config/languages'
import { isZone, normalizeTranslations, type CardDraft } from '@/models/Card'
import type { Language } from '@/models/Language'

export interface CardValidationErrors {
  title?: string
  subtitle?: string
  attack?: string
  defense?: string
  action?: string
  zone?: string
  image?: string
  stars?: string
  translations?: string
}

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,/

const STAT_MIN = Math.min(CARD_LIMITS.attack.min, CARD_LIMITS.defense.min)
const STAT_MAX = Math.max(CARD_LIMITS.attack.max, CARD_LIMITS.defense.max)

export function parseStatValue(value: unknown): { ok: true; value: number } | { ok: false } {
  let numeric = Number.NaN

  if (typeof value === 'number') {
    numeric = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) numeric = Number(trimmed)
  }

  if (!Number.isFinite(numeric) || numeric < STAT_MIN || numeric > STAT_MAX) return { ok: false }

  return { ok: true, value: numeric }
}

/**
 * Text that will actually be shown for the given language, following the same
 * fallback used when rendering: a filled translation wins, otherwise English.
 */
function effectiveText(
  draft: Partial<CardDraft>,
  language: Language,
  field: 'title' | 'subtitle' | 'action',
): string {
  if (language !== 'EN') {
    const translation = normalizeTranslations(draft.translations)[language]
    const translated = translation?.[field]?.trim()
    if (translated) return translated
  }

  const base = draft[field]
  return typeof base === 'string' ? base.trim() : ''
}

export function validateCard(
  draft: Partial<CardDraft>,
  language: Language = 'EN',
): CardValidationErrors {
  const errors: CardValidationErrors = {}

  const title = effectiveText(draft, language, 'title')
  if (title.length === 0) {
    errors.title = translate('error.titleRequired', language)
  } else if (title.length > CARD_LIMITS.title.maxLength) {
    errors.title = translate('error.titleTooLong', language, { max: CARD_LIMITS.title.maxLength })
  }

  const subtitle = effectiveText(draft, language, 'subtitle')
  if (subtitle.length > CARD_LIMITS.subtitle.maxLength) {
    errors.subtitle = translate('error.subtitleTooLong', language, {
      max: CARD_LIMITS.subtitle.maxLength,
    })
  }

  const action = effectiveText(draft, language, 'action')
  if (action.length === 0) {
    errors.action = translate('error.actionRequired', language)
  } else if (action.length > CARD_LIMITS.action.maxLength) {
    errors.action = translate('error.actionTooLong', language, { max: CARD_LIMITS.action.maxLength })
  }

  if (!parseStatValue(draft.attack).ok) {
    errors.attack = translate('error.attackRange', language, { min: STAT_MIN, max: STAT_MAX })
  }

  if (!parseStatValue(draft.defense).ok) {
    errors.defense = translate('error.defenseRange', language, { min: STAT_MIN, max: STAT_MAX })
  }

  if (!isZone(draft.zone)) {
    errors.zone = translate('error.zoneInvalid', language)
  }

  if (draft.image !== undefined && draft.image !== null && draft.image !== '') {
    if (typeof draft.image !== 'string' || !DATA_IMAGE_PATTERN.test(draft.image)) {
      errors.image = translate('error.imageFormat', language)
    }
  }

  const stars = Number(draft.stars)
  if (
    !Number.isFinite(stars) ||
    !Number.isInteger(stars) ||
    stars < CARD_LIMITS.stars.min ||
    stars > CARD_LIMITS.stars.max
  ) {
    errors.stars = translate('error.starsRange', language, {
      min: CARD_LIMITS.stars.min,
      max: CARD_LIMITS.stars.max,
    })
  }

  for (const translation of Object.values(normalizeTranslations(draft.translations))) {
    if (
      translation.title.length > CARD_LIMITS.title.maxLength ||
      translation.subtitle.length > CARD_LIMITS.subtitle.maxLength ||
      translation.action.length > CARD_LIMITS.action.maxLength
    ) {
      errors.translations = translate('error.translationTooLong', language, {
        title: CARD_LIMITS.title.maxLength,
        action: CARD_LIMITS.action.maxLength,
      })
      break
    }
  }

  return errors
}

export function isCardValid(draft: Partial<CardDraft>, language: Language = 'EN'): boolean {
  return Object.keys(validateCard(draft, language)).length === 0
}
