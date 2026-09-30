import { describe, expect, it } from 'vitest'

import { BACKUP_APP_ID, BACKUP_VERSION } from '@/config/constants'
import { Zone, type Card } from '@/models/Card'
import { parseBackup, parseBackupFile, serializeBackup } from '@/services/backup/backupService'

const INVALID_BACKUP_ERROR = 'This file is not a valid Card Generator backup.'
const INVALID_CARD_ERROR = 'The backup file contains an invalid card.'
const UNSUPPORTED_VERSION_ERROR = 'This backup file version is not supported.'
const READ_ERROR = 'The selected file could not be read.'

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
    imageRef: overrides.imageRef ?? null,
  }
}

function payloadWith(cards: unknown[]): string {
  return JSON.stringify({ appId: BACKUP_APP_ID, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), cards })
}

describe('serializeBackup / parseBackup', () => {
  it('round-trips cards through serialize and parse', () => {
    const cards = [
      makeCard({ id: 'card-1', zone: Zone.ATTACK }),
      makeCard({
        id: 'card-2',
        title: 'Stone Wall',
        subtitle: 'Hold the line',
        attack: 2,
        defense: 9,
        action: 'Gain 2 armor until your next turn.',
        image: 'data:image/png;base64,AAAA',
        zone: Zone.DEFENSE,
      }),
    ]

    const result = parseBackup(serializeBackup(cards))

    expect(result).toEqual({ ok: true, cards })
  })

  it('accepts an empty cards array', () => {
    const result = parseBackup(serializeBackup([]))

    expect(result).toEqual({ ok: true, cards: [] })
  })

  it('rejects malformed JSON', () => {
    expect(parseBackup('{ not json')).toEqual({ ok: false, error: INVALID_BACKUP_ERROR })
    expect(parseBackup('')).toEqual({ ok: false, error: INVALID_BACKUP_ERROR })
  })

  it('rejects a payload whose appId is wrong', () => {
    const payload = JSON.stringify({ appId: 'other-app', version: BACKUP_VERSION, cards: [] })

    expect(parseBackup(payload)).toEqual({ ok: false, error: INVALID_BACKUP_ERROR })
  })

  it('rejects an unsupported version', () => {
    const payload = JSON.stringify({ appId: BACKUP_APP_ID, version: BACKUP_VERSION + 1, cards: [] })

    expect(parseBackup(payload)).toEqual({ ok: false, error: UNSUPPORTED_VERSION_ERROR })
  })

  it('rejects a payload whose cards field is not an array', () => {
    const payload = JSON.stringify({ appId: BACKUP_APP_ID, version: BACKUP_VERSION, cards: 'nope' })

    expect(parseBackup(payload)).toEqual({ ok: false, error: INVALID_BACKUP_ERROR })
  })

  it('rejects a card with an unknown zone', () => {
    const result = parseBackup(payloadWith([{ ...makeCard(), zone: 'FOO' }]))

    expect(result).toEqual({ ok: false, error: INVALID_CARD_ERROR })
  })

  it('rejects a card whose attack is out of range', () => {
    const result = parseBackup(payloadWith([{ ...makeCard(), attack: 1000 }]))

    expect(result).toEqual({ ok: false, error: INVALID_CARD_ERROR })
  })

  it('rejects a card with a missing title', () => {
    const { title: _title, ...cardWithoutTitle } = makeCard()
    const result = parseBackup(payloadWith([cardWithoutTitle]))

    expect(result).toEqual({ ok: false, error: INVALID_CARD_ERROR })
  })

  it('rejects a payload containing a card that is not an object', () => {
    expect(parseBackup(payloadWith(['not-a-card']))).toEqual({ ok: false, error: INVALID_CARD_ERROR })
  })

  it('defaults legacy backups without a stars field to one star', () => {
    const legacy = makeCard()
    const withoutStars: Record<string, unknown> = { ...legacy }
    delete withoutStars.stars

    const result = parseBackup(payloadWith([withoutStars]))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].stars).toBe(1)
  })

  it('defaults legacy backups without translations to an empty object', () => {
    const { translations: _translations, ...legacyCard } = makeCard({ id: 'legacy-card' })

    const result = parseBackup(payloadWith([legacyCard]))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].translations).toEqual({})
  })

  it('round-trips translations through serialize and parse', () => {
    const translated = makeCard({
      id: 'translated-card',
      translations: {
        PT: {
          title: 'Dragão de Fogo',
          subtitle: 'Ninhada carmesim',
          action: 'Causa 2 de dano a todos os inimigos da linha da frente.',
        },
        FR: { title: 'Drake de Feu', subtitle: '', action: 'Infligez 2 dégâts.' },
      },
    })

    const result = parseBackup(serializeBackup([translated]))

    expect(result).toEqual({ ok: true, cards: [translated] })
  })

  it('rejects cards with stars outside the 1-3 range', () => {
    expect(parseBackup(payloadWith([makeCard({ stars: 0 })])).ok).toBe(false)
    expect(parseBackup(payloadWith([makeCard({ stars: 4 })])).ok).toBe(false)
    expect(parseBackup(payloadWith([makeCard({ stars: 2.5 })])).ok).toBe(false)
  })
})

describe('parseBackup duplicate ids', () => {
  it('preserves duplicate ids from the payload (no de-duplication or regeneration)', () => {
    const duplicate = makeCard({ id: 'duplicate-id', title: 'Copy' })
    const result = parseBackup(payloadWith([duplicate, { ...duplicate, title: 'Copy two' }]))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards).toHaveLength(2)
    expect(result.cards.map((card) => card.id)).toEqual(['duplicate-id', 'duplicate-id'])
  })

  it('generates a unique non-empty id for every card without one', () => {
    const withoutId = { ...makeCard(), id: undefined }
    const result = parseBackup(payloadWith([withoutId, withoutId]))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards).toHaveLength(2)
    const [first, second] = result.cards
    expect(first.id).toBeTruthy()
    expect(second.id).toBeTruthy()
    expect(first.id).not.toBe(second.id)
  })
})

describe('parseBackupFile', () => {
  it('parses a File created from serializeBackup output', async () => {
    const cards = [makeCard({ id: 'file-card' })]
    const file = new File([serializeBackup(cards)], 'backup.json', { type: 'application/json' })

    const result = await parseBackupFile(file)

    expect(result).toEqual({ ok: true, cards })
  })

  it('reports a friendly error when the file content is not a valid backup', async () => {
    const file = new File(['definitely not json'], 'backup.json', { type: 'application/json' })

    const result = await parseBackupFile(file)

    expect(result).toEqual({ ok: false, error: INVALID_BACKUP_ERROR })
  })

  it('reports a friendly error when the file cannot be read', async () => {
    const unreadable = { text: () => Promise.reject(new Error('read failure')) } as unknown as File

    const result = await parseBackupFile(unreadable)

    expect(result).toEqual({ ok: false, error: READ_ERROR })
  })
})
