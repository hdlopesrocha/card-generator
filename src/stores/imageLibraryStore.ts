import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  getImageRepository,
  StorageUnavailableError,
  type StoredImage,
} from '@/services/storage/indexedDb'
import { fileToOptimizedDataUrl, validateImageFile } from '@/services/image/imageService'
import { useLanguageStore } from '@/stores/languageStore'
import { useSettingsStore } from '@/stores/settingsStore'

export interface ImageUploadResult {
  added: StoredImage[]
  failed: number
}

function createImageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Returns a name that does not collide with the given taken names. */
function uniqueName(name: string, taken: ReadonlySet<string>): string {
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

export const useImageLibraryStore = defineStore('images', () => {
  const images = ref<StoredImage[]>([])
  const loading = ref(false)
  const uploading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  const imageCount = computed(() => images.value.length)

  /** Lower-cased file name to data URL, used to resolve CSV image columns. */
  const imagesByName = computed(() => {
    const map = new Map<string, string>()
    for (const image of images.value) {
      map.set(image.name.toLowerCase(), image.dataUrl)
    }
    return map
  })

  async function loadImages(): Promise<void> {
    if (initialized.value) return

    const languageStore = useLanguageStore()
    loading.value = true
    error.value = null

    try {
      images.value = await getImageRepository().getAll()
      initialized.value = true
    } catch (caught) {
      console.error('Failed to load images from IndexedDB.', caught)
      error.value =
        caught instanceof StorageUnavailableError
          ? languageStore.t('store.storageUnavailable')
          : languageStore.t('store.imageLoadFailed')
    } finally {
      loading.value = false
    }
  }

  async function addImages(files: File[]): Promise<ImageUploadResult> {
    const languageStore = useLanguageStore()
    const settings = useSettingsStore()
    const repository = getImageRepository()
    const taken = new Set(images.value.map((image) => image.name.toLowerCase()))
    const added: StoredImage[] = []
    let failed = 0

    uploading.value = true
    error.value = null

    for (const file of files) {
      const validation = await validateImageFile(file, languageStore.language)
      if (!validation.valid) {
        failed += 1
        continue
      }

      try {
        const dataUrl = await fileToOptimizedDataUrl(file, { quality: settings.imageQuality })
        const name = uniqueName(file.name, taken)
        const image: StoredImage = {
          id: createImageId(),
          name,
          dataUrl,
          size: file.size,
          createdAt: new Date().toISOString(),
        }

        await repository.put(image)
        taken.add(name.toLowerCase())
        added.push(image)
      } catch (caught) {
        console.error('Failed to store an image.', caught)
        failed += 1
      }
    }

    if (added.length > 0) {
      images.value = [...images.value, ...added]
    }

    if (failed > 0) {
      error.value = languageStore.t('images.uploadFailed')
    }

    uploading.value = false
    return { added, failed }
  }

  /**
   * Stores an already optimized image (for example from the card editor) and
   * returns it with a unique file name. Cards use that name as their image
   * reference so CSV exports keep file names instead of image data.
   */
  async function addProcessedImage(input: {
    name: string
    dataUrl: string
    size: number
  }): Promise<StoredImage | null> {
    const languageStore = useLanguageStore()
    error.value = null

    try {
      await loadImages()

      const repository = getImageRepository()
      const taken = new Set(images.value.map((image) => image.name.toLowerCase()))
      const image: StoredImage = {
        id: createImageId(),
        name: uniqueName(input.name, taken),
        dataUrl: input.dataUrl,
        size: input.size,
        createdAt: new Date().toISOString(),
      }

      await repository.put(image)
      images.value = [...images.value, image]
      return image
    } catch (caught) {
      console.error('Failed to store an image.', caught)
      error.value =
        caught instanceof StorageUnavailableError
          ? languageStore.t('store.storageUnavailable')
          : languageStore.t('store.imageSaveFailed')
      return null
    }
  }

  async function deleteImage(id: string): Promise<boolean> {
    const languageStore = useLanguageStore()
    error.value = null

    try {
      await getImageRepository().delete(id)
      images.value = images.value.filter((image) => image.id !== id)
      return true
    } catch (caught) {
      console.error('Failed to delete an image.', caught)
      error.value =
        caught instanceof StorageUnavailableError
          ? languageStore.t('store.storageUnavailable')
          : languageStore.t('store.imageDeleteFailed')
      return false
    }
  }

  function getImageById(id: string): StoredImage | undefined {
    return images.value.find((image) => image.id === id)
  }

  function clearError(): void {
    error.value = null
  }

  return {
    images,
    loading,
    uploading,
    error,
    initialized,
    imageCount,
    imagesByName,
    loadImages,
    addImages,
    addProcessedImage,
    deleteImage,
    getImageById,
    clearError,
  }
})
