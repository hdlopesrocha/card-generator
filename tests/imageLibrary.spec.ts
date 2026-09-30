import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/image/imageService', () => ({
  validateImageFile: vi.fn(async () => ({ valid: true })),
  fileToOptimizedDataUrl: vi.fn(
    async (file: File) => `data:image/jpeg;base64,${btoa(file.name)}`,
  ),
}))

import { getImageRepository, IndexedDbImageRepository } from '@/services/storage/indexedDb'
import { useImageLibraryStore } from '@/stores/imageLibraryStore'
import { validateImageFile } from '@/services/image/imageService'

function uniqueDatabaseName(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function makeImage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'image-1',
    name: 'art.jpeg',
    dataUrl: 'data:image/jpeg;base64,AAAA',
    size: 1024,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('IndexedDbImageRepository', () => {
  let repository: IndexedDbImageRepository

  beforeEach(async () => {
    repository = new IndexedDbImageRepository(
      new IDBFactory(),
      uniqueDatabaseName('image-store'),
      2,
    )
    await repository.init()
  })

  it('stores, reads, updates and deletes images', async () => {
    await expect(repository.count()).resolves.toBe(0)

    const image = makeImage()
    await repository.put(image)
    await expect(repository.get('image-1')).resolves.toEqual(image)
    await expect(repository.getAll()).resolves.toEqual([image])

    await repository.put({ ...image, name: 'renamed.jpeg' })
    await expect(repository.get('image-1')).resolves.toMatchObject({ name: 'renamed.jpeg' })

    await repository.delete('image-1')
    await expect(repository.get('image-1')).resolves.toBeUndefined()
    await expect(repository.count()).resolves.toBe(0)
  })

  it('keeps the images store separate from cards', async () => {
    await repository.put(makeImage())
    await repository.put(makeImage({ id: 'image-2', name: 'other.jpeg' }))

    await expect(repository.count()).resolves.toBe(2)

    await repository.clear()
    await expect(repository.count()).resolves.toBe(0)
  })
})

describe('imageLibraryStore', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await getImageRepository().clear()
    vi.mocked(validateImageFile).mockResolvedValue({ valid: true })
  })

  it('loads, adds and deletes local images', async () => {
    const store = useImageLibraryStore()
    await store.loadImages()
    expect(store.imageCount).toBe(0)

    const result = await store.addImages([
      new File(['a'], 'art.png', { type: 'image/png' }),
      new File(['b'], 'photo.jpg', { type: 'image/jpeg' }),
    ])

    expect(result.added).toHaveLength(2)
    expect(result.failed).toBe(0)
    expect(store.imageCount).toBe(2)
    expect(store.images.map((image) => image.name)).toEqual(['art.png', 'photo.jpg'])
    expect(store.imagesByName.get('art.png')).toContain('data:image/jpeg;base64,')

    await expect(getImageRepository().count()).resolves.toBe(2)

    const deleted = await store.deleteImage(store.images[0].id)
    expect(deleted).toBe(true)
    expect(store.imageCount).toBe(1)
  })

  it('gives duplicate file names a unique suffix', async () => {
    const store = useImageLibraryStore()
    await store.loadImages()

    await store.addImages([new File(['a'], 'art.png', { type: 'image/png' })])
    await store.addImages([new File(['b'], 'art.png', { type: 'image/png' })])
    await store.addImages([new File(['c'], 'art.png', { type: 'image/png' })])

    expect(store.images.map((image) => image.name)).toEqual(['art.png', 'art-1.png', 'art-2.png'])
    expect(store.imagesByName.has('art-1.png')).toBe(true)
  })

  it('stores already processed images with unique names', async () => {
    const store = useImageLibraryStore()
    await store.loadImages()

    const dataUrl = 'data:image/jpeg;base64,AAAA'
    const first = await store.addProcessedImage({ name: 'art.png', dataUrl, size: 100 })
    const second = await store.addProcessedImage({ name: 'art.png', dataUrl, size: 100 })

    expect(first?.name).toBe('art.png')
    expect(second?.name).toBe('art-1.png')
    expect(store.imagesByName.get('art.png')).toBe(dataUrl)
    expect(store.imagesByName.get('art-1.png')).toBe(dataUrl)
    await expect(getImageRepository().count()).resolves.toBe(2)
  })

  it('counts invalid files as failures and keeps the rest', async () => {
    const store = useImageLibraryStore()
    await store.loadImages()

    vi.mocked(validateImageFile).mockResolvedValueOnce({
      valid: false,
      error: 'The file is not a valid PNG, JPEG or WebP image.',
    })

    const result = await store.addImages([
      new File(['bad'], 'bad.txt', { type: 'text/plain' }),
      new File(['good'], 'good.png', { type: 'image/png' }),
    ])

    expect(result.failed).toBe(1)
    expect(result.added).toHaveLength(1)
    expect(store.images.map((image) => image.name)).toEqual(['good.png'])
    expect(store.error).toBe('Some images could not be uploaded.')
  })
})
