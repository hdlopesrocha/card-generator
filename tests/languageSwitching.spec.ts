import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import App from '@/App.vue'
import { useLanguageStore } from '@/stores/languageStore'

const routes = [
  { path: '/', redirect: '/cards' },
  { path: '/cards', component: () => import('@/views/CardListView.vue') },
  { path: '/cards/new', component: () => import('@/views/CardEditorView.vue') },
  { path: '/cards/:id/edit', component: () => import('@/views/CardEditorView.vue'), props: true },
  { path: '/cards/:id/preview', component: () => import('@/views/CardPreviewView.vue'), props: true },
  { path: '/settings', component: () => import('@/views/SettingsView.vue') },
]

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('live language switching', () => {
  it('updates the card list immediately when the picker changes', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/cards')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await settle()

    const titlesBefore = wrapper.findAll('.card-list-item__title').map((node) => node.text())
    expect(titlesBefore.sort()).toEqual(['Guardian', 'Tactician', 'Warrior'])

    const trigger = wrapper.find('.language-picker__button')
    expect(trigger.exists()).toBe(true)
    expect(wrapper.findAll('.language-flag').length).toBeGreaterThan(0)

    await trigger.trigger('click')
    await settle()

    const portuguese = wrapper.find('[data-language="PT"]')
    expect(portuguese.exists()).toBe(true)
    await portuguese.trigger('click')
    await settle()

    const titlesAfter = wrapper.findAll('.card-list-item__title').map((node) => node.text())
    expect(titlesAfter.sort()).toEqual(['Guardião', 'Guerreiro', 'Tático'])

    const languageStore = useLanguageStore()
    expect(languageStore.language).toBe('PT')
  })
})
