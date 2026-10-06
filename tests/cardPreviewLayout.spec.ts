import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'

import CardPreview from '@/components/CardPreview.vue'
import { Zone, type Card } from '@/models/Card'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    title: 'GOAT',
    subtitle: 'Greatest Of All Time',
    attack: 7,
    defense: 3,
    action: 'On goal: +1 ATK',
    image: null,
    zone: Zone.ATTACK,
    stars: 2,
    translations: {},
    ...overrides,
  }
}

function mountCard(card: Card) {
  return mount(CardPreview, { props: { card }, global: { plugins: [createPinia()] } })
}

const cardCss = readFileSync(
  resolve(process.cwd(), 'src/styles/card.css'),
  'utf8',
)

describe('CardPreview layout', () => {
  it('shows attack and defense counters around the title banner', () => {
    const wrapper = mountCard(makeCard())

    const header = wrapper.find('.card__header')
    expect(header.exists()).toBe(true)

    const attack = wrapper.find('.card__stat--attack')
    const defense = wrapper.find('.card__stat--defense')
    expect(attack.text()).toContain('7')
    expect(defense.text()).toContain('3')
    expect(wrapper.find('.card__title').text()).toBe('GOAT')
    expect(wrapper.find('.card__subtitle').text()).toBe('Greatest Of All Time')
  })

  it('places the star rating next to the action banner', () => {
    const wrapper = mountCard(makeCard({ stars: 3 }))

    const footer = wrapper.find('.card__footer')
    expect(footer.exists()).toBe(true)
    expect(footer.find('.card__stars').exists()).toBe(true)
    expect(footer.find('.card__action').exists()).toBe(true)
    expect(wrapper.findAll('.card__star--filled')).toHaveLength(3)
  })

  it('renders the full title and action text without clamping', () => {
    const longTitle = 'Defensive Midfield Orchestrator Of The Entire Team'
    const longAction = 'When this card defends, all adjacent teammates gain one attack point'
    const wrapper = mountCard(makeCard({ title: longTitle, action: longAction }))

    expect(wrapper.find('.card__title').text()).toBe(longTitle)
    expect(wrapper.find('.card__action-text').text()).toBe(longAction)

    const titleRule =
      cardCss.match(/\.card__title\s*\{[^}]*\}/)?.[0] ?? ''
    const actionRule =
      cardCss.match(/\.card__action-text\s*\{[^}]*\}/)?.[0] ?? ''
    expect(titleRule).not.toContain('line-clamp')
    expect(actionRule).not.toContain('line-clamp')
  })

  it('colours the title banner from the zone theme', () => {
    for (const [zone, className] of [
      [Zone.ATTACK, 'zone-attack'],
      [Zone.MIDFIELD, 'zone-midfield'],
      [Zone.DEFENSE, 'zone-defense'],
    ] as const) {
      const wrapper = mountCard(makeCard({ zone }))
      expect(wrapper.find('.card').classes()).toContain(className)
      wrapper.unmount()
    }

    const titleRule = cardCss.match(/\.card__title\s*\{[^}]*\}/)?.[0] ?? ''
    expect(titleRule).toContain('var(--zone-color)')
    // No fixed box height (line-height is fine): the banner grows with text.
    expect(/(^|[;\s{])((?:min|max)-)?height\s*:/m.test(titleRule)).toBe(false)
  })

  it('lets the action banner grow with its content', () => {
    const actionRule = cardCss.match(/\.card__action\s*\{[^}]*\}/)?.[0] ?? ''
    expect(/(^|[;\s{])((?:min|max)-)?height\s*:/m.test(actionRule)).toBe(false)
    expect(actionRule).toContain('padding:')
  })
})
