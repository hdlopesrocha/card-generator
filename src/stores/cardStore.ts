import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { DEMO_SEEDED_KEY } from '@/config/constants'
import { createSampleCardsWithImages } from '@/data/sampleCards'
import { cardFromDraft, createCardId } from '@/models/Card'
import type { Card, CardDraft } from '@/models/Card'
import {
  collectDemoSync,
  hashesForCards,
  readDemoHashes,
  writeDemoHashes,
} from '@/services/demo/demoSync'
import { getCardRepository, StorageUnavailableError } from '@/services/storage/indexedDb'
import { validateCard } from '@/services/validation/cardValidation'
import { useLanguageStore } from '@/stores/languageStore'

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function wasDemoSeeded(): boolean {
  const storage = getStorage()
  if (!storage) return false

  try {
    return storage.getItem(DEMO_SEEDED_KEY) !== null
  } catch {
    return false
  }
}

function markDemoSeeded(): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(DEMO_SEEDED_KEY, 'true')
  } catch {
    return
  }
}

function describeFailure(caught: unknown, storageMessage: string, fallback: string): string {
  return caught instanceof StorageUnavailableError ? storageMessage : fallback
}

export const useCardStore = defineStore('cards', () => {
  const cards = ref<Card[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  const sortedCards = computed(() =>
    [...cards.value].sort((a, b) => {
      const titleA = a.title || 'Untitled Card'
      const titleB = b.title || 'Untitled Card'
      return titleA.localeCompare(titleB)
    }),
  )

  const cardCount = computed(() => cards.value.length)

  function getCardById(id: string): Card | undefined {
    return cards.value.find((card) => card.id === id)
  }

  function mergeCards(updated: Card[]): void {
    const merged = [...cards.value]

    for (const card of updated) {
      const index = merged.findIndex((existing) => existing.id === card.id)
      if (index >= 0) {
        merged[index] = card
      } else {
        merged.push(card)
      }
    }

    cards.value = merged
  }

  async function loadCards(): Promise<void> {
    if (initialized.value) return

    const languageStore = useLanguageStore()
    loading.value = true
    error.value = null

    try {
      const repository = getCardRepository()
      const total = await repository.count()

      if (total === 0 && !wasDemoSeeded()) {
        const samples = await createSampleCardsWithImages()
        await repository.bulkPut(samples)
        writeDemoHashes(hashesForCards(samples))
        markDemoSeeded()
      }

      const loaded = await repository.getAll()
      const { updates, hashes, hashesChanged } = await collectDemoSync(loaded, readDemoHashes())

      if (hashesChanged) {
        writeDemoHashes(hashes)
      }

      if (updates.length > 0) {
        await repository.bulkPut(updates)
        const byId = new Map(updates.map((card) => [card.id, card]))
        cards.value = loaded.map((card) => byId.get(card.id) ?? card)
      } else {
        cards.value = loaded
      }

      initialized.value = true
    } catch (caught) {
      console.error('Failed to load cards from IndexedDB.', caught)
      error.value = describeFailure(
        caught,
        languageStore.t('store.storageUnavailable'),
        languageStore.t('store.cardsLoadFailed'),
      )
    } finally {
      loading.value = false
    }
  }

  async function saveCard(draft: CardDraft): Promise<Card | null> {
    const languageStore = useLanguageStore()
    const validationErrors = validateCard(draft, languageStore.language)
    if (Object.keys(validationErrors).length > 0) {
      error.value = languageStore.t('store.fixFields')
      return null
    }

    saving.value = true
    error.value = null

    try {
      const repository = getCardRepository()
      const card = cardFromDraft(draft, languageStore.language)
      await repository.put(card)
      mergeCards([card])
      return card
    } catch (caught) {
      console.error('Failed to save the card to IndexedDB.', caught)
      error.value = describeFailure(
        caught,
        languageStore.t('store.storageUnavailable'),
        languageStore.t('store.cardSaveFailed'),
      )
      return null
    } finally {
      saving.value = false
    }
  }

  async function deleteCard(id: string): Promise<boolean> {
    const languageStore = useLanguageStore()
    error.value = null

    try {
      await getCardRepository().delete(id)
      cards.value = cards.value.filter((card) => card.id !== id)
      return true
    } catch (caught) {
      console.error('Failed to delete the card from IndexedDB.', caught)
      error.value = describeFailure(
        caught,
        languageStore.t('store.storageUnavailable'),
        languageStore.t('store.cardDeleteFailed'),
      )
      return false
    }
  }

  async function clearAllCards(): Promise<boolean> {
    const languageStore = useLanguageStore()
    error.value = null

    try {
      await getCardRepository().clear()
      cards.value = []
      return true
    } catch (caught) {
      console.error('Failed to clear the cards from IndexedDB.', caught)
      error.value = describeFailure(
        caught,
        languageStore.t('store.storageUnavailable'),
        languageStore.t('store.cardsDeleteFailed'),
      )
      return false
    }
  }

  async function restoreDemoCards(): Promise<number> {
    const languageStore = useLanguageStore()
    error.value = null

    try {
      const repository = getCardRepository()
      const existingIds = new Set(cards.value.map((card) => card.id))
      const samples = await createSampleCardsWithImages()
      const restored = samples.map((card) =>
        existingIds.has(card.id) ? { ...card, id: createCardId() } : card,
      )

      await repository.bulkPut(restored)
      mergeCards(restored)

      const freshSamples = restored.filter((card) =>
        samples.some((sample) => sample.id === card.id),
      )
      if (freshSamples.length > 0) {
        writeDemoHashes({ ...readDemoHashes(), ...hashesForCards(freshSamples) })
      }

      return restored.length
    } catch (caught) {
      console.error('Failed to restore the demo cards.', caught)
      error.value = describeFailure(
        caught,
        languageStore.t('store.storageUnavailable'),
        languageStore.t('store.demoRestoreFailed'),
      )
      return 0
    }
  }

  async function importCards(imported: Card[]): Promise<number> {
    const languageStore = useLanguageStore()
    error.value = null

    try {
      const repository = getCardRepository()
      const uniqueById = new Map(imported.map((card) => [card.id, card]))
      const cardsToStore = [...uniqueById.values()]
      await repository.bulkPut(cardsToStore)
      mergeCards(cardsToStore)
      return cardsToStore.length
    } catch (caught) {
      console.error('Failed to import the cards.', caught)
      error.value = describeFailure(
        caught,
        languageStore.t('store.storageUnavailable'),
        languageStore.t('store.cardsImportFailed'),
      )
      return 0
    }
  }

  function clearError(): void {
    error.value = null
  }

  return {
    cards,
    loading,
    saving,
    error,
    initialized,
    sortedCards,
    cardCount,
    loadCards,
    getCardById,
    saveCard,
    deleteCard,
    clearAllCards,
    restoreDemoCards,
    importCards,
    clearError,
  }
})
