/**
 * CSV import service.
 *
 * Reads a CSV file, validates every row with the same rules used by the card
 * editor, and turns the rows into cards ready to be persisted and exported.
 * Support is intentionally strict: a file is either imported completely or
 * rejected with row-level messages, so users never get a half-imported set.
 */

import { translate } from '@/config/languages'
import { cardFromDraft, type Card, type CardDraft } from '@/models/Card'
import { LANGUAGES, type Language } from '@/models/Language'
import { resolveBundledImagesInText } from '@/services/image/bundledImages'
import { validateCard } from '@/services/validation/cardValidation'

export interface CsvParseFailure {
  ok: false
  error: string
  rowErrors?: string[]
}

export type CsvParseResult = { ok: true; cards: Card[] } | CsvParseFailure

/** Optional context for the parser; `images` maps file names to data URLs. */
export interface CsvParseOptions {
  images?: ReadonlyMap<string, string>
}

const REQUIRED_HEADERS = ['title', 'attack', 'defense', 'action', 'zone'] as const
const BASE_OPTIONAL_HEADERS = ['subtitle', 'image', 'stars'] as const

/** Non-English languages supported by the translated CSV columns. */
export const CSV_TRANSLATION_LANGUAGES: Language[] = LANGUAGES.map(
  (option) => option.code,
).filter((code) => code !== 'EN')

const TRANSLATION_FIELDS = ['title', 'subtitle', 'action'] as const

function translationColumn(language: Language, field: (typeof TRANSLATION_FIELDS)[number]): string {
  return `${field}_${language.toLowerCase()}`
}

const OPTIONAL_HEADERS = [
  ...BASE_OPTIONAL_HEADERS,
  ...CSV_TRANSLATION_LANGUAGES.flatMap((language) =>
    TRANSLATION_FIELDS.map((field) => translationColumn(language, field)),
  ),
]

const MAX_ROWS = 500

/** Parses CSV text into validated cards. */
export function parseCardsCsv(
  text: string,
  language: Language = 'EN',
  options: CsvParseOptions = {},
): CsvParseResult {
  const content = text.replace(/^\uFEFF/, '')
  if (content.trim() === '') {
    return { ok: false, error: translate('error.csvEmpty', language) }
  }

  const delimiter = detectDelimiter(content)
  const rows = parseRows(content, delimiter).filter(
    (row) => !row.every((field) => field.trim() === ''),
  )

  if (rows.length < 2) {
    return { ok: false, error: translate('error.csvEmpty', language) }
  }

  const header = rows[0].map((field) => field.trim().toLowerCase())
  const columns = new Map<string, number>()
  for (const name of [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]) {
    const index = header.indexOf(name)
    if (index >= 0) {
      columns.set(name, index)
    }
  }

  const missing = REQUIRED_HEADERS.filter((name) => !columns.has(name))
  if (missing.length > 0) {
    return {
      ok: false,
      error: translate('error.csvMissingColumns', language, { columns: missing.join(', ') }),
    }
  }

  if (rows.length - 1 > MAX_ROWS) {
    return {
      ok: false,
      error: translate('error.csvTooManyRows', language, { max: MAX_ROWS }),
    }
  }

  const cards: Card[] = []
  const rowErrors: string[] = []

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]
    const rowNumber = index + 1

    const get = (name: string): string => {
      const column = columns.get(name)
      return column === undefined ? '' : (row[column] ?? '').trim()
    }

    const translations: CardDraft['translations'] = {}

    for (const translationLanguage of CSV_TRANSLATION_LANGUAGES) {
      const title = get(translationColumn(translationLanguage, 'title'))
      const subtitle = get(translationColumn(translationLanguage, 'subtitle'))
      const action = get(translationColumn(translationLanguage, 'action'))

      if (title !== '' || subtitle !== '' || action !== '') {
        translations[translationLanguage] = { title, subtitle, action }
      }
    }

    const draft: CardDraft = {
      title: get('title'),
      subtitle: get('subtitle'),
      attack: parseStat(get('attack')),
      defense: parseStat(get('defense')),
      action: get('action'),
      image: resolveImage(get('image'), options.images),
      zone: get('zone').toUpperCase() as CardDraft['zone'],
      stars: get('stars') === '' ? 1 : Number(get('stars')),
      translations,
    }

    const errors = validateCard(draft, language)
    const firstError = Object.values(errors)[0]
    if (firstError) {
      rowErrors.push(translate('error.csvRow', language, { row: rowNumber, message: firstError }))
      continue
    }

    cards.push(cardFromDraft(draft))
  }

  if (rowErrors.length > 0) {
    return {
      ok: false,
      error: translate('error.csvInvalidRows', language, { count: rowErrors.length }),
      rowErrors,
    }
  }

  if (cards.length === 0) {
    return { ok: false, error: translate('error.csvEmpty', language) }
  }

  return { ok: true, cards }
}

/** Parses a user-selected CSV file. */
export async function parseCardsCsvFile(
  file: File,
  language: Language = 'EN',
  options: CsvParseOptions = {},
): Promise<CsvParseResult> {
  let text: string

  try {
    text = await file.text()
  } catch {
    return { ok: false, error: translate('error.csvRead', language) }
  }

  const bundled = await resolveBundledImagesInText(text)
  const images = new Map<string, string>(bundled)

  for (const [name, dataUrl] of options.images ?? []) {
    images.set(name.toLowerCase(), dataUrl)
  }

  return parseCardsCsv(text, language, { images })
}

/** Serializes cards to CSV (used for tests and template generation). */
export function buildCardsCsv(cards: Card[]): string {
  const header = [
    'title',
    'subtitle',
    'attack',
    'defense',
    'action',
    'zone',
    'stars',
    'image',
    ...CSV_TRANSLATION_LANGUAGES.flatMap((language) =>
      TRANSLATION_FIELDS.map((field) => translationColumn(language, field)),
    ),
  ]
  const lines = [header.join(',')]

  for (const card of cards) {
    const values: (string | number)[] = [
      card.title,
      card.subtitle,
      card.attack,
      card.defense,
      card.action,
      card.zone,
      card.stars,
      card.image ?? '',
    ]

    for (const language of CSV_TRANSLATION_LANGUAGES) {
      const translation = card.translations?.[language]
      values.push(
        translation?.title ?? '',
        translation?.subtitle ?? '',
        translation?.action ?? '',
      )
    }

    lines.push(values.map((value) => escapeCsvField(String(value))).join(','))
  }

  return `${lines.join('\r\n')}\r\n`
}

function parseStat(value: string): number {
  if (value === '') return Number.NaN
  return Number(value)
}

/**
 * Resolves the CSV image value into a data URL: data URLs pass through,
 * bundled asset file names (for example `img1.jpeg`) are looked up in the
 * provided map, and anything else is returned untouched so validation
 * reports the problem.
 */
function resolveImage(value: string, images?: ReadonlyMap<string, string>): string | null {
  if (value === '') return null
  if (value.startsWith('data:image/')) return value

  const name = value.split('/').pop()?.toLowerCase() ?? ''
  return images?.get(name) ?? value
}

function detectDelimiter(content: string): ',' | ';' {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  let comma = 0
  let semicolon = 0
  let inQuotes = false

  for (const character of firstLine) {
    if (character === '"') {
      inQuotes = !inQuotes
    } else if (!inQuotes && character === ',') {
      comma += 1
    } else if (!inQuotes && character === ';') {
      semicolon += 1
    }
  }

  return semicolon > comma ? ';' : ','
}

function parseRows(content: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      inQuotes = true
    } else if (character === delimiter) {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }

  row.push(field)
  rows.push(row)

  return rows
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}
