/**
 * PDF generation service.
 *
 * Renders one card per page using `pdf-lib` only: no screenshots and no
 * canvas. Each page is exactly the physical card size (63 x 88 mm by
 * default) and the card artwork fills it edge-to-edge with no page margins.
 * Every visual element of the web card (see `src/styles/card.css`) is
 * reproduced with vector primitives so the exported document stays crisp at
 * any print resolution.
 *
 * All layout math is expressed as fractions of the card width, mirroring the
 * container-query units (`cqw`) used by the web stylesheet. Cards are never
 * stretched, clipped or overflowing.
 */

import {
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type RGB,
  StandardFonts,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

import { PDF_CONSTANTS } from '@/config/constants'
import { getCardFont } from '@/config/fonts'
import { getCardTextLabels, getZoneLabel, translate, type CardTextLabels } from '@/config/languages'
import { getZoneTheme, type ZoneTheme } from '@/config/zones'
import type { Card } from '@/models/Card'
import { normalizeStars } from '@/models/Card'
import type { Language } from '@/models/Language'
import { dataUrlToUint8Array, detectImageType } from '@/services/image/imageService'
import { getLocalizedCard } from '@/services/localization/cardLocalization'
import { formatDate, sanitizeFilename } from '@/utils/filename'

export { sanitizeFilename }

/** Optional physical dimensions, content language and card font for the PDF. */
export interface PdfGenerationOptions {
  cardWidthMm?: number
  cardHeightMm?: number
  language?: Language
  fontId?: string
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function generateCardPdf(
  card: Card,
  options: PdfGenerationOptions = {},
): Promise<Uint8Array> {
  return generateCardsPdf([card], options)
}

export async function generateCardsPdf(
  cards: Card[],
  options: PdfGenerationOptions = {},
): Promise<Uint8Array> {
  const language = options.language ?? 'EN'

  if (cards.length === 0) {
    throw new Error(translate('error.pdfEmpty', language))
  }

  const cardWidth = resolveMm(options.cardWidthMm, PDF_CONSTANTS.cardWidthMm) * MM_TO_PT
  const cardHeight = resolveMm(options.cardHeightMm, PDF_CONSTANTS.cardHeightMm) * MM_TO_PT

  const document = await PDFDocument.create()
  const fonts = await embedCardFonts(document, options.fontId)

  for (const card of cards) {
    const localizedCard = getLocalizedCard(card, language)
    const page = document.addPage([cardWidth, cardHeight])
    const image = await embedArtwork(document, localizedCard)
    drawCard(page, localizedCard, 0, cardHeight, cardWidth, cardHeight, fonts, image, language)
  }

  return document.save()
}

export function buildCardsPdfFilename(cards: Card[], date: Date = new Date()): string {
  if (cards.length === 1) {
    return `${sanitizeFilename(cards[0].title || 'card')}-card.pdf`
  }

  return `cards-${formatDate(date)}.pdf`
}

export function downloadPdf(data: Uint8Array, filename: string): void {
  if (typeof document === 'undefined') return

  const copy = new Uint8Array(data)
  const blob = new Blob([copy.buffer], { type: 'application/pdf' })
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

export async function generateAndDownloadCardPdf(
  card: Card,
  options: PdfGenerationOptions = {},
): Promise<void> {
  const data = await generateCardPdf(card, options)
  downloadPdf(data, buildCardsPdfFilename([card]))
}

export async function generateAndDownloadCardsPdf(
  cards: Card[],
  options: PdfGenerationOptions = {},
): Promise<void> {
  const data = await generateCardsPdf(cards, options)
  downloadPdf(data, buildCardsPdfFilename(cards))
}

/* ------------------------------------------------------------------ */
/* Page geometry                                                       */
/* ------------------------------------------------------------------ */

const MM_TO_PT = PDF_CONSTANTS.mmToPt

function resolveMm(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/* ------------------------------------------------------------------ */
/* Layout ratios (fractions of the card width, mirrored from card.css) */
/* ------------------------------------------------------------------ */

const LAYOUT = {
  frameInset: 0.024,
  frameRadius: 0.028,
  framePadding: 0.034,
  sectionGap: 0.024,
  titleSize: 0.084,
  titleLineHeight: 1.02,
  titleMaxLines: 2,
  subtitleSize: 0.04,
  subtitleTracking: 0.16,
  subtitleMargin: 0.011,
  badgeTextSize: 0.034,
  badgeTracking: 0.14,
  badgePadX: 0.022,
  badgePadY: 0.012,
  badgeDot: 0.016,
  badgeDotGap: 0.014,
  statsGap: 0.022,
  statPadX: 0.024,
  statPadY: 0.019,
  statRadius: 0.02,
  statIcon: 0.074,
  statIconRadius: 0.016,
  statIconGap: 0.02,
  statLabelSize: 0.029,
  statLabelTracking: 0.2,
  statValueSize: 0.072,
  actionPadX: 0.026,
  actionPadY: 0.022,
  actionRadius: 0.02,
  actionLabelSize: 0.029,
  actionLabelTracking: 0.24,
  actionLabelGap: 0.009,
  actionTextSize: 0.039,
  actionLineHeight: 1.34,
  actionMaxLines: 6,
  artworkMinHeight: 0.44,
  artworkRadius: 0.022,
  starRadius: 0.03,
  starGap: 0.018,
}

const CONTENT_INSET = LAYOUT.frameInset + LAYOUT.framePadding
const REFERENCE_ASPECT = 1.4
const REFERENCE_CONTENT_RATIO = REFERENCE_ASPECT - CONTENT_INSET * 2
const TEXT_ASCENT = 0.72
const TEXT_CENTER_OFFSET = 0.36
const MIN_ACTION_FONT_SIZE = 4.5
const GRADIENT_BANDS = 40
const BEZIER_CIRCLE = 0.5522847498307936
const CARD_BOTTOM_COLOR = '#05070d'
const CARD_SURFACE_COLOR = '#ffffff'

/**
 * Sum of every vertical section at full scale. Used to compute the global
 * vertical scale so short/wide cards never overflow their frame.
 */
const WORST_CONTENT_RATIO =
  LAYOUT.titleSize * LAYOUT.titleMaxLines * LAYOUT.titleLineHeight +
  LAYOUT.subtitleMargin +
  LAYOUT.subtitleSize * 1.4 +
  (LAYOUT.statPadY * 2 +
    Math.max(LAYOUT.statIcon, LAYOUT.statLabelSize * 1.2 + LAYOUT.statValueSize * 1.05)) +
  LAYOUT.sectionGap * 4 +
  LAYOUT.artworkMinHeight +
  (LAYOUT.actionPadY * 2 +
    LAYOUT.actionLabelSize +
    LAYOUT.actionLabelGap +
    LAYOUT.actionMaxLines * LAYOUT.actionTextSize * LAYOUT.actionLineHeight) +
  LAYOUT.starRadius * 2

/* ------------------------------------------------------------------ */
/* Drawing primitives                                                  */
/* ------------------------------------------------------------------ */

/**
 * Text font that can mix the selected card font with a standard fallback.
 *
 * Demo fonts only contain usable glyphs for letters, so digits, punctuation
 * and accented characters are drawn with the fallback font while letters keep
 * the card font. When `lettersOnly` is false the primary font handles
 * everything.
 */
class CardTextFont {
  private readonly supportedCodePoints: Set<number> | null

  constructor(
    private readonly primary: PDFFont | null,
    private readonly fallback: PDFFont,
    private readonly lettersOnly: boolean,
  ) {
    this.supportedCodePoints = primary
      ? new Set(primary.getCharacterSet())
      : null
  }

  /** The standard font used for characters the primary font does not cover. */
  get fallbackFont(): PDFFont {
    return this.fallback
  }

  private fontFor(char: string): PDFFont {
    if (!this.primary) return this.fallback
    if (this.lettersOnly && !/[A-Za-z]/.test(char)) return this.fallback
    if (!this.supportedCodePoints?.has(char.codePointAt(0) ?? 0)) return this.fallback
    return this.primary
  }

  private runs(text: string): Array<{ font: PDFFont; text: string }> {
    const runs: Array<{ font: PDFFont; text: string }> = []

    for (const char of text) {
      const font = this.fontFor(char)
      const last = runs[runs.length - 1]
      if (last && last.font === font) {
        last.text += char
      } else {
        runs.push({ font, text: char })
      }
    }

    return runs
  }

  widthOfTextAtSize(text: string, size: number): number {
    return this.runs(text).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0)
  }

  canEncode(text: string): boolean {
    try {
      for (const run of this.runs(text)) {
        run.font.encodeText(run.text)
      }
      return true
    } catch {
      return false
    }
  }

  draw(
    page: PDFPage,
    text: string,
    options: { x: number; y: number; size: number; color: RGB; opacity?: number },
  ): void {
    let cursor = options.x

    for (const run of this.runs(text)) {
      page.drawText(run.text, {
        x: cursor,
        y: options.y,
        size: options.size,
        font: run.font,
        color: options.color,
        opacity: options.opacity,
      })
      cursor += run.font.widthOfTextAtSize(run.text, options.size)
    }
  }
}

interface EmbeddedFonts {
  regular: CardTextFont
  bold: CardTextFont
  oblique: CardTextFont
}

interface CardRenderContext {
  page: PDFPage
  /** Page x of the card's left edge. */
  left: number
  /** Page y of the card's top edge. */
  top: number
  width: number
  height: number
}

/** Axis-aligned box in card-local coordinates (origin at the top-left). */
interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface RoundedRectStyle {
  color?: RGB
  opacity?: number
  borderColor?: RGB
  borderOpacity?: number
  borderWidth?: number
}

async function embedStandardFonts(document: PDFDocument): Promise<EmbeddedFonts> {
  const [regular, bold, oblique] = await Promise.all([
    document.embedFont(StandardFonts.Helvetica),
    document.embedFont(StandardFonts.HelveticaBold),
    document.embedFont(StandardFonts.HelveticaOblique),
  ])

  return {
    regular: new CardTextFont(null, regular, false),
    bold: new CardTextFont(null, bold, false),
    oblique: new CardTextFont(null, oblique, false),
  }
}

let hasWarnedAboutCardFont = false

interface LocalFontData {
  family: string
  blob?: () => Promise<Blob>
}

interface LocalFontAccessGlobal {
  queryLocalFonts?: () => Promise<LocalFontData[]>
}

async function fetchFontBytes(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await response.arrayBuffer()
  } catch {
    return null
  }
}

/**
 * Reads the bytes of an installed system font through the Local Font Access
 * API (Chromium only, permission gated). Returns null on every other browser
 * so the export can fall back to the standard fonts.
 */
async function loadSystemFontBytes(family: string): Promise<ArrayBuffer | null> {
  const api = globalThis as unknown as LocalFontAccessGlobal
  if (typeof api.queryLocalFonts !== 'function') return null

  try {
    const fonts = await api.queryLocalFonts()
    const match = fonts.find(
      (font) =>
        font.family.toLowerCase() === family.toLowerCase() && typeof font.blob === 'function',
    )
    if (!match?.blob) return null

    const blob = await match.blob()
    return await blob.arrayBuffer()
  } catch {
    // Permission denied or unsupported: the caller uses the standard fonts.
    return null
  }
}

/**
 * Embeds the selected card font for all card text. Bundled demo fonts are
 * limited to letters with every other character falling back to the standard
 * fonts; system fonts are embedded when the browser exposes their bytes.
 * Falls back entirely to the standard fonts when the font cannot be loaded,
 * so PDF generation never fails because of typography.
 */
async function embedCardFonts(document: PDFDocument, fontId?: string): Promise<EmbeddedFonts> {
  const standard = await embedStandardFonts(document)
  const option = getCardFont(fontId ?? '')

  if (!option) return standard

  const bytes =
    option.kind === 'bundled' && option.url
      ? await fetchFontBytes(option.url)
      : await loadSystemFontBytes(option.family)

  if (bytes) {
    try {
      document.registerFontkit(fontkit)
      const custom = await document.embedFont(bytes, { subset: true })

      return {
        regular: new CardTextFont(custom, standard.regular.fallbackFont, option.lettersOnly),
        bold: new CardTextFont(custom, standard.bold.fallbackFont, option.lettersOnly),
        oblique: new CardTextFont(custom, standard.oblique.fallbackFont, option.lettersOnly),
      }
    } catch {
      // Handled below with the standard fonts.
    }
  }

  if (!hasWarnedAboutCardFont) {
    hasWarnedAboutCardFont = true
    console.warn('The card font could not be embedded; using standard PDF fonts.')
  }

  return standard
}

async function embedArtwork(document: PDFDocument, card: Card): Promise<PDFImage | null> {
  if (!card.image) return null

  try {
    const bytes = dataUrlToUint8Array(card.image)
    const type = detectImageType(bytes)
    if (type === 'image/png') return await document.embedPng(bytes)
    if (type === 'image/jpeg') return await document.embedJpg(bytes)
  } catch {
    // WebP (unsupported by pdf-lib) and corrupt payloads fall back to the
    // placeholder. Image problems must never break the export.
    return null
  }

  return null
}

function toPdfBox(ctx: CardRenderContext, box: Box): Box {
  return { x: ctx.left + box.x, y: ctx.top - box.y - box.height, width: box.width, height: box.height }
}

function drawLocalRect(
  ctx: CardRenderContext,
  box: Box,
  color: RGB,
  opacity: number,
): void {
  const pdfBox = toPdfBox(ctx, box)
  ctx.page.drawRectangle({ ...pdfBox, color, opacity })
}

function drawLocalRoundedRect(
  ctx: CardRenderContext,
  box: Box,
  radius: number,
  style: RoundedRectStyle,
): void {
  ctx.page.drawSvgPath(roundedRectPath(box.width, box.height, radius), {
    x: ctx.left + box.x,
    y: ctx.top - box.y,
    color: style.color,
    opacity: style.opacity,
    borderColor: style.borderColor,
    borderOpacity: style.borderOpacity,
    borderWidth: style.borderWidth,
  })
}

function roundedRectPath(width: number, height: number, radius: number): string {
  const r = clamp(radius, 0, Math.min(width, height) / 2)
  const w = round(width)
  const h = round(height)
  const rr = round(r)
  return (
    `M ${rr} 0 H ${round(width - r)} A ${rr} ${rr} 0 0 1 ${w} ${rr} ` +
    `V ${round(height - r)} A ${rr} ${rr} 0 0 1 ${round(width - r)} ${h} ` +
    `H ${rr} A ${rr} ${rr} 0 0 1 0 ${round(height - r)} ` +
    `V ${rr} A ${rr} ${rr} 0 0 1 ${rr} 0 Z`
  )
}

/**
 * Clips subsequent drawing operations to a rounded rectangle (`W n`).
 * Pair every call with `popClip`.
 */
function pushRoundedRectClip(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = clamp(radius, 0, Math.min(width, height) / 2)
  const k = BEZIER_CIRCLE
  const right = x + width
  const top = y + height

  page.pushOperators(
    pushGraphicsState(),
    moveTo(x + r, y),
    lineTo(right - r, y),
    appendBezierCurve(right - r + k * r, y, right, y + r - k * r, right, y + r),
    lineTo(right, top - r),
    appendBezierCurve(right, top - r + k * r, right - r + k * r, top, right - r, top),
    lineTo(x + r, top),
    appendBezierCurve(x + r - k * r, top, x, top - r + k * r, x, top - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - k * r, x + r - k * r, y, x + r, y),
    closePath(),
    clip(),
    endPath(),
  )
}

function popClip(page: PDFPage): void {
  page.pushOperators(popGraphicsState())
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

function isEncodable(font: CardTextFont, text: string): boolean {
  return font.canEncode(text)
}

/** Replaces characters the fonts cannot encode (e.g. emoji). */
function normalizeForFont(font: CardTextFont, text: string): string {
  if (isEncodable(font, text)) return text

  let result = ''
  for (const char of text) {
    result += isEncodable(font, char) ? char : '?'
  }
  return result
}

function measure(font: CardTextFont, text: string, size: number): number {
  if (!text) return 0
  try {
    return font.widthOfTextAtSize(text, size)
  } catch {
    return font.widthOfTextAtSize(normalizeForFont(font, text), size)
  }
}

function trackedTextWidth(font: CardTextFont, text: string, size: number, tracking: number): number {
  if (!text) return 0
  return measure(font, text, size) + tracking * (text.length - 1)
}

/** Greedy word wrap with hard splitting for words wider than the box. */
function wrapText(text: string, font: CardTextFont, size: number, maxWidth: number): string[] {
  const normalized = normalizeForFont(font, text).replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const lines: string[] = []
  let current = ''

  for (const word of normalized.split(' ')) {
    const candidate = current ? `${current} ${word}` : word
    if (measure(font, candidate, size) <= maxWidth) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = ''
    }

    if (measure(font, word, size) <= maxWidth) {
      current = word
      continue
    }

    let chunk = ''
    for (const char of word) {
      const next = chunk + char
      if (chunk && measure(font, next, size) > maxWidth) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk = next
      }
    }
    current = chunk
  }

  if (current) lines.push(current)
  return lines
}

function ellipsize(text: string, font: CardTextFont, size: number, maxWidth: number): string {
  if (!text) return ''
  if (measure(font, text, size) <= maxWidth) return text

  const ellipsis = '…'
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const candidate = text.slice(0, middle).trimEnd() + ellipsis
    if (measure(font, candidate, size) <= maxWidth) low = middle
    else high = middle - 1
  }

  return text.slice(0, low).trimEnd() + ellipsis
}

function fitTitle(
  text: string,
  font: CardTextFont,
  maxSize: number,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; size: number } {
  const normalized = normalizeForFont(font, text).trim()
  if (!normalized) return { lines: [], size: maxSize }

  const minSize = Math.max(7, maxSize * 0.45)
  let size = maxSize
  let lines = wrapText(normalized, font, size, maxWidth)

  while (lines.length > maxLines && size > minSize) {
    size = Math.max(minSize, size - 0.5)
    lines = wrapText(normalized, font, size, maxWidth)
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    const lastIndex = lines.length - 1
    lines[lastIndex] = ellipsize(lines[lastIndex], font, size, maxWidth)
  }

  return { lines, size }
}

function fitActionLines(
  text: string,
  font: CardTextFont,
  maxWidth: number,
  maxHeight: number,
  maxSize: number,
): { lines: string[]; size: number } {
  for (let size = maxSize; size >= MIN_ACTION_FONT_SIZE; size -= 0.25) {
    const lines = wrapText(text, font, size, maxWidth)
    if (lines.length * size * LAYOUT.actionLineHeight <= maxHeight) return { lines, size }
  }

  const size = MIN_ACTION_FONT_SIZE
  let lines = wrapText(text, font, size, maxWidth)
  const capacity = Math.max(1, Math.floor(maxHeight / (size * LAYOUT.actionLineHeight)))
  if (lines.length > capacity) {
    lines = lines.slice(0, capacity)
    const lastIndex = lines.length - 1
    lines[lastIndex] = ellipsize(lines[lastIndex], font, size, maxWidth)
  }
  return { lines, size }
}

function drawLocalText(
  ctx: CardRenderContext,
  text: string,
  x: number,
  top: number,
  font: CardTextFont,
  size: number,
  color: RGB,
  opacity = 1,
): void {
  const baseline = ctx.top - top - size * TEXT_ASCENT
  font.draw(ctx.page, text, { x: ctx.left + x, y: baseline, size, color, opacity })
}

/** Draws letter-spaced text one glyph at a time, like the CSS tracking. */
function drawTrackedText(
  ctx: CardRenderContext,
  text: string,
  x: number,
  baselineY: number,
  font: CardTextFont,
  size: number,
  color: RGB,
  opacity: number,
  tracking: number,
): void {
  let cursor = ctx.left + x
  for (const char of text) {
    font.draw(ctx.page, char, { x: cursor, y: baselineY, size, color, opacity })
    cursor += measure(font, char, size) + tracking
  }
}

/* ------------------------------------------------------------------ */
/* Colors                                                              */
/* ------------------------------------------------------------------ */

interface ParsedColor {
  color: RGB
  opacity: number
}

/**
 * Converts `#rrggbb`/`#rgb` and `rgb()`/`rgba()` strings (the formats used by
 * `zoneConfig`) into a pdf-lib color plus opacity.
 */
function parseColor(value: string): ParsedColor {
  const trimmed = value.trim()

  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('')
    }
    const int = Number.parseInt(hex, 16)
    return {
      color: rgb(((int >> 16) & 0xff) / 255, ((int >> 8) & 0xff) / 255, (int & 0xff) / 255),
      opacity: 1,
    }
  }

  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    trimmed,
  )
  if (rgbMatch) {
    return {
      color: rgb(
        clamp(Number(rgbMatch[1]), 0, 255) / 255,
        clamp(Number(rgbMatch[2]), 0, 255) / 255,
        clamp(Number(rgbMatch[3]), 0, 255) / 255,
      ),
      opacity: rgbMatch[4] !== undefined ? clamp(Number(rgbMatch[4]), 0, 1) : 1,
    }
  }

  return { color: rgb(0, 0, 0), opacity: 1 }
}

function mixColors(from: RGB, to: RGB, t: number): RGB {
  return rgb(
    from.red + (to.red - from.red) * t,
    from.green + (to.green - from.green) * t,
    from.blue + (to.blue - from.blue) * t,
  )
}

/* ------------------------------------------------------------------ */
/* Card rendering                                                      */
/* ------------------------------------------------------------------ */

function drawCard(
  page: PDFPage,
  card: Card,
  left: number,
  top: number,
  width: number,
  height: number,
  fonts: EmbeddedFonts,
  image: PDFImage | null,
  language: Language,
): void {
  const theme = getZoneTheme(card.zone)
  const labels = getCardTextLabels(language)
  const ctx: CardRenderContext = { page, left, top, width, height }
  const contentRatio = height / width - CONTENT_INSET * 2
  const vScale = clamp(contentRatio / WORST_CONTENT_RATIO, 0.3, 1)

  drawCardBackground(ctx, theme)
  drawCardFrame(ctx, theme)

  const contentX = CONTENT_INSET * width
  const contentTop = CONTENT_INSET * width
  const contentWidth = width - contentX * 2
  const contentHeight = height - contentTop * 2
  const gap = LAYOUT.sectionGap * width * vScale

  /* ---- zone badge metrics ---- */
  const badgeFontSize = LAYOUT.badgeTextSize * width * vScale
  const badgeLabel = normalizeForFont(fonts.bold, getZoneLabel(card.zone, language).toUpperCase())
  const badgeTracking = LAYOUT.badgeTracking * badgeFontSize
  const badgeTextWidth = trackedTextWidth(fonts.bold, badgeLabel, badgeFontSize, badgeTracking)
  const badgeDotDiameter = LAYOUT.badgeDot * width
  const badgeHeight =
    LAYOUT.badgePadY * 2 * width * vScale +
    Math.max(badgeDotDiameter, badgeFontSize * 1.2)
  const badgeWidth =
    LAYOUT.badgePadX * 2 * width + badgeDotDiameter + LAYOUT.badgeDotGap * width + badgeTextWidth

  /* ---- header ---- */
  const columnWidth = Math.max(1, contentWidth - gap - badgeWidth)
  const titleBaseSize = LAYOUT.titleSize * width * vScale
  const titleText = card.title.trim() ? card.title : labels.untitled
  const title = fitTitle(titleText, fonts.bold, titleBaseSize, columnWidth, LAYOUT.titleMaxLines)
  const titleLineHeight = title.size * LAYOUT.titleLineHeight
  const titleBlockHeight = title.lines.length * titleLineHeight
  const subtitleSize = LAYOUT.subtitleSize * width * vScale
  const subtitle = card.subtitle
    ? ellipsize(
        normalizeForFont(fonts.oblique, card.subtitle.toUpperCase()),
        fonts.oblique,
        subtitleSize,
        columnWidth,
      )
    : ''
  const subtitleBlockHeight = subtitle
    ? LAYOUT.subtitleMargin * width * vScale + subtitleSize * 1.4
    : 0
  const headerHeight = Math.max(titleBlockHeight + subtitleBlockHeight, badgeHeight)

  /* ---- statistics ---- */
  const statLabelSize = LAYOUT.statLabelSize * width * vScale
  const statValueSize = LAYOUT.statValueSize * width * vScale
  const statIconSize = LAYOUT.statIcon * width * vScale
  const statsPanelWidth = (contentWidth - LAYOUT.statsGap * width) / 2
  const statBodyHeight = statLabelSize * 1.2 + statValueSize * 1.05
  const statsHeight =
    LAYOUT.statPadY * 2 * width * vScale + Math.max(statIconSize, statBodyHeight)

  /* ---- stars ---- */
  const starRadius = LAYOUT.starRadius * width * vScale
  const starGap = LAYOUT.starGap * width * vScale
  const starsHeight = starRadius * 2

  /* ---- action ---- */
  const actionPadX = LAYOUT.actionPadX * width
  const actionPadY = LAYOUT.actionPadY * width * vScale
  const actionLabelSize = LAYOUT.actionLabelSize * width * vScale
  const actionLabelGap = LAYOUT.actionLabelGap * width * vScale
  const actionInnerWidth = Math.max(1, contentWidth - actionPadX * 2)
  const artworkMinHeight = LAYOUT.artworkMinHeight * width * vScale
  const maxActionHeight = Math.max(
    actionPadY * 2 + actionLabelSize + actionLabelGap + MIN_ACTION_FONT_SIZE,
    contentHeight - headerHeight - statsHeight - starsHeight - gap * 4 - artworkMinHeight,
  )
  const actionInnerHeight = Math.max(
    1,
    maxActionHeight - actionPadY * 2 - actionLabelSize - actionLabelGap,
  )
  const action = fitActionLines(
    card.action,
    fonts.regular,
    actionInnerWidth,
    actionInnerHeight,
    LAYOUT.actionTextSize * width * vScale,
  )
  const actionHeight = Math.min(
    maxActionHeight,
    actionPadY * 2 +
      actionLabelSize +
      actionLabelGap +
      action.lines.length * action.size * LAYOUT.actionLineHeight,
  )
  const artworkHeight = Math.max(
    0,
    contentHeight - headerHeight - statsHeight - actionHeight - starsHeight - gap * 4,
  )

  const artworkBox: Box = {
    x: contentX,
    y: contentTop + headerHeight + gap,
    width: contentWidth,
    height: artworkHeight,
  }
  const statsTop = artworkBox.y + artworkBox.height + gap
  const actionTop = statsTop + statsHeight + gap
  const starsTop = actionTop + actionHeight + gap

  /* ---- header ---- */
  const badgeBox: Box = {
    x: contentX + contentWidth - badgeWidth,
    y: contentTop,
    width: badgeWidth,
    height: badgeHeight,
  }
  drawZoneBadge(ctx, theme, badgeBox, fonts.bold, badgeLabel, badgeFontSize, badgeTracking, badgeDotDiameter)

  let lineTop = contentTop
  for (const line of title.lines) {
    drawLocalText(ctx, line, contentX, lineTop, fonts.bold, title.size, parseColor(theme.ink).color)
    lineTop += titleLineHeight
  }

  if (subtitle) {
    const subtitleTop = contentTop + titleBlockHeight + LAYOUT.subtitleMargin * width * vScale
    const subtitleBaseline = ctx.top - subtitleTop - subtitleSize * TEXT_ASCENT
    drawTrackedText(
      ctx,
      subtitle,
      contentX,
      subtitleBaseline,
      fonts.oblique,
      subtitleSize,
      parseColor(theme.inkMuted).color,
      1,
      LAYOUT.subtitleTracking * subtitleSize,
    )
  }

  /* ---- artwork ---- */
  drawArtworkBox(ctx, theme, image, artworkBox, LAYOUT.artworkRadius * width, card, fonts, labels)

  /* ---- statistics ---- */
  drawStats(
    ctx,
    theme,
    fonts,
    statsTop,
    statsHeight,
    statsPanelWidth,
    statIconSize,
    statBodyHeight,
    statLabelSize,
    statValueSize,
    card,
    labels,
  )

  /* ---- action ---- */
  const actionBox: Box = { x: contentX, y: actionTop, width: contentWidth, height: actionHeight }
  drawAction(ctx, theme, fonts, actionBox, actionPadX, actionPadY, actionLabelSize, actionLabelGap, action, labels)

  /* ---- stars ---- */
  drawStars(ctx, theme, starsTop, starsHeight, starRadius, starGap, card)
}

/** Unit five-point star centred at (0,0) in SVG coordinates (points up). */
const STAR_PATH =
  'M 0 -1 L 0.2245 -0.309 L 0.9511 -0.309 L 0.3633 0.118 L 0.5878 0.809 L 0 0.382 L -0.5878 0.809 L -0.3633 0.118 L -0.9511 -0.309 L -0.2245 -0.309 Z'

function drawStars(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  starsTop: number,
  starsHeight: number,
  starRadius: number,
  starGap: number,
  card: Card,
): void {
  const { page, left, width } = ctx
  const totalStars = normalizeStars(card.stars)
  const contentX = CONTENT_INSET * width
  const contentWidth = width - contentX * 2
  const totalWidth = starRadius * 6 + starGap * 2
  const centerY = ctx.top - (starsTop + starsHeight / 2)
  const filledColor = parseColor(theme.accent).color
  const emptyColor = parseColor(theme.inkMuted).color

  for (let index = 0; index < 3; index += 1) {
    const centerX =
      left +
      contentX +
      (contentWidth - totalWidth) / 2 +
      starRadius +
      index * (starRadius * 2 + starGap)
    const filled = index < totalStars

    page.drawSvgPath(STAR_PATH, {
      x: centerX,
      y: centerY,
      scale: starRadius,
      color: filled ? filledColor : emptyColor,
      opacity: filled ? 1 : 0.2,
    })
  }
}

function drawCardBackground(ctx: CardRenderContext, theme: ZoneTheme): void {
  const { width, height } = ctx
  const bottomColor = parseColor(CARD_BOTTOM_COLOR).color

  // White card stock: the printed card is white with a coloured inner frame.
  drawLocalRect(ctx, { x: 0, y: 0, width, height }, parseColor(CARD_SURFACE_COLOR).color, 1)

  const inset = LAYOUT.frameInset * width
  const radius = LAYOUT.frameRadius * width
  const frame: Box = {
    x: inset,
    y: inset,
    width: width - inset * 2,
    height: height - inset * 2,
  }

  const pdfFrame = toPdfBox(ctx, frame)
  pushRoundedRectClip(ctx.page, pdfFrame.x, pdfFrame.y, pdfFrame.width, pdfFrame.height, radius)

  drawLocalRect(ctx, frame, bottomColor, 1)

  const from = parseColor(theme.gradientFrom).color
  const bandHeight = frame.height / GRADIENT_BANDS
  for (let index = 0; index < GRADIENT_BANDS; index += 1) {
    const t = index / (GRADIENT_BANDS - 1)
    const bandTop = frame.y + index * bandHeight
    drawLocalRect(
      ctx,
      { x: frame.x, y: bandTop - 0.25, width: frame.width, height: bandHeight + 0.5 },
      mixColors(from, bottomColor, t),
      1,
    )
  }

  // Subtle top glow plus the soft zone halo behind the artwork.
  const primary = parseColor(theme.primary).color
  const primaryDark = parseColor(theme.primaryDark).color
  const centerX = frame.x + frame.width / 2
  drawRadialGlow(
    ctx,
    centerX,
    frame.y - 0.06 * frame.height,
    0.62 * frame.width,
    0.34 * frame.height,
    primary,
    6,
    0.055,
  )
  drawRadialGlow(
    ctx,
    centerX,
    frame.y + 0.28 * frame.height,
    0.55 * frame.width,
    0.26 * frame.height,
    primary,
    5,
    0.045,
  )
  drawRadialGlow(
    ctx,
    centerX,
    frame.y + 1.02 * frame.height,
    0.95 * frame.width,
    0.38 * frame.height,
    primaryDark,
    5,
    0.05,
  )

  popClip(ctx.page)
}

function drawRadialGlow(
  ctx: CardRenderContext,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  color: RGB,
  layers: number,
  opacity: number,
): void {
  for (let index = 0; index < layers; index += 1) {
    const t = layers === 1 ? 0 : index / (layers - 1)
    ctx.page.drawEllipse({
      x: ctx.left + centerX,
      y: ctx.top - centerY,
      xScale: radiusX * (1 - 0.55 * t),
      yScale: radiusY * (1 - 0.55 * t),
      color,
      opacity,
    })
  }
}

function drawCardFrame(ctx: CardRenderContext, theme: ZoneTheme): void {
  const inset = LAYOUT.frameInset * ctx.width
  const radius = LAYOUT.frameRadius * ctx.width
  const frame: Box = {
    x: inset,
    y: inset,
    width: ctx.width - inset * 2,
    height: ctx.height - inset * 2,
  }

  drawLocalRoundedRect(ctx, frame, radius, { color: rgb(0, 0, 0), opacity: 0.06 })

  const pdfFrame = toPdfBox(ctx, frame)
  pushRoundedRectClip(ctx.page, pdfFrame.x, pdfFrame.y, pdfFrame.width, pdfFrame.height, radius)
  drawLocalRect(
    ctx,
    { x: frame.x, y: frame.y, width: frame.width, height: frame.height * 0.45 },
    rgb(1, 1, 1),
    0.025,
  )
  popClip(ctx.page)

  const frameBorder = parseColor('rgba(255, 255, 255, 0.16)')
  drawLocalRoundedRect(ctx, frame, radius, {
    borderColor: frameBorder.color,
    borderOpacity: frameBorder.opacity,
    borderWidth: Math.max(0.4, 0.003 * ctx.width),
  })

  drawCornerTicks(ctx, theme, frame)
}

function drawCornerTicks(ctx: CardRenderContext, theme: ZoneTheme, frame: Box): void {
  const size = 0.07 * ctx.width
  const thickness = Math.max(0.5, 0.009 * ctx.width)
  const radius = 0.024 * ctx.width
  const accent = parseColor(theme.accent)

  const topLeftPath =
    `M ${round(size)} 0 H ${round(radius)} Q 0 0 0 ${round(radius)} V ${round(size)}`
  ctx.page.drawSvgPath(topLeftPath, {
    x: ctx.left + frame.x,
    y: ctx.top - frame.y,
    borderColor: accent.color,
    borderOpacity: accent.opacity * 0.85,
    borderWidth: thickness,
  })

  const right = frame.x + frame.width
  const bottom = frame.y + frame.height
  const bottomRightPath =
    `M ${round(right - size)} ${round(bottom)} H ${round(right - radius)} ` +
    `Q ${round(right)} ${round(bottom)} ${round(right)} ${round(bottom - radius)} ` +
    `V ${round(bottom - size)}`
  ctx.page.drawSvgPath(bottomRightPath, {
    x: ctx.left,
    y: ctx.top,
    borderColor: accent.color,
    borderOpacity: accent.opacity * 0.85,
    borderWidth: thickness,
  })
}

function drawZoneBadge(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  box: Box,
  font: CardTextFont,
  label: string,
  fontSize: number,
  tracking: number,
  dotDiameter: number,
): void {
  const background = parseColor(theme.badgeBackground)
  const border = parseColor(theme.primary)
  const accent = parseColor(theme.accent)
  const centerY = box.y + box.height / 2
  const dotRadius = dotDiameter / 2
  const dotX = box.x + LAYOUT.badgePadX * ctx.width + dotRadius

  drawLocalRoundedRect(ctx, box, box.height / 2, {
    color: background.color,
    opacity: background.opacity,
    borderColor: border.color,
    borderOpacity: border.opacity * 0.55,
    borderWidth: Math.max(0.4, 0.0025 * ctx.width),
  })

  ctx.page.drawEllipse({
    x: ctx.left + dotX,
    y: ctx.top - centerY,
    xScale: dotRadius * 2.2,
    yScale: dotRadius * 2.2,
    color: accent.color,
    opacity: 0.12,
  })
  ctx.page.drawEllipse({
    x: ctx.left + dotX,
    y: ctx.top - centerY,
    xScale: dotRadius,
    yScale: dotRadius,
    color: accent.color,
    opacity: 1,
  })

  const textX = dotX + dotRadius + LAYOUT.badgeDotGap * ctx.width
  const baseline = ctx.top - centerY - fontSize * TEXT_CENTER_OFFSET
  drawTrackedText(ctx, label, textX, baseline, font, fontSize, parseColor(theme.badgeText).color, 1, tracking)
}

function drawArtworkBox(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  image: PDFImage | null,
  box: Box,
  radius: number,
  card: Card,
  fonts: EmbeddedFonts,
  labels: CardTextLabels,
): void {
  const border = parseColor(theme.panelBorder)

  drawLocalRoundedRect(ctx, box, radius, { color: rgb(0, 0, 0), opacity: 0.42 })

  const pdfBox = toPdfBox(ctx, box)
  pushRoundedRectClip(ctx.page, pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height, radius)

  if (image && image.width > 0 && image.height > 0) {
    drawArtworkImage(ctx, image, box)
    drawArtworkShade(ctx, box)
  } else {
    drawArtworkPlaceholder(ctx, theme, box, card, fonts, labels)
  }

  popClip(ctx.page)

  drawLocalRoundedRect(ctx, box, radius, {
    borderColor: border.color,
    borderOpacity: border.opacity,
    borderWidth: Math.max(0.4, 0.0025 * ctx.width),
  })
}

/**
 * `object-fit: cover`: uniform scale, centred. The rounded clip masks any
 * overflow so the image can never escape the artwork box.
 */
function drawArtworkImage(ctx: CardRenderContext, image: PDFImage, box: Box): void {
  const scale = Math.max(box.width / image.width, box.height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  const localLeft = box.x + (box.width - drawWidth) / 2
  const localTop = box.y + (box.height - drawHeight) / 2

  ctx.page.drawImage(image, {
    x: ctx.left + localLeft,
    y: ctx.top - localTop - drawHeight,
    width: drawWidth,
    height: drawHeight,
  })
}

/** Bottom vignette of the artwork (52% -> 100% black in the stylesheet). */
function drawArtworkShade(ctx: CardRenderContext, box: Box): void {
  const bands = 10
  const shadeHeight = box.height * 0.48
  const bandHeight = shadeHeight / bands
  const start = box.y + box.height - shadeHeight

  for (let index = 0; index < bands; index += 1) {
    const t = index / (bands - 1)
    drawLocalRect(
      ctx,
      { x: box.x, y: start + index * bandHeight, width: box.width, height: bandHeight + 0.3 },
      rgb(0, 0, 0),
      0.5 * t,
    )
  }
}

function drawArtworkPlaceholder(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  box: Box,
  card: Card,
  fonts: EmbeddedFonts,
  labels: CardTextLabels,
): void {
  const deep = parseColor(theme.primaryDeep).color
  const primary = parseColor(theme.primary).color
  const light = parseColor(theme.primaryLight).color

  drawLocalRect(ctx, box, deep, 0.9)
  drawRadialGlow(
    ctx,
    box.x + box.width * 0.3,
    box.y + box.height * 0.18,
    box.width * 0.5,
    box.height * 0.4,
    primary,
    4,
    0.06,
  )
  drawArtworkShade(ctx, box)

  const initialText = normalizeForFont(
    fonts.bold,
    (card.title.trim().charAt(0) || '?').toUpperCase(),
  )
  const labelText = normalizeForFont(fonts.bold, labels.noArtwork.toUpperCase())
  const initialSize = box.width * 0.24
  const labelSize = box.width * 0.032
  const labelTracking = labelSize * 0.24
  const initialWidth = measure(fonts.bold, initialText, initialSize)
  const labelWidth = trackedTextWidth(fonts.bold, labelText, labelSize, labelTracking)
  const blockHeight = initialSize + box.width * 0.02 + labelSize * 1.4
  const blockTop = box.y + (box.height - blockHeight) / 2
  const initialBaseline = ctx.top - blockTop - initialSize * TEXT_ASCENT

  fonts.bold.draw(ctx.page, initialText, {
    x: ctx.left + box.x + (box.width - initialWidth) / 2,
    y: initialBaseline,
    size: initialSize,
    color: light,
    opacity: 0.22,
  })

  const labelTop = blockTop + initialSize + box.width * 0.02
  const labelBaseline = ctx.top - labelTop - labelSize * TEXT_ASCENT
  drawTrackedText(
    ctx,
    labelText,
    box.x + (box.width - labelWidth) / 2,
    labelBaseline,
    fonts.bold,
    labelSize,
    rgb(1, 1, 1),
    0.4,
    labelTracking,
  )
}

function drawStats(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  fonts: EmbeddedFonts,
  statsTop: number,
  statsHeight: number,
  panelWidth: number,
  iconSize: number,
  bodyHeight: number,
  labelSize: number,
  valueSize: number,
  card: Card,
  labels: CardTextLabels,
): void {
  const statLabels = [
    normalizeForFont(fonts.bold, labels.attack.toUpperCase()),
    normalizeForFont(fonts.bold, labels.defense.toUpperCase()),
  ] as const
  const values = [formatStat(card.attack), formatStat(card.defense)] as const
  const panelColor = parseColor(theme.panel)
  const borderColor = parseColor(theme.panelBorder)
  const inkMuted = parseColor(theme.inkMuted).color
  const ink = parseColor(theme.ink).color
  const accent = parseColor(theme.accent).color

  for (let index = 0; index < statLabels.length; index += 1) {
    const panelX = CONTENT_INSET * ctx.width + index * (panelWidth + LAYOUT.statsGap * ctx.width)
    const panel: Box = { x: panelX, y: statsTop, width: panelWidth, height: statsHeight }

    drawLocalRoundedRect(ctx, panel, LAYOUT.statRadius * ctx.width, {
      color: panelColor.color,
      opacity: panelColor.opacity,
      borderColor: borderColor.color,
      borderOpacity: borderColor.opacity,
      borderWidth: Math.max(0.4, 0.0025 * ctx.width),
    })

    const iconBox: Box = {
      x: panelX + LAYOUT.statPadX * ctx.width,
      y: statsTop + (statsHeight - iconSize) / 2,
      width: iconSize,
      height: iconSize,
    }
    drawLocalRoundedRect(ctx, iconBox, LAYOUT.statIconRadius * ctx.width, {
      color: rgb(0, 0, 0),
      opacity: 0.34,
      borderColor: borderColor.color,
      borderOpacity: borderColor.opacity,
      borderWidth: Math.max(0.4, 0.0025 * ctx.width),
    })
    drawStatIcon(ctx, theme, iconBox, index === 0)

    const bodyX = iconBox.x + iconSize + LAYOUT.statIconGap * ctx.width
    const bodyTop = statsTop + (statsHeight - bodyHeight) / 2

    const labelBaseline = ctx.top - bodyTop - labelSize * TEXT_ASCENT
    drawTrackedText(
      ctx,
      statLabels[index],
      bodyX,
      labelBaseline,
      fonts.bold,
      labelSize,
      inkMuted,
      1,
      LAYOUT.statLabelTracking * labelSize,
    )

    drawLocalText(
      ctx,
      values[index],
      bodyX,
      bodyTop + labelSize * 1.2,
      fonts.bold,
      valueSize,
      index === 0 ? accent : ink,
    )
  }
}

function drawStatIcon(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  box: Box,
  attack: boolean,
): void {
  const size = Math.min(box.width, box.height) * 0.62
  const x = ctx.left + box.x + (box.width - size) / 2
  const y = ctx.top - box.y - (box.height - size) / 2
  const color = attack
    ? parseColor(theme.accent).color
    : parseColor(theme.primaryLight).color

  if (!attack) {
    const shield =
      `M ${round(size * 0.5)} ${round(size * 0.08)} L ${round(size * 0.88)} ${round(size * 0.24)} ` +
      `V ${round(size * 0.52)} C ${round(size * 0.88)} ${round(size * 0.74)} ` +
      `${round(size * 0.7)} ${round(size * 0.88)} ${round(size * 0.5)} ${round(size * 0.92)} ` +
      `C ${round(size * 0.3)} ${round(size * 0.88)} ${round(size * 0.12)} ${round(size * 0.74)} ` +
      `${round(size * 0.12)} ${round(size * 0.52)} V ${round(size * 0.24)} Z`
    ctx.page.drawSvgPath(shield, { x, y, color })
    return
  }

  // Football (soccer ball), matching the web card icon (24 unit viewBox).
  const scale = size / 24
  const stroke = Math.max(0.5, 1.8 * scale)
  const centerX = x + 12 * scale
  const centerY = y - 12 * scale

  ctx.page.drawEllipse({
    x: centerX,
    y: centerY,
    xScale: 10 * scale,
    yScale: 10 * scale,
    borderColor: color,
    borderWidth: stroke,
  })

  const pentagon = 'M 12 7.8 L 15.99 10.7 L 14.47 15.4 H 9.53 L 8.01 10.7 Z'
  const seams =
    'M 12 2 L 12 7.8 M 21.51 8.91 L 15.99 10.7 M 17.88 20.09 L 14.47 15.4 ' +
    'M 6.12 20.09 L 9.53 15.4 M 2.49 8.91 L 8.01 10.7'

  ctx.page.drawSvgPath(pentagon, { x, y, scale, borderColor: color, borderWidth: stroke })
  ctx.page.drawSvgPath(seams, { x, y, scale, borderColor: color, borderWidth: stroke })
}

function drawAction(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  fonts: EmbeddedFonts,
  box: Box,
  padX: number,
  padY: number,
  labelSize: number,
  labelGap: number,
  action: { lines: string[]; size: number },
  labels: CardTextLabels,
): void {
  const borderColor = parseColor(theme.panelBorder)
  const accent = parseColor(theme.accent).color
  const ink = parseColor(theme.ink).color

  drawLocalRoundedRect(ctx, box, LAYOUT.actionRadius * ctx.width, {
    color: rgb(0, 0, 0),
    opacity: 0.3,
    borderColor: borderColor.color,
    borderOpacity: borderColor.opacity,
    borderWidth: Math.max(0.4, 0.0025 * ctx.width),
  })

  const label = normalizeForFont(fonts.bold, labels.action.toUpperCase())
  const labelBaseline = ctx.top - (box.y + padY) - labelSize * TEXT_ASCENT
  drawTrackedText(
    ctx,
    label,
    box.x + padX,
    labelBaseline,
    fonts.bold,
    labelSize,
    accent,
    1,
    LAYOUT.actionLabelTracking * labelSize,
  )

  let lineTop = box.y + padY + labelSize + labelGap
  const lineHeight = action.size * LAYOUT.actionLineHeight
  for (const line of action.lines) {
    drawLocalText(ctx, line, box.x + padX, lineTop, fonts.regular, action.size, ink)
    lineTop += lineHeight
  }
}

function formatStat(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 10) / 10)
}

/* ------------------------------------------------------------------ */
/* Small numeric helpers                                               */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
