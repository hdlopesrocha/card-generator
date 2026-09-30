import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { STORAGE_KEYS } from '@/config/constants'
import { CARD_TEXT_LABELS, MESSAGES, translate, ZONE_LABELS, type MessageKey } from '@/config/languages'
import { createSampleCards } from '@/data/sampleCards'
import { Zone, type Card } from '@/models/Card'
import { LANGUAGES, type Language } from '@/models/Language'
import { getLocalizedCard, getTranslation, hasTranslation } from '@/services/localization/cardLocalization'
import { useLanguageStore } from '@/stores/languageStore'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'localized-card',
    title: 'Fire Drake',
    subtitle: 'Crimson brood',
    attack: 7,
    defense: 4,
    action: 'Deal 2 damage to every enemy in the front row.',
    image: null,
    zone: Zone.ATTACK,
    stars: 2,
    ...overrides,
    translations: overrides.translations ?? {},
  }
}

describe('MESSAGES', () => {
  it('defines a non-empty string for every key in all seven languages', () => {
    const entries = Object.entries(MESSAGES)
    expect(entries.length).toBeGreaterThan(0)

    for (const [key, entry] of entries) {
      for (const { code } of LANGUAGES) {
        const value: string = entry[code]
        expect(typeof value, `${key} [${code}]`).toBe('string')
        expect(value.trim().length, `${key} [${code}]`).toBeGreaterThan(0)
      }
    }
  })
})

describe('card text and zone labels', () => {
  it('defines every card text label for all languages', () => {
    for (const { code } of LANGUAGES) {
      const labels = CARD_TEXT_LABELS[code]

      for (const [name, value] of Object.entries(labels)) {
        expect(typeof value, `${name} [${code}]`).toBe('string')
        expect(value.trim().length, `${name} [${code}]`).toBeGreaterThan(0)
      }
    }
  })

  it('defines every zone label for all languages', () => {
    for (const zone of [Zone.ATTACK, Zone.MIDFIELD, Zone.DEFENSE]) {
      for (const { code } of LANGUAGES) {
        const value = ZONE_LABELS[zone][code]
        expect(typeof value, `${zone} [${code}]`).toBe('string')
        expect(value.trim().length, `${zone} [${code}]`).toBeGreaterThan(0)
      }
    }
  })
})

describe('translate', () => {
  it('interpolates {name} parameters', () => {
    expect(translate('cards.subtitleOne', 'EN', { count: 1 })).toBe('1 card in your local collection')
    expect(translate('cards.subtitleMany', 'PT', { count: 4 })).toBe('4 cartas na sua coleção local')
    expect(translate('cards.deleteAllMessage', 'EN', { count: 2 })).toContain('All 2 stored')
  })

  it('keeps unknown placeholders when the parameter is missing', () => {
    expect(translate('cards.subtitleMany', 'EN', {})).toContain('{count}')
    expect(translate('cards.subtitleMany', 'EN')).toContain('{count}')
  })

  it('falls back to English for an unknown language', () => {
    expect(translate('nav.cards', 'XX' as unknown as Language)).toBe('Cards')
    expect(translate('error.actionRequired', 'XX' as unknown as Language)).toBe('Action is required.')
  })

  it('returns the key itself for an unknown message key', () => {
    expect(translate('does.not.exist' as unknown as MessageKey, 'EN')).toBe('does.not.exist')
    expect(translate('does.not.exist' as unknown as MessageKey, 'PT')).toBe('does.not.exist')
  })
})

describe('getLocalizedCard / getTranslation / hasTranslation', () => {
  const partial = makeCard({
    translations: {
      PT: { title: 'Dragão de Fogo', subtitle: '', action: '   ' },
      FR: { title: '', subtitle: '', action: '' },
    },
  })

  it('returns the base card for English', () => {
    expect(getLocalizedCard(partial, 'EN')).toBe(partial)
  })

  it('replaces every field when the translation is complete', () => {
    const complete = makeCard({
      translations: {
        PT: {
          title: 'Dragão de Fogo',
          subtitle: 'Ninhada carmesim',
          action: 'Causa 2 de dano a todos os inimigos.',
        },
      },
    })

    const localized = getLocalizedCard(complete, 'PT')

    expect(localized).not.toBe(complete)
    expect(localized.title).toBe('Dragão de Fogo')
    expect(localized.subtitle).toBe('Ninhada carmesim')
    expect(localized.action).toBe('Causa 2 de dano a todos os inimigos.')
    expect(complete.title).toBe('Fire Drake')
  })

  it('falls back to English per field for empty or missing translations', () => {
    const portuguese = getLocalizedCard(partial, 'PT')
    expect(portuguese.title).toBe('Dragão de Fogo')
    expect(portuguese.subtitle).toBe('Crimson brood')
    expect(portuguese.action).toBe('Deal 2 damage to every enemy in the front row.')

    const blankFrench = getLocalizedCard(partial, 'FR')
    expect(blankFrench.title).toBe('Fire Drake')
    expect(blankFrench.subtitle).toBe('Crimson brood')
    expect(blankFrench.action).toBe('Deal 2 damage to every enemy in the front row.')

    const missingGerman = getLocalizedCard(partial, 'DE')
    expect(missingGerman.title).toBe('Fire Drake')
    expect(missingGerman.subtitle).toBe('Crimson brood')
    expect(missingGerman.action).toBe('Deal 2 damage to every enemy in the front row.')
  })

  it('exposes translations and reports whether a language has content', () => {
    expect(getTranslation(partial, 'EN')).toBeUndefined()
    expect(getTranslation(partial, 'PT')).toBe(partial.translations.PT)
    expect(getTranslation(partial, 'DE')).toBeUndefined()

    expect(hasTranslation(partial, 'EN')).toBe(false)
    expect(hasTranslation(partial, 'PT')).toBe(true)
    expect(hasTranslation(partial, 'FR')).toBe(false)
    expect(hasTranslation(partial, 'DE')).toBe(false)
    expect(hasTranslation(makeCard(), 'PT')).toBe(false)
  })
})

describe('languageStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('defaults to English', () => {
    const store = useLanguageStore()

    expect(store.language).toBe('EN')
    expect(store.t('nav.cards')).toBe('Cards')
  })

  it('updates the language, translations and persists the choice', async () => {
    const store = useLanguageStore()

    store.setLanguage('FR')
    await nextTick()

    expect(store.language).toBe('FR')
    expect(store.t('nav.cards')).toBe('Cartes')
    expect(localStorage.getItem(STORAGE_KEYS.language)).toBe('FR')
  })

  it('restores a stored language when the store is created', () => {
    localStorage.setItem(STORAGE_KEYS.language, 'DE')
    setActivePinia(createPinia())

    const store = useLanguageStore()

    expect(store.language).toBe('DE')
    expect(store.t('nav.cards')).toBe('Karten')
  })

  it('ignores invalid stored values and falls back to English', () => {
    localStorage.setItem(STORAGE_KEYS.language, 'KLINGON')
    setActivePinia(createPinia())

    const store = useLanguageStore()

    expect(store.language).toBe('EN')
  })

  it('ignores invalid language values passed to setLanguage', () => {
    const store = useLanguageStore()

    store.setLanguage('XX' as unknown as Language)

    expect(store.language).toBe('EN')
  })
})

describe('demo cards', () => {
  it('ships three cards with exactly PT, FR, ES, DE, NL and IT translations', () => {
    const cards = createSampleCards()
    const translated: Language[] = ['PT', 'FR', 'ES', 'DE', 'NL', 'IT']

    expect(cards).toHaveLength(3)

    for (const card of cards) {
      expect(Object.keys(card.translations).sort()).toEqual([...translated].sort())
      expect(card.translations.EN).toBeUndefined()

      for (const language of translated) {
        const translation = card.translations[language]
        expect(translation, `${card.id} ${language}`).toBeDefined()
        expect(translation?.title.trim(), `${card.id} ${language} title`).not.toBe('')
        expect(translation?.subtitle.trim(), `${card.id} ${language} subtitle`).not.toBe('')
        expect(translation?.action.trim(), `${card.id} ${language} action`).not.toBe('')
      }
    }
  })
})
