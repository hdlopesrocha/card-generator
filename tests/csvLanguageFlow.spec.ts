import 'fake-indexeddb/auto'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { decodePDFRawStream, PDFDocument, PDFRawStream } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import CardListView from '@/views/CardListView.vue'
import { useCardStore } from '@/stores/cardStore'
import { useLanguageStore } from '@/stores/languageStore'

const SAMPLE_CSV = readFileSync(resolve(process.cwd(), 'sample.csv'), 'utf8')

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function pdfText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const document = await PDFDocument.load(bytes)
  const chunks: string[] = []

  for (const page of document.getPages()) {
    const contents = page.node.normalizedEntries().Contents
    if (!contents) continue

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
  }

  return chunks.join('\n')
}

describe('csv import through the UI', () => {
  it('imports sample.csv and can export the cards in the selected language', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useCardStore()
    await store.clearAllCards()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/cards', component: CardListView },
      ],
    })
    await router.push('/cards')
    await router.isReady()

    const languageStore = useLanguageStore()
    languageStore.setLanguage('PT')

    const wrapper = mount(CardListView, { global: { plugins: [pinia, router] } })
    await settle()

    const file = new File([SAMPLE_CSV], 'sample.csv', { type: 'text/csv' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    await vi.waitFor(() => expect(store.cardCount).toBe(3))

    for (const card of store.cards) {
      expect(card.translations.PT?.title).toBeTruthy()
    }

    const titles = wrapper.findAll('.card__title').map((node) => node.text())
    expect(titles.length).toBeGreaterThanOrEqual(3)
    for (const title of titles) {
      expect(['Guardião', 'Guerreiro', 'Tático']).toContain(title)
    }

    let blob: Blob | null = null
    const originalCreate = URL.createObjectURL
    URL.createObjectURL = vi.fn((value: Blob) => {
      blob = value
      return 'blob:probe'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      const exportAll = wrapper
        .findAll('button')
        .find((button) => button.text().includes('Exportar todas'))
      expect(exportAll).toBeDefined()
      await exportAll!.trigger('click')
      await settle()

      const confirmButton = document.body.querySelector<HTMLButtonElement>(
        '.dialog__footer .btn--primary',
      )
      expect(confirmButton).not.toBeNull()
      confirmButton!.click()
      await settle()

      await vi.waitFor(() => expect(blob).not.toBeNull())

      const text = await pdfText(blob as unknown as Blob)
      expect(text).toContain('Guerreiro')
      expect(text).not.toContain('Warrior')
    } finally {
      URL.createObjectURL = originalCreate
      vi.restoreAllMocks()
    }
  })
})
