import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/image/bundledImages', () => ({
  getBundledImageNames: () => ['img1.jpeg', 'img2.jpeg', 'img3.jpeg'],
  resolveBundledImage: async (name: string) => `data:image/jpeg;base64,${btoa(name)}`,
  resolveBundledImagesInText: async () => new Map(),
}))

vi.mock('@/services/image/imageService', () => ({
  validateImageFile: vi.fn(async () => ({ valid: true })),
  fileToOptimizedDataUrl: vi.fn(
    async (file: File) => `data:image/jpeg;base64,${btoa(file.name)}`,
  ),
}))

import ImageView from '@/views/ImageView.vue'
import { getImageRepository } from '@/services/storage/indexedDb'
import { useImageLibraryStore } from '@/stores/imageLibraryStore'

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('ImageView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await getImageRepository().clear()
  })

  it('lists bundled sample images and uploads multiple local files', async () => {
    const wrapper = mount(ImageView, { global: { plugins: [] } })
    await settle()

    const text = wrapper.text()
    expect(text).toContain('Sample images')
    expect(text).toContain('img1.jpeg')
    expect(text).toContain('img2.jpeg')
    expect(text).toContain('img3.jpeg')

    const store = useImageLibraryStore()
    expect(store.imageCount).toBe(0)
    expect(text).toContain('No images uploaded yet.')

    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [
        new File(['a'], 'hero.png', { type: 'image/png' }),
        new File(['b'], 'villain.jpg', { type: 'image/jpeg' }),
      ],
      configurable: true,
    })
    await input.trigger('change')
    await settle()

    expect(store.imageCount).toBe(2)
    expect(wrapper.text()).toContain('hero.png')
    expect(wrapper.text()).toContain('villain.jpg')
    expect(wrapper.text()).toContain('Added 2 image(s).')
  })

  it('deletes an uploaded image after confirmation', async () => {
    const store = useImageLibraryStore()
    await store.loadImages()
    await store.addImages([new File(['a'], 'hero.png', { type: 'image/png' })])

    const wrapper = mount(ImageView, { global: { plugins: [] } })
    await settle()

    expect(wrapper.text()).toContain('hero.png')

    const deleteButton = wrapper
      .findAll('button')
      .find((button) => (button.attributes('aria-label') ?? '').startsWith('Delete:'))
    expect(deleteButton).toBeDefined()
    await deleteButton!.trigger('click')
    await settle()

    expect(document.body.textContent).toContain('Delete this image?')

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.dialog .btn--danger')
    expect(confirmButton).not.toBeNull()
    confirmButton!.click()
    await vi.waitFor(() => expect(store.imageCount).toBe(0))

    expect(wrapper.text()).toContain('No images uploaded yet.')
  })
})
