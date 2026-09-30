import JSZip from 'jszip'

import { dataUrlToUint8Array } from '@/services/image/imageService'
import { formatDate } from '@/utils/filename'

export interface ZipImageEntry {
  name: string
  dataUrl: string
}

/** Appends a numeric suffix when an entry name is already taken. */
function uniqueEntryName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name

  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''

  let counter = 1
  let candidate = `${base}-${counter}${extension}`
  while (taken.has(candidate.toLowerCase())) {
    counter += 1
    candidate = `${base}-${counter}${extension}`
  }

  return candidate
}

/** Builds a ZIP archive containing every provided image. */
export async function buildImagesZip(images: ZipImageEntry[]): Promise<Blob> {
  const zip = new JSZip()
  const taken = new Set<string>()

  for (const image of images) {
    const name = uniqueEntryName(image.name, taken)
    zip.file(name, dataUrlToUint8Array(image.dataUrl))
    taken.add(name.toLowerCase())
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export function buildImagesZipFilename(date: Date = new Date()): string {
  return `card-images-${formatDate(date)}.zip`
}

/** Triggers a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return

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
