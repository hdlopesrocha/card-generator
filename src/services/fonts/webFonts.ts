import { CARD_FONTS, getCardFont } from '@/config/fonts'

/**
 * Registers every bundled card font as an @font-face rule. Demo fonts are
 * limited to letters with `unicode-range`, so digits, punctuation and
 * accented characters automatically fall back to the next family in the
 * card font stack.
 */

const STYLE_ELEMENT_ID = 'card-font-faces'
const LETTER_UNICODE_RANGE = 'U+0041-005A, U+0061-007A'
const FALLBACK_FAMILIES =
  "'Segoe UI Semibold', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"

export function ensureCardFontFaces(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ELEMENT_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = CARD_FONTS.map((font) => {
    const range = font.lettersOnly ? `\n  unicode-range: ${LETTER_UNICODE_RANGE};` : ''
    return `@font-face {
  font-family: '${font.id}';
  src: url('${font.url}') format('${font.format}');
  font-weight: 400;
  font-style: normal;
  font-display: swap;${range}
}`
  }).join('\n\n')

  document.head.appendChild(style)
}

/** CSS font-family value for the selected card font, including fallbacks. */
export function cardFontFamily(id: string): string {
  const font = getCardFont(id)
  const families = font ? `'${font.id}', ` : ''
  return `${families}${FALLBACK_FAMILIES}`
}
