import { IMAGE_CONSTRAINTS, IMAGE_QUALITY } from '@/config/constants'
import { translate } from '@/config/languages'
import type { Language } from '@/models/Language'

export interface ImageValidation {
  valid: boolean
  error?: string
}

type SupportedImageType = 'image/png' | 'image/jpeg' | 'image/webp'

const SUPPORTED_IMAGE_TYPES: readonly SupportedImageType[] = ['image/png', 'image/jpeg', 'image/webp']

const READ_ERROR = translate('error.imageRead', 'EN')

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

export function isAcceptedExtension(filename: string): boolean {
  const normalizedName = filename.trim().toLowerCase()
  return IMAGE_CONSTRAINTS.acceptedExtensions.some((extension) => normalizedName.endsWith(extension))
}

export function detectImageType(bytes: Uint8Array): SupportedImageType | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

export async function validateImageFile(
  file: File,
  language: Language = 'EN',
): Promise<ImageValidation> {
  if (file.size === 0 || file.size > IMAGE_CONSTRAINTS.maxSizeBytes) {
    return { valid: false, error: translate('error.imageSize', language) }
  }

  if (!isAcceptedExtension(file.name) || !isAcceptedMimeType(file.type)) {
    return { valid: false, error: translate('error.imageType', language) }
  }

  let header: Uint8Array
  try {
    header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  } catch {
    return { valid: false, error: translate('error.imageReadBytes', language) }
  }

  if (detectImageType(header) === null) {
    return { valid: false, error: translate('error.imageType', language) }
  }

  return { valid: true }
}

export async function fileToOptimizedDataUrl(
  file: File,
  options?: { maxDimensionPx?: number; quality?: number },
): Promise<string> {
  const maxDimensionPx = options?.maxDimensionPx ?? IMAGE_CONSTRAINTS.maxDimensionPx
  const quality = clamp(options?.quality ?? IMAGE_QUALITY.default, IMAGE_QUALITY.min, IMAGE_QUALITY.max)

  const image = await decodeImage(file)

  try {
    const largestEdge = Math.max(image.width, image.height)
    const scale = largestEdge > maxDimensionPx ? maxDimensionPx / largestEdge : 1
    const targetWidth = Math.max(1, Math.round(image.width * scale))
    const targetHeight = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const context = canvas.getContext('2d')
    if (!context) throw new Error(READ_ERROR)

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.drawImage(image.source, 0, 0, targetWidth, targetHeight)

    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (!dataUrl.startsWith('data:image/jpeg')) throw new Error(READ_ERROR)

    return dataUrl
  } finally {
    image.release()
  }
}

export function dataUrlToUint8Array(dataUrl: string, language: Language = 'EN'): Uint8Array {
  const invalidData = (): Error => new Error(translate('error.imageInvalidData', language))

  if (typeof dataUrl !== 'string') throw invalidData()

  const markerIndex = dataUrl.indexOf(';base64,')
  if (!dataUrl.startsWith('data:') || markerIndex < 0) throw invalidData()

  const base64 = dataUrl.slice(markerIndex + ';base64,'.length).replace(/\s+/g, '')
  const paddingLength = (4 - (base64.length % 4)) % 4
  if (base64.length === 0 || paddingLength === 3) throw invalidData()

  let binary: string
  try {
    binary = atob(base64 + '='.repeat(paddingLength))
  } catch {
    throw invalidData()
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function getDataUrlMimeType(dataUrl: string): string | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,/i.exec(dataUrl)
  return match ? match[1].toLowerCase() : null
}

function isAcceptedMimeType(mimeType: string): boolean {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType.toLowerCase())
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      return decodeWithImageElement(file)
    }
  }

  return decodeWithImageElement(file)
}

function decodeWithImageElement(file: File): Promise<DecodedImage> {
  return new Promise<DecodedImage>((resolve, reject) => {
    let objectUrl: string
    try {
      objectUrl = URL.createObjectURL(file)
    } catch {
      reject(new Error(READ_ERROR))
      return
    }

    const image = new Image()

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      URL.revokeObjectURL(objectUrl)
    }

    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      cleanup()
      resolve({
        source: image,
        width,
        height,
        release: () => undefined,
      })
    }

    image.onerror = () => {
      cleanup()
      reject(new Error(READ_ERROR))
    }

    image.src = objectUrl
  })
}
