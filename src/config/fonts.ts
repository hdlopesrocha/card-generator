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

export type SystemFontPlatform = 'windows' | 'apple' | 'linux' | 'android' | 'unknown'

/**
 * Common fonts shipped with (or available on) each platform. Firefox, Safari
 * and mobile browsers cannot enumerate local fonts, so these static lists are
 * used instead. Showing only the current platform's fonts keeps the picker
 * useful: most of them are actually installed, unlike fonts from other
 * systems, which the browser silently replaces with a substitute.
 */
const WINDOWS_FONT_FAMILIES = [
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
] as const

const APPLE_FONT_FAMILIES = [
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
] as const

const LINUX_FONT_FAMILIES = [
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
] as const

const ANDROID_FONT_FAMILIES = [
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

function dedupeFamilies(families: readonly string[]): string[] {
  const seen = new Set<string>()

  return families.filter((family) => {
    const key = family.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Every known system family, regardless of platform (id validation only). */
export const ALL_SYSTEM_FONT_FAMILIES: string[] = dedupeFamilies([
  ...WINDOWS_FONT_FAMILIES,
  ...APPLE_FONT_FAMILIES,
  ...LINUX_FONT_FAMILIES,
  ...ANDROID_FONT_FAMILIES,
])

function currentPlatformName(): string {
  if (typeof navigator === 'undefined') return ''

  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData
  return uaData?.platform ?? navigator.platform ?? ''
}

function currentUserAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent ?? ''
}

export function detectSystemFontPlatform(
  platform: string = currentPlatformName(),
  userAgent: string = currentUserAgent(),
): SystemFontPlatform {
  const name = platform.toLowerCase()
  const ua = userAgent.toLowerCase()

  if (name.includes('android') || ua.includes('android')) return 'android'
  if (/iphone|ipad|ipod/.test(name) || /iphone|ipad|ipod/.test(ua)) return 'apple'
  if (name.includes('mac') || ua.includes('macintosh') || ua.includes('mac os x')) return 'apple'
  if (name.includes('win') || ua.includes('windows')) return 'windows'
  if (
    name.includes('linux') ||
    name.includes('x11') ||
    name.includes('cros') ||
    name.includes('chrome os') ||
    ua.includes('linux') ||
    ua.includes('cros')
  ) {
    return 'linux'
  }

  return 'unknown'
}

export function systemFontFamiliesFor(platform: SystemFontPlatform): string[] {
  switch (platform) {
    case 'windows':
      return dedupeFamilies(WINDOWS_FONT_FAMILIES)
    case 'apple':
      return dedupeFamilies(APPLE_FONT_FAMILIES)
    case 'linux':
      return dedupeFamilies(LINUX_FONT_FAMILIES)
    case 'android':
      return dedupeFamilies(ANDROID_FONT_FAMILIES)
    default:
      return ALL_SYSTEM_FONT_FAMILIES
  }
}

function toSystemFontOption(family: string): CardFontOption {
  return {
    id: `system:${family}`,
    label: family,
    kind: 'system' as const,
    family,
    lettersOnly: false,
  }
}

/** System fonts offered for the platform the app is running on. */
export const SYSTEM_CARD_FONTS: CardFontOption[] = systemFontFamiliesFor(
  detectSystemFontPlatform(),
)
  .map(toSystemFontOption)
  .sort((a, b) => a.label.localeCompare(b.label))

const ALL_SYSTEM_CARD_FONTS = ALL_SYSTEM_FONT_FAMILIES.map(toSystemFontOption)

/** Bundled fonts first, then the platform's system fonts. */
export const CARD_FONTS: CardFontOption[] = [...BUNDLED_CARD_FONTS, ...SYSTEM_CARD_FONTS]

/** Bundled fonts plus every known system font, used to validate ids. */
const KNOWN_CARD_FONTS: CardFontOption[] = [...BUNDLED_CARD_FONTS, ...ALL_SYSTEM_CARD_FONTS]

export const DEFAULT_CARD_FONT_ID = (
  BUNDLED_CARD_FONTS.find((font) => font.id === 'GameOnlineDemoRegular') ??
  BUNDLED_CARD_FONTS[0]
)?.id ?? ''

export function isCardFontId(value: unknown): value is string {
  return typeof value === 'string' && KNOWN_CARD_FONTS.some((font) => font.id === value)
}

export function getCardFont(id: string): CardFontOption | undefined {
  return KNOWN_CARD_FONTS.find((font) => font.id === id)
}
