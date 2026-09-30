import { decodePDFRawStream, PDFDocument, PDFRawStream } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Card } from '@/models/Card'
import { Zone } from '@/models/Card'
import {
  buildCardsPdfFilename,
  downloadPdf,
  generateAndDownloadCardPdf,
  generateCardPdf,
  generateCardsPdf,
  sanitizeFilename,
} from '@/services/pdf/cardPdfService'

const MM_TO_PT = 72 / 25.4
const DEFAULT_PAGE_WIDTH_PT = 63 * MM_TO_PT
const DEFAULT_PAGE_HEIGHT_PT = 88 * MM_TO_PT

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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

function makeCards(count: number): Card[] {
  return Array.from({ length: count }, (_value, index) =>
    makeCard({
      id: `card-${index + 1}`,
      title: `Card number ${index + 1}`,
      zone: [Zone.ATTACK, Zone.MIDFIELD, Zone.DEFENSE][index % 3],
    }),
  )
}

function pdfHeader(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes.slice(0, 5))
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes)
}

/** Inlines the hex strings pdf-lib uses for text operands (`<...> Tj`). */
function decodeTextOperands(content: string): string {
  return content.replace(/<([0-9a-fA-F]+)>/g, (match, hex: string) => {
    if (hex.length % 2 !== 0) return match

    const bytes = new Uint8Array(hex.length / 2)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
    }
    return new TextDecoder('latin1').decode(bytes)
  })
}

/** Decodes every content stream of a page, inflating FlateDecode streams. */
function readPageContent(document: PDFDocument, pageIndex = 0): string {
  const contents = document.getPage(pageIndex).node.normalizedEntries().Contents
  if (!contents) return ''

  const chunks: string[] = []
  for (const entry of contents.asArray()) {
    const stream = document.context.lookup(entry)
    if (stream instanceof PDFRawStream) {
      const decoded = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode())
      chunks.push(decodeTextOperands(decoded))
    }
  }
  return chunks.join('\n')
}

describe('generateCardsPdf', () => {
  it('produces a valid PDF with one page per card', async () => {
    const bytes = await generateCardsPdf(makeCards(3))

    expect(bytes.length).toBeGreaterThan(0)
    expect(pdfHeader(bytes)).toBe('%PDF-')
    const document = await loadPdf(bytes)
    expect(document.getPageCount()).toBe(3)
  })

  it('uses the exact card size for every page with no margins', async () => {
    const document = await loadPdf(await generateCardsPdf(makeCards(3)))

    for (const page of document.getPages()) {
      const mediaBox = page.getMediaBox()
      expect(mediaBox.x).toBe(0)
      expect(mediaBox.y).toBe(0)
      expect(page.getWidth()).toBeCloseTo(DEFAULT_PAGE_WIDTH_PT, 2)
      expect(page.getHeight()).toBeCloseTo(DEFAULT_PAGE_HEIGHT_PT, 2)
    }
  })

  it('respects explicit physical card dimensions for every page', async () => {
    const document = await loadPdf(
      await generateCardsPdf(makeCards(2), { cardWidthMm: 50, cardHeightMm: 70 }),
    )

    expect(document.getPageCount()).toBe(2)
    expect(document.getPage(0).getWidth()).toBeCloseTo(50 * MM_TO_PT, 2)
    expect(document.getPage(0).getHeight()).toBeCloseTo(70 * MM_TO_PT, 2)
  })

  it('throws when asked to export an empty card list', async () => {
    await expect(generateCardsPdf([])).rejects.toThrow('Select at least one card to export.')
  })
})

describe('generateCardPdf', () => {
  it('produces a single-page PDF with the standard header', async () => {
    const bytes = await generateCardPdf(makeCard())

    expect(bytes.length).toBeGreaterThan(0)
    expect(pdfHeader(bytes)).toBe('%PDF-')
    const document = await loadPdf(bytes)
    expect(document.getPageCount()).toBe(1)
  })

  it('renders cards with no artwork and with a tiny valid PNG artwork', async () => {
    const withoutImage = makeCard({ id: 'no-image', image: null })
    const withImage = makeCard({ id: 'with-image', image: TINY_PNG_DATA_URL })

    const singleWithout = await generateCardPdf(withoutImage)
    const singleWith = await generateCardPdf(withImage)
    const together = await generateCardsPdf([withoutImage, withImage])

    expect(pdfHeader(singleWithout)).toBe('%PDF-')
    expect(pdfHeader(singleWith)).toBe('%PDF-')
    await expect(loadPdf(singleWithout)).resolves.toBeInstanceOf(PDFDocument)
    await expect(loadPdf(singleWith)).resolves.toBeInstanceOf(PDFDocument)
    await expect(loadPdf(together)).resolves.toBeInstanceOf(PDFDocument)
  })

  it('does not throw for a 60 character title and a 240 character action', async () => {
    const bytes = await generateCardPdf(
      makeCard({
        title: 'T'.repeat(60),
        action: 'A'.repeat(240),
      }),
    )

    expect(pdfHeader(bytes)).toBe('%PDF-')
    expect((await loadPdf(bytes)).getPageCount()).toBe(1)
  })

  it('accepts explicit physical card dimensions for every zone', async () => {
    for (const zone of [Zone.ATTACK, Zone.MIDFIELD, Zone.DEFENSE]) {
      const bytes = await generateCardPdf(makeCard({ zone }), { cardWidthMm: 63, cardHeightMm: 88 })
      expect(pdfHeader(bytes)).toBe('%PDF-')
    }
  })
})

describe('localized PDF export', () => {
  const translatedCard = makeCard({
    id: 'localized-card',
    title: 'Fire Drake',
    subtitle: 'Crimson brood',
    action: 'Deal 2 damage to every enemy in the front row.',
    translations: {
      PT: {
        title: 'Guerreiro',
        subtitle: 'Combatente da Linha de Frente',
        action: 'Carregue contra o inimigo mais próximo.',
      },
    },
  })

  it('renders the Portuguese translation when the language option is PT', async () => {
    const bytes = await generateCardsPdf([translatedCard], { language: 'PT' })
    const content = readPageContent(await loadPdf(bytes))

    expect(content).toContain('Guerreiro')
    expect(content).not.toContain('Guerreir?')
    expect(content).toContain('próximo')
    expect(content).not.toContain('pr?ximo')
    expect(content).not.toContain('Fire Drake')
  })

  it('produces different but valid English and Portuguese PDFs', async () => {
    const english = await generateCardsPdf([translatedCard])
    const portuguese = await generateCardsPdf([translatedCard], { language: 'PT' })

    expect(portuguese).not.toEqual(english)
    await expect(loadPdf(english)).resolves.toBeInstanceOf(PDFDocument)
    await expect(loadPdf(portuguese)).resolves.toBeInstanceOf(PDFDocument)

    const englishContent = readPageContent(await loadPdf(english))
    expect(englishContent).toContain('Fire Drake')
    expect(englishContent).not.toContain('Guerreiro')
  })

  it('falls back to English text for languages without a translation', async () => {
    const bytes = await generateCardsPdf([translatedCard], { language: 'FR' })
    const content = readPageContent(await loadPdf(bytes))

    expect(content).toContain('Fire Drake')
    expect(content).not.toContain('Guerreiro')
  })
})

describe('sanitizeFilename', () => {
  it.each([
    ['Fire Drake! #1', 'fire-drake-1'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a-b-c-d-e-f-g-h-i-j'],
    ['  Mixed CASE Name  ', 'mixed-case-name'],
    ['Café', 'caf'],
  ])('sanitizes %j into %j', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected)
  })

  it.each(['', '   ', '///', '***'])('falls back to "card" for %j', (input) => {
    expect(sanitizeFilename(input)).toBe('card')
  })

  it('limits the sanitized name to 80 characters', () => {
    const result = sanitizeFilename('a'.repeat(200))

    expect(result).toHaveLength(80)
    expect(result).toBe('a'.repeat(80))
  })
})

describe('buildCardsPdfFilename', () => {
  it('uses the card title for a single card', () => {
    expect(buildCardsPdfFilename([makeCard({ title: 'Fire Drake' })])).toBe('fire-drake-card.pdf')
    expect(buildCardsPdfFilename([makeCard({ title: 'Stone Wall!' })])).toBe('stone-wall-card.pdf')
  })

  it('uses a dated name for several cards', () => {
    expect(buildCardsPdfFilename(makeCards(3))).toMatch(/^cards-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(buildCardsPdfFilename(makeCards(3), new Date(2026, 0, 5))).toBe('cards-2026-01-05.pdf')
  })
})

describe('downloadPdf', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  let createdBlobs: Blob[]
  let revokedUrls: string[]
  let clickedDownloads: string[]

  beforeEach(() => {
    createdBlobs = []
    revokedUrls = []
    clickedDownloads = []

    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      createdBlobs.push(blob as Blob)
      return `blob:card-generator/${createdBlobs.length}`
    })
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url)
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownloads.push(this.download)
    })
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    vi.restoreAllMocks()
  })

  it('downloads the PDF as an application/pdf blob and revokes the object URL', () => {
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])

    downloadPdf(data, 'fire-drake-card.pdf')

    expect(createdBlobs).toHaveLength(1)
    expect(createdBlobs[0].type).toBe('application/pdf')
    expect(createdBlobs[0].size).toBe(data.length)
    expect(revokedUrls).toEqual(['blob:card-generator/1'])
    expect(clickedDownloads).toEqual(['fire-drake-card.pdf'])
    expect(document.body.querySelector('a')).toBeNull()
  })

  it('generates the card PDF and downloads it through generateAndDownloadCardPdf', async () => {
    await generateAndDownloadCardPdf(makeCard({ title: 'Fire Drake' }))

    expect(createdBlobs).toHaveLength(1)
    expect(createdBlobs[0].type).toBe('application/pdf')
    expect(createdBlobs[0].size).toBeGreaterThan(0)
    expect(clickedDownloads).toEqual(['fire-drake-card.pdf'])
    expect(revokedUrls).toHaveLength(1)
  })
})
