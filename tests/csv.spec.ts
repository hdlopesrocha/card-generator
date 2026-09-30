import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { Zone } from '@/models/Card'
import { buildCardsCsv, parseCardsCsv, parseCardsCsvFile } from '@/services/csv/csvService'

const SAMPLE_CSV = readFileSync(resolve(process.cwd(), 'sample.csv'), 'utf8')

function sampleFile(): File {
  return new File([SAMPLE_CSV], 'sample.csv', { type: 'text/csv' })
}

async function parseSample(): Promise<Awaited<ReturnType<typeof parseCardsCsvFile>>> {
  return parseCardsCsvFile(sampleFile())
}

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const HEADER = 'title,subtitle,attack,defense,action,zone,image'
const STARS_HEADER = 'title,subtitle,attack,defense,action,zone,stars,image'

describe('parseCardsCsv', () => {
  it('parses the bundled sample.csv into the three demo cards', async () => {
    const result = await parseSample()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.cards).toHaveLength(3)

    const [warrior, tactician, guardian] = result.cards
    expect(warrior).toMatchObject({
      title: 'Warrior',
      subtitle: 'Frontline Fighter',
      attack: 120,
      defense: 90,
      action: 'Charge the nearest enemy and gain additional attack power.',
      zone: Zone.ATTACK,
      stars: 3,
    })
    expect(warrior.image).toMatch(/^data:image\/jpeg;base64,/)
    expect(tactician.image).toMatch(/^data:image\/jpeg;base64,/)
    expect(guardian.image).toMatch(/^data:image\/jpeg;base64,/)
    expect(tactician).toMatchObject({ title: 'Tactician', zone: Zone.MIDFIELD, attack: 80, stars: 2 })
    expect(guardian).toMatchObject({
      title: 'Guardian',
      zone: Zone.DEFENSE,
      defense: 150,
      stars: 1,
    })
    expect(new Set(result.cards.map((card) => card.id)).size).toBe(3)
  })

  it('imports every language from the sample.csv translation columns', async () => {
    const result = await parseSample()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [warrior, tactician, guardian] = result.cards

    expect(warrior.translations.PT).toEqual({
      title: 'Guerreiro',
      subtitle: 'Combatente da Linha de Frente',
      action: 'Carregue contra o inimigo mais próximo e ganhe poder de ataque adicional.',
    })
    expect(warrior.translations.FR?.title).toBe('Guerrier')
    expect(warrior.translations.ES?.subtitle).toBe('Combatiente de primera línea')
    expect(warrior.translations.DE?.title).toBe('Krieger')
    expect(warrior.translations.NL?.title).toBe('Krijger')
    expect(warrior.translations.IT?.action).toContain('Carica il nemico')

    expect(tactician.translations.PT?.title).toBe('Tático')
    expect(tactician.translations.FR?.title).toBe('Tacticien')
    expect(guardian.translations.DE?.title).toBe('Wächter')
    expect(guardian.translations.IT?.subtitle).toBe('Sentinella difensiva')

    for (const card of result.cards) {
      expect(Object.keys(card.translations).sort()).toEqual(['DE', 'ES', 'FR', 'IT', 'NL', 'PT'])
    }
  })

  it('leaves translations empty when no language columns are present', () => {
    const result = parseCardsCsv(`${HEADER}\nAlpha,Sub,1,2,Act,ATTACK,\n`)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].translations).toEqual({})
  })

  it('parses individual language columns and ignores unknown language suffixes', () => {
    const header = `${HEADER},title_pt,subtitle_pt,action_pt,title_xx`
    const row = 'Alpha,Sub,1,2,Act,ATTACK,,Alfa,Sub PT,Fazer algo,Ignorado'
    const result = parseCardsCsv([header, row].join('\n'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].translations.PT).toEqual({
      title: 'Alfa',
      subtitle: 'Sub PT',
      action: 'Fazer algo',
    })
    expect(result.cards[0].translations).not.toHaveProperty('XX')
  })

  it('rejects translations that exceed the length limits', () => {
    const header = `${HEADER},title_pt`
    const row = `Alpha,Sub,1,2,Act,ATTACK,,"${'T'.repeat(61)}"`
    const result = parseCardsCsv([header, row].join('\n'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rowErrors?.[0]).toMatch(/^Row 2:/)
    expect(result.rowErrors?.[0]).toContain('translation exceeds')
  })

  it('defaults to one star when the optional stars column is missing', () => {
    const csv = 'title,subtitle,attack,defense,action,zone\nAlpha,Sub,1,2,Act,ATTACK\n'

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].stars).toBe(1)
  })

  it('rejects out-of-range stars with a row error', () => {
    const csv = `${STARS_HEADER}\nAlpha,Sub,1,2,Act,ATTACK,2,\nBeta,Sub,1,2,Act,ATTACK,7,\n`

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rowErrors?.[0]).toMatch(/^Row 3:/)
    expect(result.rowErrors?.[0]).toContain('Stars must be a whole number between 1 and 3.')
  })

  it('accepts quoted fields containing commas, quotes and newlines', () => {
    const csv = `${HEADER}\r\n"Hero, the Bold","Says ""hi""",10,20,"Line one\nLine two",attack,`

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].title).toBe('Hero, the Bold')
    expect(result.cards[0].subtitle).toBe('Says "hi"')
    expect(result.cards[0].action).toBe('Line one\nLine two')
  })

  it('supports semicolon separated files', () => {
    const csv = `${HEADER.replaceAll(',', ';')}\nAlpha;Subtitle;1;2;Do a thing;midfield;`

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].zone).toBe(Zone.MIDFIELD)
  })

  it('handles a UTF-8 BOM, CRLF line endings and case-insensitive headers', () => {
    const csv = `\uFEFFTitle,Attack,Defense,Action,Zone,Extra\nAlpha,1,2,Act,defense,ignored\r\n`

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0]).toMatchObject({ title: 'Alpha', zone: Zone.DEFENSE })
  })

  it('rejects files without the required columns', () => {
    const result = parseCardsCsv('title,subtitle\nAlpha,Subtitle\n')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('missing required column')
    expect(result.error).toContain('attack')
    expect(result.error).toContain('zone')
  })

  it('reports invalid rows with their row number', () => {
    const csv = [
      HEADER,
      'Alpha,Sub,1,2,Act,ATTACK,',
      'Beta,Sub,not-a-number,2,Act,ATTACK,',
      'Gamma,Sub,3,9999,Act,ATTACK,',
    ].join('\n')

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('The CSV contains 2 invalid row(s).')
    expect(result.rowErrors?.[0]).toMatch(/^Row 3:/)
    expect(result.rowErrors?.[1]).toMatch(/^Row 4:/)
  })

  it('rejects unknown zones and non data URL images', () => {
    const csv = [
      HEADER,
      'Alpha,Sub,1,2,Act,SOMEWHERE,',
      'Beta,Sub,1,2,Act,ATTACK,https://example.com/image.png',
    ].join('\n')

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rowErrors).toHaveLength(2)
    expect(result.rowErrors?.[0]).toContain('zone')
    expect(result.rowErrors?.[1]).toContain('image')
  })

  it('resolves bundled asset file names to data URLs', () => {
    const csv = `${HEADER}\nAlpha,Sub,1,2,Act,ATTACK,img1.jpeg\n`
    const images = new Map([['img1.jpeg', TINY_PNG_DATA_URL]])

    const result = parseCardsCsv(csv, 'EN', { images })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].image).toBe(TINY_PNG_DATA_URL)
  })

  it('rejects asset references that are not bundled', () => {
    const csv = `${HEADER}\nAlpha,Sub,1,2,Act,ATTACK,missing-file.png\n`

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rowErrors?.[0]).toContain('image')
  })

  it('resolves image file names from the local image library', async () => {
    const csv = `${HEADER}\nAlpha,Sub,1,2,Act,ATTACK,my-art.png\n`
    const images = new Map([['my-art.png', TINY_PNG_DATA_URL]])

    const result = await parseCardsCsvFile(
      new File([csv], 'cards.csv', { type: 'text/csv' }),
      'EN',
      { images },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].image).toBe(TINY_PNG_DATA_URL)
  })

  it('accepts a quoted data URL image and a missing optional subtitle', () => {
    const csv = `${HEADER}\nAlpha,,5,6,Do a thing,ATTACK,"${TINY_PNG_DATA_URL}"\n`

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0].subtitle).toBe('')
    expect(result.cards[0].image).toContain('data:image/png;base64,')
  })

  it('rejects empty files and header-only files', () => {
    expect(parseCardsCsv('')).toEqual({ ok: false, error: 'The CSV does not contain any card rows.' })
    expect(parseCardsCsv(HEADER).ok).toBe(false)
    expect(parseCardsCsv('\n\n').ok).toBe(false)
  })

  it('ignores blank lines between rows', () => {
    const csv = `${HEADER}\nAlpha,Sub,1,2,Act,ATTACK,\n\nBeta,Sub,3,4,Act,DEFENSE,\n`

    const result = parseCardsCsv(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards).toHaveLength(2)
  })
})

describe('parseCardsCsvFile', () => {
  it('parses a File object', async () => {
    const file = new File([SAMPLE_CSV], 'sample.csv', { type: 'text/csv' })

    const result = await parseCardsCsvFile(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards.map((card) => card.title)).toEqual(['Warrior', 'Tactician', 'Guardian'])
  })

  it('returns a friendly error when the file cannot be read', async () => {
    const broken = new File([SAMPLE_CSV], 'sample.csv', { type: 'text/csv' })
    Object.defineProperty(broken, 'text', {
      value: () => Promise.reject(new Error('boom')),
    })

    const result = await parseCardsCsvFile(broken)

    expect(result).toEqual({ ok: false, error: 'The selected CSV file could not be read.' })
  })
})

describe('buildCardsCsv', () => {
  it('round-trips cards through CSV escaping', async () => {
    const parsed = await parseSample()
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const rebuilt = parseCardsCsv(buildCardsCsv(parsed.cards))

    expect(rebuilt.ok).toBe(true)
    if (!rebuilt.ok) return
    expect(rebuilt.cards.map(({ title, attack, defense, zone }) => ({ title, attack, defense, zone }))).toEqual(
      parsed.cards.map(({ title, attack, defense, zone }) => ({ title, attack, defense, zone })),
    )
    expect(rebuilt.cards.map((card) => card.translations)).toEqual(
      parsed.cards.map((card) => card.translations),
    )
  })
})
