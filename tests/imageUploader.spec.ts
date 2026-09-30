import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/image/imageService', () => ({
  validateImageFile: vi.fn(async () => ({ valid: true })),
  fileToOptimizedDataUrl: vi.fn(
    async (file: File) => `data:image/jpeg;base64,${btoa(file.name)}`,
  ),
}))

import ImageUploader from '@/components/ImageUploader.vue'
import { getImageRepository } from '@/services/storage/indexedDb'
import { useImageLibraryStore } from '@/stores/imageLibraryStore'

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('ImageUploader', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await getImageRepository().clear()
  })

  it('registers the upload in the image library and emits the file name', async () => {
    const wrapper = mount(ImageUploader, { props: { modelValue: null } })

    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'hero.png', { type: 'image/png' })],
      configurable: true,
    })
    await input.trigger('change')
    await settle()

    const modelEmissions = wrapper.emitted('update:modelValue') ?? []
    expect(modelEmissions[0]?.[0]).toContain('data:image/jpeg;base64,')

    const refEmissions = wrapper.emitted('update:imageRef') ?? []
    expect(refEmissions[0]?.[0]).toBe('hero.png')

    const store = useImageLibraryStore()
    expect(store.images.map((image) => image.name)).toEqual(['hero.png'])
    await expect(getImageRepository().count()).resolves.toBe(1)
  })

  it('clears the image reference when the image is removed', async () => {
    const wrapper = mount(ImageUploader, {
      props: { modelValue: 'data:image/jpeg;base64,AAAA', imageRef: 'hero.png' },
    })

    const removeButton = wrapper
      .findAll('button')
      .find((button) => button.text().toLowerCase().includes('remove'))
    expect(removeButton).toBeDefined()
    await removeButton!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toBeNull()
    expect(wrapper.emitted('update:imageRef')?.[0]?.[0]).toBeNull()
  })
})
