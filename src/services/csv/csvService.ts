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
import { formatDate, sanitizeFilename } from '@/utils/filename'

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

    const image = resolveImage(get('image'), options.images)

    const draft: CardDraft = {
      title: get('title'),
      subtitle: get('subtitle'),
      attack: parseStat(get('attack')),
      defense: parseStat(get('defense')),
      action: get('action'),
      image: image.dataUrl,
      zone: get('zone').toUpperCase() as CardDraft['zone'],
      stars: get('stars') === '' ? 1 : Number(get('stars')),
      translations,
      imageRef: image.ref,
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
      // Image URLs (file names) are exported; image data stays out of the CSV.
      card.imageRef ?? '',
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

/** Download name for an exported CSV: `<title>-card.csv` or `cards-YYYY-MM-DD.csv`. */
export function buildCardsCsvFilename(cards: Card[], date: Date = new Date()): string {
  if (cards.length === 1) {
    return `${sanitizeFilename(cards[0].title || 'card')}-card.csv`
  }

  return `cards-${formatDate(date)}.csv`
}

/** Triggers a browser download of CSV text as a UTF-8 file. */
export function downloadCsv(data: string, filename: string): void {
  if (typeof document === 'undefined') return

  const blob = new Blob([data], { type: 'text/csv;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(objectUrl)
}

/**
 * Exports the given cards as a downloadable CSV file.
 *
 * Images are exported as file-name references. Cards whose embedded image
 * matches an entry of the provided image library get that file name even when
 * the card was not originally created from a CSV reference.
 */
export function downloadCardsCsv(cards: Card[], options: CsvParseOptions = {}): void {
  if (cards.length === 0) return

  const enriched = withImageReferences(cards, options.images)

  // A UTF-8 BOM helps spreadsheet applications detect the encoding.
  downloadCsv(`\uFEFF${buildCardsCsv(enriched)}`, buildCardsCsvFilename(enriched))
}

function withImageReferences(cards: Card[], images?: ReadonlyMap<string, string>): Card[] {
  if (!images || images.size === 0) return cards

  const nameByDataUrl = new Map<string, string>()
  for (const [name, dataUrl] of images) {
    if (!nameByDataUrl.has(dataUrl)) {
      nameByDataUrl.set(dataUrl, name)
    }
  }

  let changed = false
  const enriched = cards.map((card) => {
    if (card.imageRef || !card.image) return card

    const ref = nameByDataUrl.get(card.image)
    if (!ref) return card

    changed = true
    return { ...card, imageRef: ref }
  })

  return changed ? enriched : cards
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
function resolveImage(
  value: string,
  images?: ReadonlyMap<string, string>,
): { dataUrl: string | null; ref: string | null } {
  if (value === '') return { dataUrl: null, ref: null }
  if (value.startsWith('data:image/')) return { dataUrl: value, ref: null }

  const name = value.split('/').pop()?.toLowerCase() ?? ''
  const dataUrl = images?.get(name)

  if (dataUrl) return { dataUrl, ref: name }

  return { dataUrl: value, ref: null }
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
