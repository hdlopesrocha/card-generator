import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { Zone, type Card } from '@/models/Card'
import { IndexedDbCardRepository } from '@/services/storage/indexedDb'

let databaseCounter = 0

function uniqueDatabaseName(label: string): string {
  databaseCounter += 1
  return `${label}-${databaseCounter}-${Math.random().toString(36).slice(2, 10)}`
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    title: 'Fire Drake',
    subtitle: 'Crimson brood',
    attack: 7,
    defense: 4,
    action: 'Deal 2 damage to every enemy in the front row.',
    image: null,
    zone: Zone.ATTACK,
    ...overrides,
    stars: overrides.stars ?? 2,
    translations: overrides.translations ?? {},
  }
}

describe('IndexedDbCardRepository', () => {
  let repository: IndexedDbCardRepository

  beforeEach(async () => {
    repository = new IndexedDbCardRepository(new IDBFactory(), uniqueDatabaseName('storage'), 1)
    await repository.init()
  })

  it('starts empty', async () => {
    await expect(repository.count()).resolves.toBe(0)
    await expect(repository.getAll()).resolves.toEqual([])
  })

  it('creates a card and reads it back', async () => {
    const card = makeCard()

    await repository.put(card)

    await expect(repository.get(card.id)).resolves.toEqual(card)
    await expect(repository.count()).resolves.toBe(1)
  })

  it('returns undefined when reading a missing card', async () => {
    await expect(repository.get('does-not-exist')).resolves.toBeUndefined()
  })

  it('lists every stored card', async () => {
    const first = makeCard({ id: 'card-1', zone: Zone.ATTACK })
    const second = makeCard({ id: 'card-2', zone: Zone.MIDFIELD })
    const third = makeCard({ id: 'card-3', zone: Zone.DEFENSE })

    await repository.put(first)
    await repository.put(second)
    await repository.put(third)

    const all = await repository.getAll()
    expect(all).toHaveLength(3)
    expect(all.map((card) => card.id).sort()).toEqual(['card-1', 'card-2', 'card-3'])
  })

  it('updates an existing card when putting the same id again', async () => {
    const card = makeCard({ title: 'Original' })
    await repository.put(card)

    await repository.put({ ...card, title: 'Updated', attack: 99 })

    await expect(repository.count()).resolves.toBe(1)
    await expect(repository.get(card.id)).resolves.toMatchObject({ title: 'Updated', attack: 99 })
  })

  it('deletes a card by id', async () => {
    const card = makeCard()
    await repository.put(card)

    await repository.delete(card.id)

    await expect(repository.get(card.id)).resolves.toBeUndefined()
    await expect(repository.count()).resolves.toBe(0)
  })

  it('resolves when deleting a card that does not exist', async () => {
    await expect(repository.delete('missing')).resolves.toBeUndefined()
  })

  it('clears every card', async () => {
    await repository.bulkPut([makeCard({ id: 'card-1' }), makeCard({ id: 'card-2' })])

    await repository.clear()

    await expect(repository.count()).resolves.toBe(0)
    await expect(repository.getAll()).resolves.toEqual([])
  })

  it('stores every card in a bulkPut', async () => {
    const cards = [
      makeCard({ id: 'card-1' }),
      makeCard({ id: 'card-2', title: 'Stone Wall', zone: Zone.DEFENSE }),
      makeCard({ id: 'card-3', title: 'Swift Scout', zone: Zone.MIDFIELD }),
    ]

    await repository.bulkPut(cards)

    await expect(repository.count()).resolves.toBe(3)
    const all = await repository.getAll()
    expect(all).toHaveLength(3)
    expect(all.map((card) => card.id).sort()).toEqual(['card-1', 'card-2', 'card-3'])
  })

  it('treats an empty bulkPut as a no-op', async () => {
    await expect(repository.bulkPut([])).resolves.toBeUndefined()
    await expect(repository.count()).resolves.toBe(0)
  })

  it('updates existing cards through bulkPut', async () => {
    await repository.put(makeCard({ id: 'card-1', title: 'Before' }))

    await repository.bulkPut([makeCard({ id: 'card-1', title: 'After' })])

    await expect(repository.count()).resolves.toBe(1)
    await expect(repository.get('card-1')).resolves.toMatchObject({ title: 'After' })
  })

  it('rolls back every write when a bulkPut fails partway through', async () => {
    const valid = makeCard({ id: 'card-1' })
    const invalid = { ...makeCard({ id: 'card-2' }), id: undefined } as unknown as Card

    await expect(repository.bulkPut([valid, invalid])).rejects.toBeInstanceOf(Error)

    await expect(repository.count()).resolves.toBe(0)
    await expect(repository.get(valid.id)).resolves.toBeUndefined()
  })

  it('shares persisted data between two repository instances using the same factory and database', async () => {
    const factory = new IDBFactory()
    const databaseName = uniqueDatabaseName('shared')
    const writer = new IndexedDbCardRepository(factory, databaseName, 1)
    const reader = new IndexedDbCardRepository(factory, databaseName, 1)
    const card = makeCard({ id: 'shared-card', title: 'Persisted' })

    await writer.put(card)

    await expect(reader.get(card.id)).resolves.toEqual(card)
    await expect(reader.count()).resolves.toBe(1)

    const replacement = makeCard({ id: 'shared-card-2', title: 'From reader' })
    await reader.put(replacement)

    await expect(writer.getAll()).resolves.toHaveLength(2)
    await expect(writer.get(replacement.id)).resolves.toEqual(replacement)
  })

  it('keeps databases created with different names isolated', async () => {
    const factory = new IDBFactory()
    const first = new IndexedDbCardRepository(factory, uniqueDatabaseName('isolated-a'), 1)
    const second = new IndexedDbCardRepository(factory, uniqueDatabaseName('isolated-b'), 1)

    await first.put(makeCard({ id: 'card-1' }))

    await expect(first.count()).resolves.toBe(1)
    await expect(second.count()).resolves.toBe(0)
  })
})
