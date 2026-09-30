import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import CardEditorView from '@/views/CardEditorView.vue'
import { useCardStore } from '@/stores/cardStore'
import { useLanguageStore } from '@/stores/languageStore'

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('create card while in Portuguese', () => {
  it('allows saving a card written only in the selected language', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useCardStore()
    await store.loadCards()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/cards', component: { template: '<div />' } },
        { path: '/cards/new', component: { template: '<div />' } },
        { path: '/cards/:id/edit', component: CardEditorView, props: true },
      ],
    })
    await router.push('/cards/new')
    await router.isReady()

    const languageStore = useLanguageStore()
    languageStore.setLanguage('PT')

    const wrapper = mount(CardEditorView, { global: { plugins: [pinia, router] } })
    await settle()

    await wrapper.find('#card-title').setValue('Mago')
    await wrapper.find('#card-action').setValue('Lança uma bola de fogo.')
    await settle()

    expect(wrapper.find('.card__title').text()).toBe('Mago')

    await wrapper.find('form').trigger('submit')
    await settle()

    const saved = store.cards.find(
      (card) => card.title === 'Mago' || card.translations.PT?.title === 'Mago',
    )
    expect(router.currentRoute.value.path).toBe('/cards')
    expect(saved).toBeDefined()
    expect(saved?.title).toBe('Mago')
    expect(saved?.translations.PT?.title).toBe('Mago')
    expect(saved?.translations.PT?.action).toBe('Lança uma bola de fogo.')
  })
})
