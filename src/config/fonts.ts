/**
 * Card font registry.
 *
 * Bundled fonts (in `src/assets/fonts`) are discovered automatically and can
 * always be embedded in the PDF. After them, a curated list of fonts commonly
 * installed on Windows, macOS/iOS, Linux and Android is offered; those render
 * on screen when the user actually has them, and are embedded in the PDF when
 * the browser exposes the local font data (Chromium's Local Font Access API).
 */

const fontModules = import.meta.glob('/src/assets/fonts/*.{ttf,otf,woff,woff2}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

export type CardFontKind = 'bundled' | 'system'

export interface CardFontOption {
  /** Stable id used by settings; `system:<Family>` for system fonts. */
  id: string
  /** Human readable label for the dropdown. */
  label: string
  kind: CardFontKind
  /** CSS font-family name (same as the id for bundled fonts). */
  family: string
  /** Bundled asset URL (bundled fonts only). */
  url?: string
  /** CSS `format()` value for the @font-face rule (bundled fonts only). */
  format?: string
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

export const BUNDLED_CARD_FONTS: CardFontOption[] = Object.entries(fontModules)
  .map(([path, url]) => {
    const fileName = path.split('/').pop() ?? path
    const id = fileName.replace(/\.[^.]+$/, '')
    return {
      id,
      label: humanizeFontName(id),
      kind: 'bundled' as const,
      family: id,
      url,
      format: formatFor(extensionOf(fileName)),
      lettersOnly: /demo/i.test(id),
    }
  })
  .sort((a, b) => a.label.localeCompare(b.label))

/**
 * Common fonts shipped with (or available on) the major desktop and mobile
 * systems. Firefox, Safari and mobile browsers cannot enumerate local fonts,
 * so this static list is offered for everyone; selecting one shows it on
 * screen when installed.
 */
const SYSTEM_FONT_FAMILIES = [
  // Windows
  'Arial',
  'Arial Black',
  'Bahnschrift',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Franklin Gothic Medium',
  'Gabriola',
  'Georgia',
  'Impact',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Microsoft Sans Serif',
  'Palatino Linotype',
  'Segoe Print',
  'Segoe Script',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  // macOS / iOS
  'American Typewriter',
  'Apple Chancery',
  'Avenir',
  'Avenir Next',
  'Baskerville',
  'Bradley Hand',
  'Chalkboard',
  'Chalkboard SE',
  'Cochin',
  'Copperplate',
  'Didot',
  'Futura',
  'Gill Sans',
  'Helvetica',
  'Helvetica Neue',
  'Herculanum',
  'Hoefler Text',
  'Lucida Grande',
  'Marker Felt',
  'Menlo',
  'Monaco',
  'Optima',
  'Palatino',
  'Papyrus',
  'Savoye LET',
  'SF Pro Display',
  'SF Pro Text',
  'Skia',
  'Snell Roundhand',
  'Times',
  'Zapfino',
  // Linux
  'Cantarell',
  'DejaVu Sans',
  'DejaVu Sans Mono',
  'DejaVu Serif',
  'FreeMono',
  'FreeSans',
  'FreeSerif',
  'Liberation Mono',
  'Liberation Sans',
  'Liberation Serif',
  'Nimbus Roman',
  'Nimbus Sans',
  'Noto Sans',
  'Noto Serif',
  'Oxygen',
  'Ubuntu',
  'Ubuntu Condensed',
  // Android
  'Carrois Gothic',
  'Coming Soon',
  'Cutive Mono',
  'Dancing Script',
  'Droid Sans',
  'Droid Serif',
  'Roboto',
  'Roboto Condensed',
  'Roboto Mono',
] as const

const seenFamilies = new Set<string>()

export const SYSTEM_CARD_FONTS: CardFontOption[] = SYSTEM_FONT_FAMILIES.filter((family) => {
  const key = family.toLowerCase()
  if (seenFamilies.has(key)) return false
  seenFamilies.add(key)
  return true
})
  .map((family) => ({
    id: `system:${family}`,
    label: family,
    kind: 'system' as const,
    family,
    lettersOnly: false,
  }))
  .sort((a, b) => a.label.localeCompare(b.label))

/** Bundled fonts first, then the common system fonts. */
export const CARD_FONTS: CardFontOption[] = [...BUNDLED_CARD_FONTS, ...SYSTEM_CARD_FONTS]

export const DEFAULT_CARD_FONT_ID = (
  BUNDLED_CARD_FONTS.find((font) => font.id === 'GameOnlineDemoRegular') ??
  BUNDLED_CARD_FONTS[0]
)?.id ?? ''

export function isCardFontId(value: unknown): value is string {
  return typeof value === 'string' && CARD_FONTS.some((font) => font.id === value)
}

export function getCardFont(id: string): CardFontOption | undefined {
  return CARD_FONTS.find((font) => font.id === id)
}
