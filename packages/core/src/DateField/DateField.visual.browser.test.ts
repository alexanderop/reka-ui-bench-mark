import type { VisualCell } from '@/test/visual'
import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import DateFieldChromatic from './story/DateFieldChromatic.story.vue'

/**
 * Histoire's Chromatic story: eight segmented date fields. The rendered
 * segments are the product output — placeholders for the empty fields, the
 * 2024-02-28 default elsewhere, German ordering under `locale="de"`.
 */
const histoire = defineHistoireStory(DateFieldChromatic)

/** The field's visible text with whitespace removed, e.g. `2/28/2024` (en-US pads nothing). */
function fieldText(c: VisualCell<{ name: string }>) {
  return c.get('[role="group"]').textContent?.replace(/\s+/g, '')
}

describe('dateField histoire story', () => {
  histoire.it('renders each field with the segments its value and locale produce', ({ title, cells, cell }) => {
    expect(title).toBe('Date Field/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Empty default',
      'With default',
      'Uncontrolled',
      'Controlled',
      'Min date',
      'Max date',
      'Disabled',
      'Locale awareness',
    ])

    for (const name of ['Empty default', 'Uncontrolled', 'Controlled'])
      expect(fieldText(cell(name)), `${name}: placeholder segments`).toBe('mm/dd/yyyy')
    for (const name of ['With default', 'Min date', 'Max date', 'Disabled'])
      expect(fieldText(cell(name)), `${name}: default value`).toBe('2/28/2024')
    expect(fieldText(cell('Locale awareness')), 'de placeholders').toBe('tt.mm.jjjj')

    // 28 Feb sits inside both bounds, so neither bounded field is invalid.
    expect(cells.filter(c => c.getAll('[data-invalid]').length > 0).map(c => c.name)).toEqual([])

    const disabled = cell('Disabled')
    expect(disabled.get('[role="group"]').hasAttribute('data-disabled')).toBe(true)
    expect(cells.filter(c => c.get('[role="group"]').hasAttribute('data-disabled')).map(c => c.name)).toEqual(['Disabled'])
  })
})
