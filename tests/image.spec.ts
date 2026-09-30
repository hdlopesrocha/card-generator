import { describe, expect, it } from 'vitest'

import {
  dataUrlToUint8Array,
  detectImageType,
  getDataUrlMimeType,
  isAcceptedExtension,
  validateImageFile,
} from '@/services/image/imageService'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const VALID_PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`
const MAX_SIZE_BYTES = 5 * 1024 * 1024

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function makeFile(filename: string, type: string, bytes: Uint8Array): File {
  return new File([bytes as BlobPart], filename, { type })
}

const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const WEBP_HEADER = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
const GARBAGE = Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])

describe('isAcceptedExtension', () => {
  it.each(['art.png', 'art.jpg', 'art.jpeg', 'art.webp'])('accepts %s', (filename) => {
    expect(isAcceptedExtension(filename)).toBe(true)
  })

  it('accepts uppercase extensions and trims the filename', () => {
    expect(isAcceptedExtension('  ART.PNG ')).toBe(true)
    expect(isAcceptedExtension('photo.WEBP')).toBe(true)
  })

  it.each(['art.gif', 'art.txt', 'art.exe', 'art.svg', 'art', 'art.png.exe'])('rejects %s', (filename) => {
    expect(isAcceptedExtension(filename)).toBe(false)
  })
})

describe('detectImageType', () => {
  it('detects PNG magic bytes', () => {
    expect(detectImageType(PNG_HEADER)).toBe('image/png')
  })

  it('detects JPEG magic bytes', () => {
    expect(detectImageType(JPEG_HEADER)).toBe('image/jpeg')
  })

  it('detects WebP magic bytes', () => {
    expect(detectImageType(WEBP_HEADER)).toBe('image/webp')
  })

  it('returns null for garbage and short input', () => {
    expect(detectImageType(GARBAGE)).toBeNull()
    expect(detectImageType(new Uint8Array([]))).toBeNull()
    expect(detectImageType(Uint8Array.from([0x89, 0x50]))).toBeNull()
  })
})

describe('validateImageFile', () => {
  it('accepts a small valid PNG file', async () => {
    const bytes = dataUrlToUint8Array(VALID_PNG_DATA_URL)
    const file = makeFile('art.png', 'image/png', bytes)

    await expect(validateImageFile(file)).resolves.toEqual({ valid: true })
  })

  it('accepts valid JPEG and WebP headers with matching name and MIME type', async () => {
    await expect(validateImageFile(makeFile('photo.jpg', 'image/jpeg', JPEG_HEADER))).resolves.toEqual({ valid: true })
    await expect(validateImageFile(makeFile('photo.webp', 'image/webp', WEBP_HEADER))).resolves.toEqual({ valid: true })
  })

  it('rejects an unsupported MIME type', async () => {
    const gif = makeFile('art.gif', 'image/gif', Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
    await expect(validateImageFile(gif)).resolves.toEqual({
      valid: false,
      error: 'The file is not a valid PNG, JPEG or WebP image.',
    })
  })

  it('rejects a file whose MIME type disagrees with an accepted extension', async () => {
    const lyingMime = makeFile('art.png', 'image/gif', PNG_HEADER)

    await expect(validateImageFile(lyingMime)).resolves.toEqual({
      valid: false,
      error: 'The file is not a valid PNG, JPEG or WebP image.',
    })
  })

  it('rejects a file whose extension and MIME type lie about the content', async () => {
    const fake = makeFile('fake.png', 'image/png', GARBAGE)

    await expect(validateImageFile(fake)).resolves.toEqual({
      valid: false,
      error: 'The file is not a valid PNG, JPEG or WebP image.',
    })
  })

  it('rejects an oversized file', async () => {
    const oversized = makeFile('big.png', 'image/png', new Uint8Array(MAX_SIZE_BYTES + 1))

    await expect(validateImageFile(oversized)).resolves.toEqual({
      valid: false,
      error: 'Image must be 5 MB or smaller.',
    })
  })

  it('accepts a PNG exactly at the size limit without reading past the header', async () => {
    const bytes = new Uint8Array(MAX_SIZE_BYTES)
    bytes.set(PNG_HEADER)

    await expect(validateImageFile(makeFile('limit.png', 'image/png', bytes))).resolves.toEqual({ valid: true })
  })
})

describe('dataUrlToUint8Array', () => {
  it('round-trips a PNG data URL', () => {
    const bytes = dataUrlToUint8Array(VALID_PNG_DATA_URL)

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(getDataUrlMimeType(VALID_PNG_DATA_URL)).toBe('image/png')
  })

  it('round-trips arbitrary bytes including padding', () => {
    const original = Uint8Array.from([1, 2, 3, 4, 253, 254, 255])
    const dataUrl = `data:image/jpeg;base64,${toBase64(original)}`

    expect(Array.from(dataUrlToUint8Array(dataUrl))).toEqual(Array.from(original))
  })

  it('ignores whitespace inside the base64 payload', () => {
    const original = Uint8Array.from([1, 2, 3, 4])
    const padded = `data:image/png;base64,AQID\nBA==`

    expect(Array.from(dataUrlToUint8Array(padded))).toEqual(Array.from(original))
  })

  it.each([
    ['a plain string', 'not a data url'],
    ['a data URL without base64 content', 'data:image/png;base64,'],
    ['a data URL without the base64 marker', 'data:image/png,AAAA'],
    ['non-base64 payload', 'data:image/png;base64,!!!!'],
  ])('throws on %s', (_label, input) => {
    expect(() => dataUrlToUint8Array(input)).toThrow('Invalid image data.')
  })

  it('throws when given a non-string value at runtime', () => {
    expect(() => dataUrlToUint8Array(null as unknown as string)).toThrow('Invalid image data.')
  })
})

describe('getDataUrlMimeType', () => {
  it.each([
    ['data:image/png;base64,AAAA', 'image/png'],
    ['data:image/jpeg;base64,AAAA', 'image/jpeg'],
    ['data:image/webp;base64,AAAA', 'image/webp'],
    ['DATA:IMAGE/PNG;base64,AAAA', 'image/png'],
  ])('returns the MIME type for %s', (dataUrl, expected) => {
    expect(getDataUrlMimeType(dataUrl)).toBe(expected)
  })

  it.each(['data:image/gif;base64,AAAA', 'data:text/plain;base64,AAAA', 'https://example.com/art.png', 'not-a-data-url'])(
    'returns null for %s',
    (dataUrl) => {
      expect(getDataUrlMimeType(dataUrl)).toBeNull()
    },
  )
})
