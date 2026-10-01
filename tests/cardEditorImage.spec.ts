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

vi.mock('@/services/image/bundledImages', () => ({
  getBundledImageNames: () => ['sample.png'],
  resolveBundledImage: async (name: string) => `data:image/png;base64,${btoa(name)}`,
}))

import CardEditorForm from '@/components/CardEditorForm.vue'
import { createEmptyCardDraft } from '@/models/Card'
import type { CardDraft } from '@/models/Card'
import { getImageRepository } from '@/services/storage/indexedDb'

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function mountForm() {
  setActivePinia(createPinia())

  return mount(CardEditorForm, {
    props: {
      modelValue: createEmptyCardDraft(),
      errors: {},
    },
  })
}

function lastDraft(wrapper: ReturnType<typeof mountForm>): CardDraft {
  const emitted = wrapper.emitted('update:modelValue') ?? []
  return emitted[emitted.length - 1]![0] as CardDraft
}

describe('CardEditorForm image handling', () => {
  beforeEach(async () => {
    await getImageRepository().clear()
  })

  it('keeps both the image data and the file name after uploading', async () => {
    const wrapper = mountForm()

    const input = wrapper.find('.image-uploader input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'hero.png', { type: 'image/png' })],
      configurable: true,
    })
    await input.trigger('change')
    await settle()

    const draft = lastDraft(wrapper)
    expect(String(draft.image)).toContain('data:image/jpeg')
    expect(draft.imageRef).toBe('hero.png')
  })

  it('keeps both the image data and the file name when picking from the library', async () => {
    const wrapper = mountForm()
    await settle()

    const toggle = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose from library'))
    expect(toggle).toBeDefined()
    await toggle!.trigger('click')
    await settle()

    const sample = wrapper.find('.image-picker__item')
    expect(sample.exists()).toBe(true)
    await sample.trigger('click')
    await settle()

    const draft = lastDraft(wrapper)
    expect(String(draft.image)).toContain('data:image/png')
    expect(draft.imageRef).toBe('sample.png')
  })
})
