/**
 * Domain model for a game card.
 *
 * Each card contains exactly the fields below. The card is a pure data
 * object: it never holds DOM nodes, file handles or object URLs so it can
 * be safely persisted to IndexedDB and exported to JSON.
 */

import { isLanguage, type Language } from '@/models/Language'

/** Visual theme of a card. The zone is a card theme, not a field diagram. */
export enum Zone {
  ATTACK = 'ATTACK',
  MIDFIELD = 'MIDFIELD',
  DEFENSE = 'DEFENSE',
}

/** Translatable text of a card. English lives on the card itself. */
export interface CardTranslation {
  title: string
  subtitle: string
  action: string
}

export type CardTranslations = Partial<Record<Language, CardTranslation>>

export interface Card {
  id: string
  title: string
  subtitle: string
  attack: number
  defense: number
  action: string
  image: string | null
  zone: Zone
  stars: number
  /**
   * Non-English text variants keyed by language. English is stored in the
   * base fields above; missing languages fall back to English when rendered.
   */
  translations: CardTranslations
}

/**
 * Editable representation of a card. `id` is absent while a card has not
 * been saved yet and present when editing an existing card.
 */
export type CardDraft = Omit<Card, 'id'> & { id?: string }

const ZONE_VALUES: readonly string[] = Object.values(Zone)

/** Type guard used by import validation and route parameters. */
export function isZone(value: unknown): value is Zone {
  return typeof value === 'string' && ZONE_VALUES.includes(value)
}

/** Unique, collision-safe identifier for a card. */
export function createCardId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Normalizes a persisted/imported card and guarantees a valid zone. */
export function normalizeZone(value: unknown, fallback: Zone = Zone.ATTACK): Zone {
  return isZone(value) ? value : fallback
}

const MIN_STARS = 1
const MAX_STARS = 3

/** Coerces a value to an integer within the 1-3 star range. */
export function normalizeStars(value: unknown, fallback = MIN_STARS): number {
  const numeric = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numeric)) return fallback

  return Math.min(MAX_STARS, Math.max(MIN_STARS, Math.round(numeric)))
}

/** Safely reads the translations object of a card or draft. */
export function normalizeTranslations(value: unknown): CardTranslations {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const translations: CardTranslations = {}

  for (const language of Object.keys(value)) {
    if (!isLanguage(language)) continue

    const entry = (value as Record<string, unknown>)[language]
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue

    const record = entry as Record<string, unknown>
    translations[language] = {
      title: typeof record.title === 'string' ? record.title : '',
      subtitle: typeof record.subtitle === 'string' ? record.subtitle : '',
      action: typeof record.action === 'string' ? record.action : '',
    }
  }

  return translations
}

export function createEmptyCardDraft(zone: Zone = Zone.ATTACK): CardDraft {
  return {
    title: '',
    subtitle: '',
    attack: 0,
    defense: 0,
    action: '',
    image: null,
    zone,
    stars: MIN_STARS,
    translations: {},
  }
}

/**
 * Copies a draft and assigns an identifier, producing a persistable card.
 *
 * When the base (English) text is empty but the language currently being
 * edited has content, that content also becomes the base so the card always
 * renders completely and can be translated later.
 */
export function cardFromDraft(draft: CardDraft, language: Language = 'EN'): Card {
  const translations = normalizeTranslations(draft.translations)
  const edited = language !== 'EN' ? translations[language] : undefined
  const pick = (base: string, field: keyof CardTranslation): string =>
    base.trim() || edited?.[field]?.trim() || ''

  return {
    id: draft.id ?? createCardId(),
    title: pick(draft.title, 'title'),
    subtitle: pick(draft.subtitle, 'subtitle'),
    attack: Number(draft.attack),
    defense: Number(draft.defense),
    action: pick(draft.action, 'action'),
    image: draft.image,
    zone: normalizeZone(draft.zone),
    stars: normalizeStars(draft.stars),
    translations,
  }
}

/** Produces an editable copy of a persisted card. */
export function draftFromCard(card: Card): CardDraft {
  return {
    id: card.id,
    title: card.title,
    subtitle: card.subtitle,
    attack: card.attack,
    defense: card.defense,
    action: card.action,
    image: card.image,
    zone: card.zone,
    stars: normalizeStars(card.stars),
    translations: normalizeTranslations(card.translations),
  }
}
