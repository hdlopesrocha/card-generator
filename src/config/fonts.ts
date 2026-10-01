/**
 * Card font registry.
 *
 * Every font placed in `src/assets/fonts` is discovered automatically and can
 * be selected for card text from the Settings page. The registry is also used
 * by the PDF renderer, so the on-screen card and the PDF always embed the
 * same font.
 */

const fontModules = import.meta.glob('/src/assets/fonts/*.{ttf,otf,woff,woff2}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

export interface CardFontOption {
  /** Stable id (file name without extension) used as the CSS family name. */
  id: string
  /** Human readable label for the dropdown. */
  label: string
  /** Bundled asset URL. */
  url: string
  /** CSS `format()` value for the @font-face rule. */
  format: string
  /**
   * Demo fonts only provide real glyphs for A-Z/a-z and replace digits,
   * punctuation and accented letters with a watermark. When true, everything
   * except letters falls back to the next font in the stack (web) or to the
   * standard PDF font (export).
   */
  lettersOnly: boolean
}

function extensionOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

function formatFor(extension: string): string {
  switch (extension) {
    case 'otf':
      return 'opentype'
    case 'woff':
      return 'woff'
    case 'woff2':
      return 'woff2'
    default:
      return 'truetype'
  }
}

function humanizeFontName(id: string): string {
  const spaced = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()

  return spaced.replace(/[-_ ]?(Regular|Bold|Italic)$/i, '').trim() || id
}

export const CARD_FONTS: CardFontOption[] = Object.entries(fontModules)
  .map(([path, url]) => {
    const fileName = path.split('/').pop() ?? path
    const id = fileName.replace(/\.[^.]+$/, '')
    return {
      id,
      label: humanizeFontName(id),
      url,
      format: formatFor(extensionOf(fileName)),
      lettersOnly: /demo/i.test(id),
    }
  })
  .sort((a, b) => a.label.localeCompare(b.label))

export const DEFAULT_CARD_FONT_ID = (
  CARD_FONTS.find((font) => font.id === 'GameOnlineDemoRegular') ?? CARD_FONTS[0]
)?.id ?? ''

export function isCardFontId(value: unknown): value is string {
  return typeof value === 'string' && CARD_FONTS.some((font) => font.id === value)
}

export function getCardFont(id: string): CardFontOption | undefined {
  return CARD_FONTS.find((font) => font.id === id)
}
