import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'

import { buildImagesZip, buildImagesZipFilename, downloadBlob } from '@/services/image/zipService'

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('buildImagesZip', () => {
  it('packs the images into a ZIP with unique file names', async () => {
    const blob = await buildImagesZip([
      { name: 'art.png', dataUrl: TINY_PNG_DATA_URL },
      { name: 'art.png', dataUrl: TINY_PNG_DATA_URL },
      { name: 'img1.jpeg', dataUrl: TINY_PNG_DATA_URL },
    ])

    expect(blob.size).toBeGreaterThan(0)

    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['art-1.png', 'art.png', 'img1.jpeg'])

    const bytes = await zip.files['art.png'].async('uint8array')
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('names the archive with the export date', () => {
    expect(buildImagesZipFilename(new Date(2026, 0, 5))).toBe('card-images-2026-01-05.zip')
  })
})

describe('downloadBlob', () => {
  it('downloads the blob and revokes the object URL', async () => {
    const blob = await buildImagesZip([{ name: 'art.png', dataUrl: TINY_PNG_DATA_URL }])

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const downloads: string[] = []

    URL.createObjectURL = vi.fn(() => 'blob:zip-1')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download)
    })

    try {
      downloadBlob(blob, 'card-images-2026-01-05.zip')

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
      expect(downloads).toEqual(['card-images-2026-01-05.zip'])
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:zip-1')
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      vi.restoreAllMocks()
    }
  })
})
