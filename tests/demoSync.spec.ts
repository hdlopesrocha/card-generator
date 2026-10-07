import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { DEMO_HASHES_KEY, DEMO_SEEDED_KEY } from '@/config/constants'
import { createSampleCards } from '@/data/sampleCards'
import {
  hashDemoContent,
  readDemoHashes,
  writeDemoHashes,
} from '@/services/demo/demoSync'
import { getCardRepository } from '@/services/storage/indexedDb'
import { useCardStore } from '@/stores/cardStore'
import type { Card } from '@/models/Card'

async function resetStorage(): Promise<void> {
  localStorage.removeItem(DEMO_SEEDED_KEY)
  localStorage.removeItem(DEMO_HASHES_KEY)
  await getCardRepository().clear()
  setActivePinia(createPinia())
}

/** Fresh store instance sharing the same IndexedDB and localStorage. */
function freshStore() {
  setActivePinia(createPinia())
  return useCardStore()
}

function sampleGuardian(): Card {
  const guardian = createSampleCards().find((card) => card.id === 'sample-guardian')
  if (!guardian) throw new Error('sample guardian not found')
  // Plain, non-reactive copy: store objects are Vue proxies which the
  // structured clone of IndexedDB implementations rejects.
  return JSON.parse(JSON.stringify(guardian)) as Card
}

describe('demo card hash synchronization', () => {
  beforeEach(async () => {
    await resetStorage()
  })

  it('records content hashes when seeding and stays stable on reload', async () => {
    const store = useCardStore()
    await store.loadCards()

    const hashes = readDemoHashes()
    expect(Object.keys(hashes).sort()).toEqual([
      'sample-guardian',
      'sample-tactician',
      'sample-warrior',
    ])

    const guardian = store.getCardById('sample-guardian')
    expect(guardian?.attack).toBe(30)
    expect(hashes['sample-guardian']).toBe(hashDemoContent(guardian!))

    const reloaded = freshStore()
    await reloaded.loadCards()

    expect(reloaded.cardCount).toBe(3)
    expect(reloaded.getCardById('sample-guardian')?.attack).toBe(30)
    expect(readDemoHashes()).toEqual(hashes)
  })

  it('refreshes a pristine demo card when the bundled definition changes', async () => {
    const store = useCardStore()
    await store.loadCards()
    expect(store.getCardById('sample-guardian')?.attack).toBe(30)

    // Simulate the previously synced state: the bundle used to say 60 and
    // the stored card matched it, so the recorded hash is the 60-version.
    const repository = getCardRepository()
    const previous = { ...sampleGuardian(), attack: 60 }
    await repository.put(previous)
    writeDemoHashes({ ...readDemoHashes(), [previous.id]: hashDemoContent(previous) })

    const reloaded = freshStore()
    await reloaded.loadCards()

    const synced = reloaded.getCardById('sample-guardian')
    expect(synced?.attack).toBe(30)
    expect(synced?.title).toBe('Guardian')
    expect(synced?.defense).toBe(140)
    expect(synced?.translations.PT?.title).toBe('Guardião')
    expect(synced?.image).toMatch(/^data:image\//)
    expect(readDemoHashes()[previous.id]).toBe(hashDemoContent(synced!))
  })

  it('never overwrites a card the user customized, even when the bundle changes', async () => {
    const store = useCardStore()
    await store.loadCards()

    // Bundle changed (60 -> 30) but the user also renamed their copy: the
    // stored card no longer matches the last-synced hash, so it is skipped.
    const repository = getCardRepository()
    const previouslySynced = { ...sampleGuardian(), attack: 60 }
    const customized = { ...previouslySynced, title: 'My Guardian' }
    await repository.put(customized)
    writeDemoHashes({ ...readDemoHashes(), [customized.id]: hashDemoContent(previouslySynced) })

    const reloaded = freshStore()
    await reloaded.loadCards()

    const kept = reloaded.getCardById('sample-guardian')
    expect(kept?.title).toBe('My Guardian')
    expect(kept?.attack).toBe(60)
  })

  it('refreshes legacy demo cards without recorded hashes when texts are pristine', async () => {
    const store = useCardStore()
    await store.loadCards()

    // Databases seeded before hash tracking have the flag but no hashes.
    const repository = getCardRepository()
    const stale = { ...sampleGuardian(), attack: 60 }
    await repository.put(stale)
    localStorage.removeItem(DEMO_HASHES_KEY)
    localStorage.setItem(DEMO_SEEDED_KEY, 'true')

    const reloaded = freshStore()
    await reloaded.loadCards()

    const synced = reloaded.getCardById('sample-guardian')
    expect(synced?.attack).toBe(30)
    expect(synced?.translations.PT?.title).toBe('Guardião')
    expect(readDemoHashes()[stale.id]).toBe(hashDemoContent(synced!))
  })

  it('leaves legacy cards with edited texts alone', async () => {
    const store = useCardStore()
    await store.loadCards()

    const repository = getCardRepository()
    const edited = { ...sampleGuardian(), attack: 60, title: 'Custom Guardian' }
    await repository.put(edited)
    localStorage.removeItem(DEMO_HASHES_KEY)
    localStorage.setItem(DEMO_SEEDED_KEY, 'true')

    const reloaded = freshStore()
    await reloaded.loadCards()

    const kept = reloaded.getCardById('sample-guardian')
    expect(kept?.title).toBe('Custom Guardian')
    expect(kept?.attack).toBe(60)
  })

  it('ignores the derived artwork data URL when hashing', async () => {
    const store = useCardStore()
    await store.loadCards()

    const guardian = store.getCardById('sample-guardian')!
    expect(guardian.image).toMatch(/^data:image\//)
    expect(hashDemoContent({ ...guardian, image: 'data:image/png;base64,xxx' })).toBe(
      hashDemoContent(guardian),
    )
    expect(hashDemoContent({ ...guardian, attack: 61 })).not.toBe(hashDemoContent(guardian))
  })
})
