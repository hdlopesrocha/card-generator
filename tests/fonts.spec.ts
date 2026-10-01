import 'fake-indexeddb/auto'

import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import {
  CARD_FONTS,
  BUNDLED_CARD_FONTS,
  SYSTEM_CARD_FONTS,
  DEFAULT_CARD_FONT_ID,
  getCardFont,
  isCardFontId,
} from '@/config/fonts'
import { cardFontFamily } from '@/services/fonts/webFonts'
import { STORAGE_KEYS } from '@/config/constants'
import { useSettingsStore } from '@/stores/settingsStore'
import CardListView from '@/views/CardListView.vue'

describe('card font registry', () => {
  it('discovers every bundled font', () => {
    expect(BUNDLED_CARD_FONTS.length).toBeGreaterThanOrEqual(2)
    expect(BUNDLED_CARD_FONTS.every((font) => font.id.length > 0)).toBe(true)
    expect(BUNDLED_CARD_FONTS.every((font) => (font.url ?? '').length > 0)).toBe(true)
    expect(new Set(BUNDLED_CARD_FONTS.map((font) => font.id)).size).toBe(
      BUNDLED_CARD_FONTS.length,
    )
  })

  it('lists the common system fonts after the bundled ones', () => {
    expect(SYSTEM_CARD_FONTS.length).toBeGreaterThanOrEqual(40)
    expect(SYSTEM_CARD_FONTS.every((font) => font.kind === 'system')).toBe(true)
    expect(CARD_FONTS.slice(0, BUNDLED_CARD_FONTS.length)).toEqual(BUNDLED_CARD_FONTS)
    expect(CARD_FONTS.slice(BUNDLED_CARD_FONTS.length)).toEqual(SYSTEM_CARD_FONTS)
    expect(new Set(CARD_FONTS.map((font) => font.id)).size).toBe(CARD_FONTS.length)
  })

  it('covers the major desktop and mobile platforms', () => {
    const families = SYSTEM_CARD_FONTS.map((font) => font.family)

    // Windows, macOS/iOS, Linux and Android representatives.
    for (const family of ['Segoe UI', 'Helvetica Neue', 'DejaVu Sans', 'Roboto']) {
      expect(families).toContain(family)
    }
  })

  it('accepts system font ids', () => {
    expect(isCardFontId('system:Arial')).toBe(true)
    expect(getCardFont('system:Arial')?.family).toBe('Arial')
    expect(isCardFontId('system:Definitely Not Installed')).toBe(false)
  })

  it('includes the demo game fonts and marks them as letters-only', () => {
    const online = getCardFont('GameOnlineDemoRegular')
    const score = getCardFont('GameScoreDemoRegular')

    expect(online).toBeDefined()
    expect(score).toBeDefined()
    expect(online?.lettersOnly).toBe(true)
    expect(score?.lettersOnly).toBe(true)
  })

  it('exposes a valid default font id', () => {
    expect(isCardFontId(DEFAULT_CARD_FONT_ID)).toBe(true)
  })

  it('builds a CSS font stack for the selected font', () => {
    const family = cardFontFamily('GameScoreDemoRegular')

    expect(family.startsWith("'GameScoreDemoRegular', ")).toBe(true)
    expect(family).toContain('sans-serif')
  })

  it('builds a CSS font stack for a system font', () => {
    expect(cardFontFamily('system:Helvetica Neue')).toContain("'Helvetica Neue', ")
  })

  it('falls back to the default stack for unknown font ids', () => {
    expect(cardFontFamily('missing-font')).not.toContain('missing-font')
  })
})

describe('settings store card font', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('defaults to the default bundled font', () => {
    const settings = useSettingsStore()

    expect(settings.cardFontId).toBe(DEFAULT_CARD_FONT_ID)
  })

  it('accepts known font ids and ignores unknown ones', () => {
    const settings = useSettingsStore()

    settings.setCardFont('GameScoreDemoRegular')
    expect(settings.cardFontId).toBe('GameScoreDemoRegular')

    settings.setCardFont('system:Roboto')
    expect(settings.cardFontId).toBe('system:Roboto')

    settings.setCardFont('not-a-font')
    expect(settings.cardFontId).toBe('system:Roboto')
  })

  it('persists the selected font and restores it', async () => {
    const settings = useSettingsStore()
    settings.setCardFont('GameScoreDemoRegular')
    await nextTick()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) ?? '{}')
    expect(stored.cardFontId).toBe('GameScoreDemoRegular')

    setActivePinia(createPinia())
    const restored = useSettingsStore()
    expect(restored.cardFontId).toBe('GameScoreDemoRegular')
  })

  it('resets the font to the default', () => {
    const settings = useSettingsStore()
    settings.setCardFont('GameScoreDemoRegular')

    settings.resetToDefaults()
    expect(settings.cardFontId).toBe(DEFAULT_CARD_FONT_ID)
  })
})

describe('cards page font dropdown', () => {
  it('lists bundled fonts first, then system fonts, and updates the store', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/cards', component: CardListView },
        { path: '/cards/new', component: { template: '<div />' } },
        { path: '/settings', component: { template: '<div />' } },
      ],
    })
    await router.push('/cards')
    await router.isReady()

    const wrapper = mount(CardListView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const select = wrapper.find('#cards-card-font')
    expect(select.exists()).toBe(true)
    expect(select.findAll('optgroup')).toHaveLength(2)
    expect(select.findAll('optgroup')[0]!.attributes('label')).toBe('Bundled fonts')
    expect(select.findAll('optgroup')[1]!.attributes('label')).toBe('System fonts')

    const values = select
      .findAll('option')
      .map((option) => option.attributes('value'))
    expect(values).toEqual(CARD_FONTS.map((font) => font.id))

    await select.setValue('system:Roboto')
    await nextTick()

    const settings = useSettingsStore()
    expect(settings.cardFontId).toBe('system:Roboto')
  })
})
