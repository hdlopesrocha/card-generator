import { describe, expect, it } from 'vitest'

import { CARD_LIMITS } from '@/config/constants'
import { Zone, type CardDraft } from '@/models/Card'
import { isCardValid, parseStatValue, validateCard } from '@/services/validation/cardValidation'

const VALID_DRAFT: CardDraft = {
  title: 'Fire Drake',
  subtitle: 'Crimson brood',
  attack: 7,
  defense: 4,
  action: 'Deal 2 damage to every enemy in the front row.',
  image: null,
  zone: Zone.ATTACK,
  stars: 2,
  translations: {},
}

function draft(overrides: Partial<CardDraft> = {}): CardDraft {
  return { ...VALID_DRAFT, ...overrides }
}

function invalidStat(value: unknown): number {
  return value as number
}

function invalidZone(value: string): Zone {
  return value as unknown as Zone
}

describe('validateCard', () => {
  it('accepts a fully valid card with no errors', () => {
    const errors = validateCard(VALID_DRAFT)

    expect(errors).toEqual({})
    expect(isCardValid(VALID_DRAFT)).toBe(true)
  })

  it('rejects a missing title', () => {
    const errors = validateCard(draft({ title: undefined as unknown as string }))

    expect(errors.title).toBe('Title is required.')
  })

  it('rejects a whitespace-only title', () => {
    const errors = validateCard(draft({ title: '   \t  ' }))

    expect(errors.title).toBe('Title is required.')
  })

  it('rejects a title longer than the configured limit', () => {
    const errors = validateCard(draft({ title: 'T'.repeat(CARD_LIMITS.title.maxLength + 1) }))

    expect(errors.title).toBe(`Title must be ${CARD_LIMITS.title.maxLength} characters or fewer.`)
  })

  it('accepts a title exactly at the configured limit', () => {
    expect(validateCard(draft({ title: 'T'.repeat(CARD_LIMITS.title.maxLength) })).title).toBeUndefined()
  })

  it('rejects an action longer than 240 characters', () => {
    const errors = validateCard(draft({ action: 'A'.repeat(CARD_LIMITS.action.maxLength + 1) }))

    expect(errors.action).toBe(`Action must be ${CARD_LIMITS.action.maxLength} characters or fewer.`)
  })

  it('accepts an action exactly at 240 characters', () => {
    expect(validateCard(draft({ action: 'A'.repeat(CARD_LIMITS.action.maxLength) })).action).toBeUndefined()
  })

  it('rejects an empty action', () => {
    expect(validateCard(draft({ action: '' })).action).toBe('Action is required.')
  })

  it.each([
    ['empty string', ''],
    ['non-numeric string', 'abc'],
    ['negative number', -1],
    ['above maximum', 1000],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects attack with %s', (_label, value) => {
    const errors = validateCard(draft({ attack: invalidStat(value) }))

    expect(errors.attack).toBe(`Attack must be a number between ${CARD_LIMITS.attack.min} and ${CARD_LIMITS.attack.max}.`)
  })

  it.each([
    ['empty string', ''],
    ['non-numeric string', 'abc'],
    ['negative number', -1],
    ['above maximum', 1000],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects defense with %s', (_label, value) => {
    const errors = validateCard(draft({ defense: invalidStat(value) }))

    expect(errors.defense).toBe(
      `Defense must be a number between ${CARD_LIMITS.defense.min} and ${CARD_LIMITS.defense.max}.`,
    )
  })

  it('accepts numeric strings for attack and defense', () => {
    const errors = validateCard(draft({ attack: invalidStat('12'), defense: invalidStat('0') }))

    expect(errors.attack).toBeUndefined()
    expect(errors.defense).toBeUndefined()
  })

  it('accepts boundary values for attack and defense', () => {
    const errors = validateCard(draft({ attack: CARD_LIMITS.attack.max, defense: CARD_LIMITS.defense.min }))

    expect(errors).toEqual({})
  })

  it('rejects an unknown zone', () => {
    const errors = validateCard(draft({ zone: invalidZone('FOO') }))

    expect(errors.zone).toBe('Select a valid zone.')
  })

  it('accepts every known zone', () => {
    for (const zone of [Zone.ATTACK, Zone.MIDFIELD, Zone.DEFENSE]) {
      expect(validateCard(draft({ zone })).zone).toBeUndefined()
    }
  })

  it('treats the subtitle as optional', () => {
    expect(validateCard(draft({ subtitle: '' })).subtitle).toBeUndefined()
    expect(validateCard(draft({ subtitle: undefined as unknown as string })).subtitle).toBeUndefined()
  })

  it('rejects a subtitle longer than the configured limit', () => {
    const errors = validateCard(draft({ subtitle: 'S'.repeat(CARD_LIMITS.subtitle.maxLength + 1) }))

    expect(errors.subtitle).toBe(`Subtitle must be ${CARD_LIMITS.subtitle.maxLength} characters or fewer.`)
  })

  it('accepts a subtitle exactly at the configured limit', () => {
    expect(validateCard(draft({ subtitle: 'S'.repeat(CARD_LIMITS.subtitle.maxLength) })).subtitle).toBeUndefined()
  })

  it('accepts valid PNG, JPEG and WebP data URLs', () => {
    for (const mime of ['png', 'jpeg', 'webp']) {
      const errors = validateCard(draft({ image: `data:image/${mime};base64,AAAA` }))
      expect(errors.image).toBeUndefined()
    }
  })

  it('accepts a null or empty image', () => {
    expect(validateCard(draft({ image: null })).image).toBeUndefined()
    expect(validateCard(draft({ image: '' })).image).toBeUndefined()
  })

  it('rejects an image that is not a supported data URL', () => {
    expect(validateCard(draft({ image: 'https://example.com/art.png' })).image).toBe('The image format is not supported.')
    expect(validateCard(draft({ image: 'data:image/gif;base64,AAAA' })).image).toBe(
      'The image format is not supported.',
    )
  })

  it('accepts stars from 1 to 3 including numeric strings', () => {
    expect(validateCard(draft({ stars: 1 })).stars).toBeUndefined()
    expect(validateCard(draft({ stars: 3 })).stars).toBeUndefined()
    expect(validateCard(draft({ stars: '2' as unknown as number })).stars).toBeUndefined()
  })

  it('rejects missing, fractional or out-of-range stars', () => {
    const message = 'Stars must be a whole number between 1 and 3.'
    expect(validateCard(draft({ stars: undefined as unknown as number })).stars).toBe(message)
    expect(validateCard(draft({ stars: 0 })).stars).toBe(message)
    expect(validateCard(draft({ stars: 4 })).stars).toBe(message)
    expect(validateCard(draft({ stars: 2.5 })).stars).toBe(message)
    expect(validateCard(draft({ stars: 'abc' as unknown as number })).stars).toBe(message)
  })

  it('reports several problems at once with friendly English messages', () => {
    const errors = validateCard({
      title: '',
      subtitle: '',
      attack: invalidStat('nope'),
      defense: invalidStat(Number.NaN),
      action: '',
      image: 'not-an-image',
      zone: invalidZone('FOO'),
    })

    expect(errors).toEqual({
      title: 'Title is required.',
      action: 'Action is required.',
      attack: `Attack must be a number between ${CARD_LIMITS.attack.min} and ${CARD_LIMITS.attack.max}.`,
      defense: `Defense must be a number between ${CARD_LIMITS.defense.min} and ${CARD_LIMITS.defense.max}.`,
      zone: 'Select a valid zone.',
      image: 'The image format is not supported.',
      stars: 'Stars must be a whole number between 1 and 3.',
    })
    for (const message of Object.values(errors)) {
      expect(message).toMatch(/^[A-Z][\w\s'-]+[.!]$/)
    }
  })

  it('rejects translations longer than the configured limits', () => {
    const errors = validateCard(
      draft({
        translations: {
          PT: {
            title: 'T'.repeat(CARD_LIMITS.title.maxLength + 1),
            subtitle: '',
            action: '',
          },
        },
      }),
    )

    expect(errors.translations).toBe(
      `A translation exceeds the allowed length (title up to ${CARD_LIMITS.title.maxLength}, action up to ${CARD_LIMITS.action.maxLength}).`,
    )
  })

  it('accepts translations within the configured limits', () => {
    const errors = validateCard(
      draft({
        translations: {
          PT: { title: 'Guerreiro', subtitle: 'Linha de frente', action: 'Carregue contra o inimigo.' },
        },
      }),
    )

    expect(errors.translations).toBeUndefined()
  })

  it('returns validation messages in the requested language', () => {
    expect(validateCard({}, 'PT').title).toBe('O título é obrigatório.')
    expect(validateCard({}, 'FR').title).toBe('Le titre est obligatoire.')
    expect(validateCard({}, 'DE').action).toBe('Die Aktion ist erforderlich.')
  })
})

describe('parseStatValue', () => {
  it('parses finite numbers inside the accepted range', () => {
    expect(parseStatValue(0)).toEqual({ ok: true, value: 0 })
    expect(parseStatValue(999)).toEqual({ ok: true, value: 999 })
    expect(parseStatValue('42')).toEqual({ ok: true, value: 42 })
  })

  it('rejects values outside the accepted range or not numeric', () => {
    expect(parseStatValue(-1)).toEqual({ ok: false })
    expect(parseStatValue(1000)).toEqual({ ok: false })
    expect(parseStatValue(Number.POSITIVE_INFINITY)).toEqual({ ok: false })
    expect(parseStatValue(Number.NaN)).toEqual({ ok: false })
    expect(parseStatValue('abc')).toEqual({ ok: false })
    expect(parseStatValue('')).toEqual({ ok: false })
  })
})
