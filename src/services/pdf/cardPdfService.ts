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

import { CARD_FONT_SCALE, PDF_CONSTANTS } from '@/config/constants'
import { getCardFont } from '@/config/fonts'
import { getCardTextLabels, translate, type CardTextLabels } from '@/config/languages'
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
  /** Multiplier applied to every card text size (1 = 100%). */
  fontScale?: number
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
  const fontScale = resolveFontScale(options.fontScale)

  const document = await PDFDocument.create()
  const fonts = await embedCardFonts(document, options.fontId)
  const artworkShades: ArtworkShades = {
    top: await document.embedPng(dataUrlToUint8Array(ARTWORK_SHADE_TOP_PNG)),
    bottom: await document.embedPng(dataUrlToUint8Array(ARTWORK_SHADE_BOTTOM_PNG)),
  }

  for (const card of cards) {
    const localizedCard = getLocalizedCard(card, language)
    const page = document.addPage([cardWidth, cardHeight])
    const image = await embedArtwork(document, localizedCard)
    drawCard(
      page,
      localizedCard,
      0,
      cardHeight,
      cardWidth,
      cardHeight,
      fonts,
      image,
      language,
      artworkShades,
      fontScale,
    )
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

function resolveFontScale(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return CARD_FONT_SCALE.default

  return Math.min(CARD_FONT_SCALE.max, Math.max(CARD_FONT_SCALE.min, value))
}

/* ------------------------------------------------------------------ */
/* Layout ratios (fractions of the card width, mirrored from card.css) */
/* ------------------------------------------------------------------ */

const LAYOUT = {
  frameInset: 0.024,
  frameRadius: 0.028,
  framePadding: 0.034,
  headerGap: 0.02,
  titlePadX: 0.022,
  titlePadY: 0.015,
  titleRadius: 0.018,
  titleSize: 0.076,
  titleLineHeight: 1.05,
  headingGap: 0.012,
  subtitlePadX: 0.022,
  subtitlePadY: 0.01,
  subtitleRadius: 0.014,
  subtitleSize: 0.037,
  subtitleTracking: 0.1,
  subtitleLineHeight: 1.4,
  counterMinWidth: 0.13,
  counterPadX: 0.018,
  counterPadY: 0.014,
  counterRadius: 0.02,
  counterValueSize: 0.082,
  counterLabelSize: 0.029,
  counterLabelTracking: 0.18,
  counterGap: 0.004,
  footerGap: 0.02,
  starsPadX: 0.016,
  starsPadY: 0.014,
  starsRadius: 0.02,
  starGap: 0.006,
  actionPadX: 0.026,
  actionPadY: 0.02,
  actionRadius: 0.02,
  actionLabelSize: 0.029,
  actionLabelTracking: 0.24,
  actionLabelGap: 0.007,
  actionTextSize: 0.042,
  actionLineHeight: 1.25,
  actionMaxLines: 6,
  starRadius: 0.024,
}

const CONTENT_INSET = LAYOUT.frameInset + LAYOUT.framePadding
const REFERENCE_ASPECT = 1.4
const REFERENCE_CONTENT_RATIO = REFERENCE_ASPECT - CONTENT_INSET * 2
const TEXT_ASCENT = 0.72
const MIN_ACTION_FONT_SIZE = 4.5
const GRADIENT_BANDS = 40
const BEZIER_CIRCLE = 0.5522847498307936
const CARD_BOTTOM_COLOR = '#05070d'
const CARD_SURFACE_COLOR = '#ffffff'

/**
 * Sum of every vertical section at full scale. Used to compute the global
 * vertical scale so short/wide cards never overflow their frame. The artwork
 * is a full-bleed background here, so only the header and footer count.
 */
const TITLE_WORST_LINES = 4

const WORST_CONTENT_RATIO =
  Math.max(
    LAYOUT.counterPadY * 2 + LAYOUT.counterValueSize + LAYOUT.counterGap + LAYOUT.counterLabelSize,
    LAYOUT.titlePadY * 2 +
      TITLE_WORST_LINES * LAYOUT.titleSize * LAYOUT.titleLineHeight +
      LAYOUT.headingGap +
      LAYOUT.subtitlePadY * 2 +
      LAYOUT.subtitleSize * LAYOUT.subtitleLineHeight,
  ) +
  Math.max(
    LAYOUT.starsPadY * 2 + 3 * LAYOUT.starRadius * 1.81 + LAYOUT.starGap * 2,
    LAYOUT.actionPadY * 2 +
      LAYOUT.actionLabelSize +
      LAYOUT.actionLabelGap +
      LAYOUT.actionMaxLines * LAYOUT.actionTextSize * LAYOUT.actionLineHeight,
  )

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

/** Top and bottom readability gradients for the full-bleed artwork. */
interface ArtworkShades {
  top: PDFImage
  bottom: PDFImage
}

interface CardRenderContext {
  page: PDFPage
  /** Page x of the card's left edge. */
  left: number
  /** Page y of the card's top edge. */
  top: number
  width: number
  height: number
  /** Multiplier applied to every card text size (1 = 100%). */
  fontScale: number
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
  shades: ArtworkShades,
  fontScale: number,
): void {
  const theme = getZoneTheme(card.zone)
  const labels = getCardTextLabels(language)
  const contentRatio = height / width - CONTENT_INSET * 2
  const vScale = clamp(contentRatio / WORST_CONTENT_RATIO, 0.3, 1)
  const ctx: CardRenderContext = { page, left, top, width, height, fontScale: vScale * fontScale }

  drawCardBackground(ctx, theme)
  drawArtworkFullBleed(ctx, theme, frameBox(ctx), image, card, fonts, labels, shades)

  const contentX = CONTENT_INSET * width
  const contentTop = CONTENT_INSET * width
  const contentWidth = width - contentX * 2
  const contentBottom = height - CONTENT_INSET * width

  const headerBottom = drawHeader(ctx, theme, fonts, labels, card, contentX, contentTop, contentWidth)
  drawFooter(ctx, theme, fonts, labels, card, contentX, headerBottom, contentBottom, contentWidth)

  // Frame border and corner ticks sit on top of the artwork and the content.
  drawCardFrame(ctx, theme)
}

/** The frame box shared by the background, the artwork and the chrome. */
function frameBox(ctx: CardRenderContext): Box {
  const inset = LAYOUT.frameInset * ctx.width
  return {
    x: inset,
    y: inset,
    width: ctx.width - inset * 2,
    height: ctx.height - inset * 2,
  }
}

/** Attack/defense counter colours (universal, independent of the zone). */
const COUNTER_ATTACK_FILL = '#e0352b'
const COUNTER_DEFENSE_FILL = '#2563eb'
const COUNTER_BORDER = 'rgba(255, 255, 255, 0.34)'
const SUBTITLE_INK = '#131722'

function drawCounter(
  ctx: CardRenderContext,
  box: Box,
  fill: RGB,
  value: string,
  label: string,
  fonts: EmbeddedFonts,
  valueSize: number,
  labelSize: number,
  labelTracking: number,
): void {
  const border = parseColor(COUNTER_BORDER)
  drawLocalRoundedRect(ctx, box, LAYOUT.counterRadius * ctx.width, {
    color: fill,
    opacity: 1,
    borderColor: border.color,
    borderOpacity: border.opacity,
    borderWidth: Math.max(0.4, 0.0025 * ctx.width),
  })

  const valueWidth = measure(fonts.bold, value, valueSize)
  const labelWidth = trackedTextWidth(fonts.bold, label, labelSize, labelTracking)
  const innerHeight = box.height - LAYOUT.counterPadY * ctx.width * 2
  const textHeight = valueSize + LAYOUT.counterGap * ctx.width + labelSize
  const valueTop = box.y + LAYOUT.counterPadY * ctx.width + Math.max(0, (innerHeight - textHeight) / 2)

  drawLocalText(
    ctx,
    value,
    box.x + (box.width - valueWidth) / 2,
    valueTop,
    fonts.bold,
    valueSize,
    rgb(1, 1, 1),
  )

  const labelBaseline =
    ctx.top - (valueTop + valueSize + LAYOUT.counterGap * ctx.width) - labelSize * TEXT_ASCENT
  drawTrackedText(
    ctx,
    label,
    box.x + (box.width - labelWidth) / 2,
    labelBaseline,
    fonts.bold,
    labelSize,
    rgb(1, 1, 1),
    0.92,
    labelTracking,
  )
}

/**
 * Header overlay: attack counter, title banner (grows with the title) and
 * optional subtitle plate, defense counter. Returns the bottom edge.
 */
function drawHeader(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  fonts: EmbeddedFonts,
  labels: CardTextLabels,
  card: Card,
  contentX: number,
  contentTop: number,
  contentWidth: number,
): number {
  const { width, fontScale } = ctx
  const valueSize = LAYOUT.counterValueSize * width * fontScale
  const counterLabelSize = LAYOUT.counterLabelSize * width * fontScale
  const counterTracking = LAYOUT.counterLabelTracking * counterLabelSize
  const padX = LAYOUT.counterPadX * width
  const padY = LAYOUT.counterPadY * width

  const atkValue = normalizeForFont(fonts.bold, formatStat(card.attack))
  const defValue = normalizeForFont(fonts.bold, formatStat(card.defense))
  const atkLabel = normalizeForFont(fonts.bold, labels.attack.toUpperCase())
  const defLabel = normalizeForFont(fonts.bold, labels.defense.toUpperCase())

  const atkW =
    Math.max(
      LAYOUT.counterMinWidth * width,
      measure(fonts.bold, atkValue, valueSize),
      trackedTextWidth(fonts.bold, atkLabel, counterLabelSize, counterTracking),
    ) + padX * 2
  const defW =
    Math.max(
      LAYOUT.counterMinWidth * width,
      measure(fonts.bold, defValue, valueSize),
      trackedTextWidth(fonts.bold, defLabel, counterLabelSize, counterTracking),
    ) + padX * 2
  const counterH = padY * 2 + valueSize + LAYOUT.counterGap * width + counterLabelSize

  drawCounter(
    ctx,
    { x: contentX, y: contentTop, width: atkW, height: counterH },
    parseColor(COUNTER_ATTACK_FILL).color,
    atkValue,
    atkLabel,
    fonts,
    valueSize,
    counterLabelSize,
    counterTracking,
  )
  drawCounter(
    ctx,
    { x: contentX + contentWidth - defW, y: contentTop, width: defW, height: counterH },
    parseColor(COUNTER_DEFENSE_FILL).color,
    defValue,
    defLabel,
    fonts,
    valueSize,
    counterLabelSize,
    counterTracking,
  )

  const gap = LAYOUT.headerGap * width
  const titleX = contentX + atkW + gap
  const titleW = Math.max(1, contentWidth - atkW - defW - gap * 2)
  const titleSize = LAYOUT.titleSize * width * fontScale
  const titleInner = Math.max(1, titleW - LAYOUT.titlePadX * width * 2)
  const titleText = card.title.trim() ? card.title : labels.untitled
  const titleLines = wrapText(titleText, fonts.bold, titleSize, titleInner)
  const bannerH = LAYOUT.titlePadY * width * 2 + titleLines.length * titleSize * LAYOUT.titleLineHeight

  const primary = parseColor(theme.primary)
  const lightBorder = parseColor(theme.primaryLight)
  drawLocalRoundedRect(
    ctx,
    { x: titleX, y: contentTop, width: titleW, height: bannerH },
    LAYOUT.titleRadius * width,
    {
      color: primary.color,
      opacity: 1,
      borderColor: lightBorder.color,
      borderOpacity: lightBorder.opacity * 0.6,
      borderWidth: Math.max(0.4, 0.0025 * width),
    },
  )

  let lineTop = contentTop + LAYOUT.titlePadY * width
  for (const line of titleLines) {
    const lineWidth = measure(fonts.bold, line, titleSize)
    drawLocalText(
      ctx,
      line,
      titleX + (titleW - lineWidth) / 2,
      lineTop,
      fonts.bold,
      titleSize,
      rgb(1, 1, 1),
    )
    lineTop += titleSize * LAYOUT.titleLineHeight
  }

  let headingH = bannerH
  if (card.subtitle) {
    const subSize = LAYOUT.subtitleSize * width * fontScale
    const subTracking = LAYOUT.subtitleTracking * subSize
    const subLines = wrapText(card.subtitle.toUpperCase(), fonts.bold, subSize, titleInner)
    const plateY = contentTop + bannerH + LAYOUT.headingGap * width
    const plateH = LAYOUT.subtitlePadY * width * 2 + subLines.length * subSize * LAYOUT.subtitleLineHeight
    drawLocalRoundedRect(
      ctx,
      { x: titleX, y: plateY, width: titleW, height: plateH },
      LAYOUT.subtitleRadius * width,
      { color: rgb(1, 1, 1), opacity: 0.94 },
    )

    const ink = parseColor(SUBTITLE_INK).color
    let subTop = plateY + LAYOUT.subtitlePadY * width
    for (const line of subLines) {
      const lineWidth = trackedTextWidth(fonts.bold, line, subSize, subTracking)
      const baseline = ctx.top - subTop - subSize * TEXT_ASCENT
      drawTrackedText(
        ctx,
        line,
        titleX + (titleW - lineWidth) / 2,
        baseline,
        fonts.bold,
        subSize,
        ink,
        1,
        subTracking,
      )
      subTop += subSize * LAYOUT.subtitleLineHeight
    }
    headingH = bannerH + LAYOUT.headingGap * width + plateH
  }

  return contentTop + Math.max(counterH, headingH)
}

/**
 * Footer overlay anchored to the bottom: star column on the left, action
 * banner filling the rest. The action text shrinks to the available space so
 * it never escapes the frame.
 */
function drawFooter(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  fonts: EmbeddedFonts,
  labels: CardTextLabels,
  card: Card,
  contentX: number,
  headerBottom: number,
  contentBottom: number,
  contentWidth: number,
): void {
  const { width, fontScale } = ctx
  const starScale = LAYOUT.starRadius * width * fontScale
  const starGap = LAYOUT.starGap * width
  const starW = starScale * 1.9
  const starH = starScale * 1.81
  const starsPadX = LAYOUT.starsPadX * width
  const starsPadY = LAYOUT.starsPadY * width
  const starsW = starsPadX * 2 + starW
  const starsH = starsPadY * 2 + starH * 3 + starGap * 2

  const actionLabelSize = LAYOUT.actionLabelSize * width * fontScale
  const actionPadX = LAYOUT.actionPadX * width
  const actionPadY = LAYOUT.actionPadY * width
  const footerGap = LAYOUT.footerGap * width

  const available = Math.max(1, contentBottom - headerBottom - footerGap)
  const actionInnerW = Math.max(1, contentWidth - starsW - footerGap - actionPadX * 2)
  const maxActionInnerH = Math.max(
    1,
    available - actionPadY * 2 - actionLabelSize - LAYOUT.actionLabelGap * width,
  )
  const action = fitActionLines(
    card.action.toUpperCase(),
    fonts.bold,
    actionInnerW,
    maxActionInnerH,
    LAYOUT.actionTextSize * width * fontScale,
  )
  const actionH =
    actionPadY * 2 +
    actionLabelSize +
    LAYOUT.actionLabelGap * width +
    action.lines.length * action.size * LAYOUT.actionLineHeight

  const footerH = Math.max(starsH, actionH)
  const footerTop = contentBottom - footerH
  const actionX = contentX + starsW + footerGap
  const actionW = contentWidth - starsW - footerGap

  const border = parseColor(theme.panelBorder)
  drawLocalRoundedRect(
    ctx,
    { x: contentX, y: footerTop, width: starsW, height: footerH },
    LAYOUT.starsRadius * width,
    {
      color: rgb(0, 0, 0),
      opacity: 0.35,
      borderColor: border.color,
      borderOpacity: border.opacity,
      borderWidth: Math.max(0.4, 0.0025 * width),
    },
  )

  const filledColor = parseColor(theme.accent).color
  const starsTotalH = starH * 3 + starGap * 2
  const starsTop = footerTop + (footerH - starsTotalH) / 2
  const totalStars = normalizeStars(card.stars)
  for (let index = 0; index < 3; index += 1) {
    const centerX = ctx.left + contentX + starsW / 2
    // The star path spans -1..0.809 vertically; offset by -starScale so the
    // top vertex lands exactly on the slot top.
    const originY = ctx.top - (starsTop + index * (starH + starGap)) - starScale
    const filled = index < totalStars
    ctx.page.drawSvgPath(STAR_PATH, {
      x: centerX,
      y: originY,
      scale: starScale,
      color: filled ? filledColor : rgb(1, 1, 1),
      opacity: filled ? 1 : 0.16,
    })
  }

  const zone = parseColor(theme.primary)
  const zoneDark = parseColor(theme.primaryDark)
  drawLocalRoundedRect(
    ctx,
    { x: actionX, y: footerTop, width: actionW, height: footerH },
    LAYOUT.actionRadius * width,
    {
      color: rgb(1, 1, 1),
      opacity: 0.95,
      borderColor: zone.color,
      borderOpacity: 1,
      borderWidth: 1.5,
    },
  )

  const actionLabel = normalizeForFont(fonts.bold, labels.action.toUpperCase())
  const actionLabelTracking = LAYOUT.actionLabelTracking * actionLabelSize
  const labelBaseline = ctx.top - (footerTop + actionPadY) - actionLabelSize * TEXT_ASCENT
  drawTrackedText(
    ctx,
    actionLabel,
    actionX + actionPadX,
    labelBaseline,
    fonts.bold,
    actionLabelSize,
    zoneDark.color,
    1,
    actionLabelTracking,
  )

  let lineTop = footerTop + actionPadY + actionLabelSize + LAYOUT.actionLabelGap * width
  const lineHeight = action.size * LAYOUT.actionLineHeight
  for (const line of action.lines) {
    drawLocalText(ctx, line, actionX + actionPadX, lineTop, fonts.bold, action.size, zoneDark.color)
    lineTop += lineHeight
  }
}

/** Unit five-point star centred at (0,0) in SVG coordinates (points up). */
const STAR_PATH =
  'M 0 -1 L 0.2245 -0.309 L 0.9511 -0.309 L 0.3633 0.118 L 0.5878 0.809 L 0 0.382 L -0.5878 0.809 L -0.3633 0.118 L -0.9511 -0.309 L -0.2245 -0.309 Z'

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
  const frame = frameBox(ctx)
  const radius = LAYOUT.frameRadius * ctx.width

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

/**
 * Full-bleed artwork: the image fills the whole frame and paints underneath
 * the header and footer overlays, like the web card. The top and bottom
 * gradients keep the overlaid text readable.
 */
function drawArtworkFullBleed(
  ctx: CardRenderContext,
  theme: ZoneTheme,
  frame: Box,
  image: PDFImage | null,
  card: Card,
  fonts: EmbeddedFonts,
  labels: CardTextLabels,
  shades: ArtworkShades,
): void {
  const radius = LAYOUT.frameRadius * ctx.width
  const pdfFrame = toPdfBox(ctx, frame)
  pushRoundedRectClip(ctx.page, pdfFrame.x, pdfFrame.y, pdfFrame.width, pdfFrame.height, radius)

  if (image && image.width > 0 && image.height > 0) {
    drawArtworkImage(ctx, image, frame)
  } else {
    drawArtworkPlaceholder(ctx, theme, frame, card, fonts, labels)
  }
  drawArtworkShades(ctx, frame, shades)

  popClip(ctx.page)
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

/**
 * 1x256 black gradients drawn over the full-bleed artwork so the overlaid
 * text stays readable. The top ramp goes from 0.55 to transparent, the
 * bottom ramp from transparent to 0.62, matching the web card glow.
 */
const ARTWORK_SHADE_TOP_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAEACAYAAAByPhyYAAAAN0lEQVQ4y+3OwQoAEBQF0cP3++dnpyxYIcVu6t6agZIhI3qK0TCnfefHHSfSrgv6ju9YeIbUSAWwJYv+e2lm2QAAAABJRU5ErkJggg=='

const ARTWORK_SHADE_BOTTOM_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAEACAYAAAByPhyYAAAALElEQVQ4y2NggAJGJgYGBgYmTBZ+LsXq6GbRoHPQqM8HjbrhZ9Ggc9Ag9TkAfx4Cm2kqR2EAAAAASUVORK5CYII='

/** Top and bottom readability gradients over the full-bleed artwork. */
function drawArtworkShades(ctx: CardRenderContext, frame: Box, shades: ArtworkShades): void {
  const topHeight = frame.height * 0.38
  ctx.page.drawImage(shades.top, {
    x: ctx.left + frame.x,
    y: ctx.top - frame.y - topHeight,
    width: frame.width,
    height: topHeight,
  })

  const bottomHeight = frame.height * 0.46
  ctx.page.drawImage(shades.bottom, {
    x: ctx.left + frame.x,
    y: ctx.top - frame.y - frame.height,
    width: frame.width,
    height: bottomHeight,
  })
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
  const light = parseColor(theme.primaryLight).color

  // Vertical gradient from the zone deep colour to black, matching the web
  // placeholder without visible radial rings.
  const bottom = rgb(0, 0, 0)
  const bandHeight = box.height / GRADIENT_BANDS
  for (let index = 0; index < GRADIENT_BANDS; index += 1) {
    const t = index / (GRADIENT_BANDS - 1)
    drawLocalRect(
      ctx,
      { x: box.x, y: box.y + index * bandHeight, width: box.width, height: bandHeight + 0.3 },
      mixColors(deep, bottom, t * 0.9),
      1,
    )
  }

  const initialText = normalizeForFont(
    fonts.bold,
    (card.title.trim().charAt(0) || '?').toUpperCase(),
  )
  const labelText = normalizeForFont(fonts.bold, labels.noArtwork.toUpperCase())
  const initialSize = box.width * 0.24 * ctx.fontScale
  const labelSize = box.width * 0.032 * ctx.fontScale
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
