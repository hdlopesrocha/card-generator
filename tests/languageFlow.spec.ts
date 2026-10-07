import 'fake-indexeddb/auto'

import { decodePDFRawStream, PDFDocument, PDFRawStream } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import App from '@/App.vue'
import { useLanguageStore } from '@/stores/languageStore'
import { useCardStore } from '@/stores/cardStore'
import type { Card } from '@/models/Card'

const routes = [
  { path: '/', redirect: '/cards' },
  { path: '/cards', component: () => import('@/views/CardListView.vue') },
  { path: '/cards/new', component: () => import('@/views/CardEditorView.vue') },
  { path: '/cards/:id/edit', component: () => import('@/views/CardEditorView.vue'), props: true },
  { path: '/cards/:id/preview', component: () => import('@/views/CardPreviewView.vue'), props: true },
  { path: '/settings', component: () => import('@/views/SettingsView.vue') },
]

async function settle(): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function pdfText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.normalizedEntries().Contents
  if (!contents) return ''
  const chunks: string[] = []
  for (const entry of contents.asArray()) {
    const stream = document.context.lookup(entry)
    if (stream instanceof PDFRawStream) {
      const decoded = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode())
      chunks.push(
        decoded.replace(/<([0-9a-fA-F]+)>/g, (match, hex: string) => {
          if (hex.length % 2 !== 0) return match
          const data = new Uint8Array(hex.length / 2)
          for (let index = 0; index < data.length; index += 1) {
            data[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
          }
          return new TextDecoder('latin1').decode(data)
        }),
      )
    }
  }
  return chunks.join('\n')
}

describe('end-to-end language flow', () => {
  it('list, editor preview and PDF all use the picked language', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/cards')
    await router.isReady()

    const languageStore = useLanguageStore()
    languageStore.setLanguage('PT')

    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await settle()

    const store = useCardStore()
    const raw: Card[] = store.cards
    expect(raw).toHaveLength(3)
    for (const card of raw) {
      expect(card.translations?.PT?.title).toBeTruthy()
    }

    const titles = wrapper.findAll('.card__title').map((node) => node.text())
    expect(titles.sort()).toEqual(['Guardião', 'Guerreiro', 'Tático'])

    // Editor preview for the Warrior
    await router.push('/cards/sample-warrior/edit')
    await settle()
    expect(wrapper.find('.card__title').text()).toBe('Guerreiro')
    expect(wrapper.find('.card__action-label').text()).toBe('Ação')

    // PDF from the editor
    let blob: Blob | null = null
    const originalCreate = URL.createObjectURL
    URL.createObjectURL = vi.fn((value: Blob) => {
      blob = value
      return 'blob:probe'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      const pdfButton = wrapper
        .findAll('button')
        .find((button) => button.attributes('type') === 'button' && button.text().includes('PDF'))
      expect(pdfButton).toBeDefined()
      await pdfButton!.trigger('click')
      await settle()
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(blob).not.toBeNull()
      const text = await pdfText(blob as unknown as Blob)
      expect(text).toContain('Guerreiro')
      expect(text).toContain('CARREGUE')
    } finally {
      URL.createObjectURL = originalCreate
      vi.restoreAllMocks()
    }
  })
})
