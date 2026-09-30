import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import App from '@/App.vue'
import CardEditorView from '@/views/CardEditorView.vue'
import CardListView from '@/views/CardListView.vue'
import CardPreview from '@/components/CardPreview.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import { Zone, type Card } from '@/models/Card'
import { useCardStore } from '@/stores/cardStore'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/cards' },
      { path: '/cards', name: 'cards', component: () => import('@/views/CardListView.vue') },
      { path: '/cards/new', name: 'card-new', component: () => import('@/views/CardEditorView.vue') },
      {
        path: '/cards/:id/edit',
        name: 'card-edit',
        component: () => import('@/views/CardEditorView.vue'),
        props: true,
      },
      {
        path: '/cards/:id/preview',
        name: 'card-preview',
        component: () => import('@/views/CardPreviewView.vue'),
        props: true,
      },
      { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    ],
  })
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

let pinia: Pinia
let router: Router

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = makeRouter()
})

describe('application integration', () => {
  it('seeds and renders the three demo cards on the card list', async () => {
    await router.push('/cards')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await settle()

    const items = wrapper.findAll('.card-list-item')
    expect(items).toHaveLength(3)

    const text = wrapper.text()
    expect(text).toContain('Warrior')
    expect(text).toContain('Tactician')
    expect(text).toContain('Guardian')
    expect(text).toContain('Frontline Fighter')
    expect(text).toContain('Defensive Sentinel')
  })

  it('updates the live preview immediately when editing fields and zone', async () => {
    const wrapper = mount(CardEditorView, { global: { plugins: [pinia, router] } })
    await settle()

    const preview = wrapper.find('.card')
    expect(preview.exists()).toBe(true)
    expect(preview.classes()).toContain('zone-attack')

    await wrapper.find('#card-title').setValue('Storm Bringer')
    await wrapper.find('#card-action').setValue('Strike from the clouds.')
    await settle()
    expect(wrapper.find('.card__title').text()).toBe('Storm Bringer')
    expect(wrapper.find('.card__action-text').text()).toBe('Strike from the clouds.')

    await wrapper.find('input[type="radio"][value="DEFENSE"]').setValue()
    await settle()
    expect(wrapper.find('.card').classes()).toContain('zone-defense')

    await wrapper.find('input[type="radio"][value="MIDFIELD"]').setValue()
    await settle()
    expect(wrapper.find('.card').classes()).toContain('zone-midfield')

    await wrapper.find('input[type="radio"][name="card-stars"][value="3"]').setValue()
    await settle()
    expect(wrapper.findAll('.card__star--filled')).toHaveLength(3)
  })

  it('saves a new card from the editor into the local store', async () => {
    const wrapper = mount(CardEditorView, { global: { plugins: [pinia, router] } })
    await settle()

    await wrapper.find('#card-title').setValue('Iron Golem')
    await wrapper.find('#card-subtitle').setValue('Unmovable')
    await wrapper.find('#card-attack').setValue('75')
    await wrapper.find('#card-defense').setValue('210')
    await wrapper.find('#card-action').setValue('Absorb the next three attacks.')
    await wrapper.find('input[type="radio"][value="DEFENSE"]').setValue()
    await wrapper.find('input[type="radio"][name="card-stars"][value="3"]').setValue()
    await settle()

    await wrapper.find('form').trigger('submit')
    await settle()

    expect(router.currentRoute.value.path).toBe('/cards')

    const store = useCardStore()
    const saved = store.cards.find((card) => card.title === 'Iron Golem')
    expect(saved).toBeDefined()
    expect(saved?.attack).toBe(75)
    expect(saved?.defense).toBe(210)
    expect(saved?.zone).toBe(Zone.DEFENSE)
    expect(saved?.stars).toBe(3)
  })

  it('blocks saving an invalid card and shows field errors', async () => {
    await router.push('/cards/new')
    await router.isReady()

    const wrapper = mount(CardEditorView, { global: { plugins: [pinia, router] } })
    await settle()

    await wrapper.find('form').trigger('submit')
    await settle()

    expect(router.currentRoute.value.path).toBe('/cards/new')
    expect(wrapper.find('.form-field__error').exists()).toBe(true)
    expect(wrapper.text()).toContain('Title is required.')
  })

  it('asks for confirmation before deleting a card', async () => {
    await router.push('/cards')
    await router.isReady()

    const wrapper = mount(CardListView, { global: { plugins: [pinia, router] } })
    await settle()

    const initialCount = wrapper.findAll('.card-list-item').length
    expect(initialCount).toBeGreaterThan(0)

    const deleteButton = wrapper
      .findAll('.card-list-item button')
      .find((button) => (button.attributes('aria-label') ?? '').startsWith('Delete'))
    expect(deleteButton).toBeDefined()

    await deleteButton!.trigger('click')
    await settle()

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.dialog .btn--danger')
    expect(confirmButton).not.toBeNull()
    expect(document.body.textContent).toContain('Delete this card?')

    confirmButton!.click()
    await settle()

    expect(wrapper.findAll('.card-list-item')).toHaveLength(initialCount - 1)
  })

  it('renders every zone theme with the matching class', async () => {
    const baseCard: Card = {
      id: 'zone-fixture',
      title: 'Zone Fixture',
      subtitle: 'Theme',
      attack: 10,
      defense: 20,
      action: 'Test the theme.',
      image: null,
      zone: Zone.ATTACK,
      stars: 2,
      translations: {},
    }

    const wrapper = mount(CardPreview, { props: { card: baseCard }, global: { plugins: [pinia] } })
    expect(wrapper.classes()).toContain('zone-attack')
    expect(wrapper.findAll('.card__star')).toHaveLength(3)
    expect(wrapper.findAll('.card__star--filled')).toHaveLength(2)

    await wrapper.setProps({ card: { ...baseCard, zone: Zone.MIDFIELD } })
    expect(wrapper.classes()).toContain('zone-midfield')

    await wrapper.setProps({ card: { ...baseCard, zone: Zone.DEFENSE } })
    expect(wrapper.classes()).toContain('zone-defense')
  })

  it('exports the selected cards from the export dialog', async () => {
    const cards: Card[] = [
      {
        id: 'a',
        title: 'Alpha',
        subtitle: '',
        attack: 1,
        defense: 2,
        action: 'First.',
        image: null,
        zone: Zone.ATTACK,
        stars: 3,
        translations: {},
      },
      {
        id: 'b',
        title: 'Beta',
        subtitle: '',
        attack: 3,
        defense: 4,
        action: 'Second.',
        image: null,
        zone: Zone.MIDFIELD,
        stars: 1,
        translations: {},
      },
    ]

    const wrapper: VueWrapper = mount(ExportDialog, {
      props: { open: true, cards },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    })
    await settle()

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)

    await checkboxes[1]!.setValue(false)

    const buttons = wrapper.findAll('button')
    const exportButton = buttons.find((button) => button.text().includes('Export'))
    expect(exportButton).toBeDefined()
    await exportButton!.trigger('click')

    const emitted = wrapper.emitted('export')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]?.[0]).toEqual({ cards: [cards[0]] })
  })

  it('imports a CSV file and creates the cards without exporting a PDF', async () => {
    await router.push('/cards')
    await router.isReady()

    const wrapper = mount(CardListView, { global: { plugins: [pinia, router] } })
    await settle()

    const store = useCardStore()
    const before = store.cardCount

    const csv = [
      'title,subtitle,attack,defense,action,zone,image',
      'Warrior,Frontline Fighter,120,90,Charge the nearest enemy.,ATTACK,',
      'Tactician,,80,100,Increase ally effectiveness.,MIDFIELD,',
      'Guardian,,60,150,Protect an allied card.,DEFENSE,',
    ].join('\n')
    const file = new File([csv], 'cards.csv', { type: 'text/csv' })

    const createObjectURL = vi.fn(() => 'blob:mock')
    URL.createObjectURL = createObjectURL

    try {
      const input = wrapper.find('input[type="file"]')
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
      await input.trigger('change')

      await vi.waitFor(() => expect(store.cardCount).toBe(before + 3))

      expect(store.cards.map((card) => card.title)).toEqual(
        expect.arrayContaining(['Warrior', 'Tactician', 'Guardian']),
      )
      expect(createObjectURL).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Created 3 cards from the CSV.')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('shows a friendly error and creates nothing for an invalid CSV', async () => {
    await router.push('/cards')
    await router.isReady()

    const wrapper = mount(CardListView, { global: { plugins: [pinia, router] } })
    await settle()

    const store = useCardStore()
    const before = store.cardCount

    const csv = ['title,subtitle,attack,defense,action,zone', 'Broken,,nope,1,Act,ATTACK'].join('\n')
    const file = new File([csv], 'broken.csv', { type: 'text/csv' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

    await input.trigger('change')
    await settle()

    expect(store.cardCount).toBe(before)
    expect(wrapper.text()).toContain('1 invalid row')
    expect(wrapper.text()).toContain('Row 2')
    expect(wrapper.text()).toContain('Attack must be a number')
  })

  it('downloads the current cards as a CSV file', async () => {
    await router.push('/cards')
    await router.isReady()

    const wrapper = mount(CardListView, { global: { plugins: [pinia, router] } })
    await settle()

    const store = useCardStore()
    expect(store.cardCount).toBeGreaterThan(0)

    let blob: Blob | null = null
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((value: Blob) => {
      blob = value
      return 'blob:csv'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      const button = wrapper
        .findAll('button')
        .find((candidate) => candidate.text().includes('Download CSV'))
      expect(button).toBeDefined()
      await button!.trigger('click')
      await settle()

      expect(blob).not.toBeNull()
      const text = await (blob as unknown as Blob).text()
      expect(text.startsWith('title,')).toBe(true)
      expect(text).toContain('Warrior')
      expect(wrapper.text()).toContain(`CSV with ${store.cardCount} cards was generated.`)
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      vi.restoreAllMocks()
    }
  })

  it('deletes all cards after confirmation from the cards page', async () => {
    await router.push('/cards')
    await router.isReady()

    const wrapper = mount(CardListView, { global: { plugins: [pinia, router] } })
    await settle()

    const store = useCardStore()
    expect(store.cardCount).toBeGreaterThan(0)

    const deleteAllButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Delete All Cards'))
    expect(deleteAllButton).toBeDefined()
    await deleteAllButton!.trigger('click')
    await settle()

    expect(document.body.textContent).toContain('Delete all cards?')

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.dialog .btn--danger')
    expect(confirmButton).not.toBeNull()
    confirmButton!.click()
    await vi.waitFor(() => expect(store.cardCount).toBe(0))

    expect(wrapper.text()).toContain('No cards created yet.')
    expect(document.body.textContent).not.toContain('Delete all cards?')
  })
})
