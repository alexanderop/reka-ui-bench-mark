import type { VisualCell } from '@/test/visual'
import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import TimeRangeFieldChromatic from './story/TimeRangeFieldChromatic.story.vue'

/** Histoire's Chromatic story through `_DummyTimeRangeField.vue`. */
// One column: a range field is wider than a half-sheet cell.
const histoire = defineHistoireStory(TimeRangeFieldChromatic, { columns: 1 })

function fieldText(c: VisualCell<{ name: string }>) {
  return c.get('[role="group"]').textContent?.replace(/\s+/g, '')
}

describe('timeRangeField histoire story', () => {
  histoire.it('renders each range field with start and end time segments', ({ title, cells, cell }) => {
    expect(title).toBe('Time Range Field/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Empty default',
      'With default value',
      'Uncontrolled',
      'Controlled',
      'Disabled',
      'Locale awareness',
      'Placeholder',
      'Timezone example',
    ])

    expect(fieldText(cell('Empty default'))).toBe('––:––AM-––:––AM')
    for (const name of ['With default value', 'Uncontrolled', 'Controlled', 'Disabled'])
      expect(fieldText(cell(name)), `${name}: 10–11 AM`).toBe('10:00AM-11:00AM')
    expect(fieldText(cell('Locale awareness')), 'de: 24-hour').toBe('10:00-11:00')
    for (const name of ['Placeholder', 'Timezone example'])
      expect(fieldText(cell(name)), `${name}: placeholder segments`).toBe('––:––AM-––:––AM')

    expect(cells.filter(c => c.get('[role="group"]').hasAttribute('data-disabled')).map(c => c.name)).toEqual(['Disabled'])
  })
})
