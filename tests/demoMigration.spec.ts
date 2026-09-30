import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { DEMO_SEEDED_KEY } from '@/config/constants'
import { createSampleCards } from '@/data/sampleCards'
import { getCardRepository } from '@/services/storage/indexedDb'
import { useCardStore } from '@/stores/cardStore'
import { useLanguageStore } from '@/stores/languageStore'
import type { Card } from '@/models/Card'

describe('legacy demo card data', () => {
  it('upgrades demo cards that were stored before translations existed', async () => {
    const repository = getCardRepository()
    await repository.clear()

    const legacyCards = createSampleCards().map((card) => {
      const copy: Record<string, unknown> = { ...card }
      delete copy.translations
      return copy as unknown as Card
    })
    await repository.bulkPut(legacyCards)
    localStorage.setItem(DEMO_SEEDED_KEY, 'true')

    const pinia = createPinia()
    setActivePinia(pinia)

    const store = useCardStore()
    await store.loadCards()

    const languageStore = useLanguageStore()
    languageStore.setLanguage('PT')

    const warrior = store.getCardById('sample-warrior')
    expect(warrior?.translations?.PT?.title).toBe('Guerreiro')
    expect(store.getCardById('sample-guardian')?.translations?.DE?.title).toBe('Wächter')
  })
})
