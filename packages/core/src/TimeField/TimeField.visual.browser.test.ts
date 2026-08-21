import type { VisualCell } from '@/test/visual'
import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import TimeFieldChromatic from './story/TimeFieldChromatic.story.vue'

/**
 * Histoire's Chromatic story: eight segmented time fields — en-US 12-hour
 * placeholders and values, a 24-hour German one.
 */
const histoire = defineHistoireStory(TimeFieldChromatic)

function fieldText(c: VisualCell<{ name: string }>) {
  return c.get('[role="group"]').textContent?.replace(/\s+/g, '')
}

describe('timeField histoire story', () => {
  histoire.it('renders each field with the segments its value and locale produce', ({ title, cells, cell }) => {
    expect(title).toBe('Time Field/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Empty default',
      'With default',
      'Uncontrolled',
      'Controlled',
      'Min value',
      'Max value',
      'Disabled',
      'Locale awareness',
    ])

    for (const name of ['Empty default', 'Uncontrolled', 'Controlled', 'Min value', 'Max value', 'Disabled'])
      expect(fieldText(cell(name)), `${name}: placeholder segments`).toBe('––:––AM')
    expect(fieldText(cell('With default'))).toBe('10:00AM')
    expect(fieldText(cell('Locale awareness')), 'de: 24-hour, no day period').toBe('––:––')

    expect(cells.filter(c => c.getAll('[data-invalid]').length > 0).map(c => c.name)).toEqual([])
    expect(cells.filter(c => c.get('[role="group"]').hasAttribute('data-disabled')).map(c => c.name)).toEqual(['Disabled'])
  })
})
