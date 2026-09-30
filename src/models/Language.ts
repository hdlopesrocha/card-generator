/**
 * Card content languages.
 *
 * This module deliberately has no imports so both the card model and the
 * localization configuration can depend on it without creating a cycle.
 */
export type Language = 'EN' | 'PT' | 'FR' | 'ES' | 'DE' | 'NL' | 'IT'

export interface LanguageOption {
  code: Language
  /** English name shown in selectors. */
  name: string
  /** BCP 47 tag. */
  tag: string
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'EN', name: 'English', tag: 'en' },
  { code: 'PT', name: 'Portuguese', tag: 'pt' },
  { code: 'FR', name: 'French', tag: 'fr' },
  { code: 'ES', name: 'Spanish', tag: 'es' },
  { code: 'DE', name: 'German', tag: 'de' },
  { code: 'NL', name: 'Dutch', tag: 'nl' },
  { code: 'IT', name: 'Italian', tag: 'it' },
]

export const DEFAULT_LANGUAGE: Language = 'EN'

const LANGUAGE_CODES: readonly string[] = LANGUAGES.map((language) => language.code)

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LANGUAGE_CODES.includes(value)
}

export function getLanguageName(language: Language): string {
  return LANGUAGES.find((option) => option.code === language)?.name ?? 'English'
}
