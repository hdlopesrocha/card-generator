import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { it, expect } from 'vitest'

import { parseCardsCsvFile } from '@/services/csv/csvService'
import { generateCardsPdf } from '@/services/pdf/cardPdfService'

it('imports sample.csv with images and embeds them in the PDF', async () => {
  const text = readFileSync(resolve(process.cwd(), 'sample.csv'), 'utf8')
  const result = await parseCardsCsvFile(new File([text], 'sample.csv', { type: 'text/csv' }))

  expect(result.ok).toBe(true)
  if (!result.ok) return

  for (const card of result.cards) {
    expect(card.image).toMatch(/^data:image\/jpeg;base64,/)
  }

  const bytes = await generateCardsPdf(result.cards, { language: 'PT' })
  const content = new TextDecoder('latin1').decode(bytes)

  expect(content).toContain('/Subtype /Image')
  expect(bytes.length).toBeGreaterThan(100_000)
})
