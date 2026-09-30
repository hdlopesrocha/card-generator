import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { DEMO_SEEDED_KEY } from '@/config/constants'
import { createSampleCards } from '@/data/sampleCards'
import { getCardRepository } from '@/services/storage/indexedDb'
import { useCardStore } from '@/stores/cardStore'
import { useLanguageStore } from '@/stores/languageStore'
import type { Card } from '@/models/Card'

async function resetStorage(): Promise<void> {
  localStorage.removeItem(DEMO_SEEDED_KEY)
  await getCardRepository().clear()
  setActivePinia(createPinia())
}

describe('demo card seeding and migration', () => {
  beforeEach(async () => {
    await resetStorage()
  })

  it('seeds the demo cards with their artwork', async () => {
    const store = useCardStore()
    await store.loadCards()

    expect(store.cardCount).toBe(3)

    for (const card of store.cards) {
      expect(card.image).toMatch(/^data:image\//)
      expect(card.imageRef).toMatch(/^img[123]\.jpeg$/)
      expect(Object.keys(card.translations).sort()).toEqual(['DE', 'ES', 'FR', 'IT', 'NL', 'PT'])
    }

    const warrior = store.getCardById('sample-warrior')
    expect(warrior?.imageRef).toBe('img1.jpeg')
  })

  it('upgrades demo cards stored before translations and artwork existed', async () => {
    const repository = getCardRepository()

    const legacyCards = createSampleCards().map((card) => {
      const copy: Record<string, unknown> = { ...card }
      delete copy.translations
      delete copy.image
      delete copy.imageRef
      return copy as unknown as Card
    })
    await repository.bulkPut(legacyCards)
    localStorage.setItem(DEMO_SEEDED_KEY, 'true')

    const store = useCardStore()
    await store.loadCards()

    const languageStore = useLanguageStore()
    languageStore.setLanguage('PT')

    const warrior = store.getCardById('sample-warrior')
    expect(warrior?.translations?.PT?.title).toBe('Guerreiro')
    expect(warrior?.image).toMatch(/^data:image\//)
    expect(warrior?.imageRef).toBe('img1.jpeg')
    expect(store.getCardById('sample-guardian')?.translations?.DE?.title).toBe('Wächter')
    expect(store.getCardById('sample-tactician')?.imageRef).toBe('img2.jpeg')
  })
})
