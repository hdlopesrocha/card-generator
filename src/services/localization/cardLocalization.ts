import type { Card, CardTranslation } from '@/models/Card'
import type { Language } from '@/models/Language'

/**
 * Localization helpers for card content.
 *
 * English lives in the base card fields; other languages are stored in
 * `card.translations`. Empty or missing values fall back to English per
 * field, so a partially translated card always renders completely.
 */
export function getTranslation(card: Card, language: Language): CardTranslation | undefined {
  if (language === 'EN') return undefined
  return card.translations?.[language]
}

function pick(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback
}

/** Returns a copy of the card with its text resolved for `language`. */
export function getLocalizedCard(card: Card, language: Language): Card {
  if (language === 'EN') return card

  const translation = getTranslation(card, language)

  return {
    ...card,
    title: pick(translation?.title, card.title),
    subtitle: pick(translation?.subtitle, card.subtitle),
    action: pick(translation?.action, card.action),
  }
}

/** True when the language has at least one translated text field. */
export function hasTranslation(card: Card, language: Language): boolean {
  const translation = getTranslation(card, language)
  if (!translation) return false

  return [translation.title, translation.subtitle, translation.action].some(
    (value) => value.trim().length > 0,
  )
}
