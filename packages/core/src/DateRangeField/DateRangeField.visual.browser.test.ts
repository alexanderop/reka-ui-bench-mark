import type { VisualCell } from '@/test/visual'
import { describe, expect } from 'vitest'
import { defineHistoireStory, pinClock, PINNED_TODAY } from '@/test/visual'
import DateRangeFieldChromatic from './story/DateRangeFieldChromatic.story.vue'

/**
 * Histoire's Chromatic story through `_DummyDateRangeField.vue`. The values
 * are `CalendarDateTime`s, so every field carries time segments. The
 * "Locale timezone" variant is built from `now(getLocalTimeZone())` — pinned
 * by the clock for the date, but its hour and zone name still follow the
 * host timezone, so that cell's pixels are masked; its geometry is a single
 * line either way.
 */
pinClock(PINNED_TODAY)

// One column: a date-time range field is wider than a half-sheet cell.
const histoire = defineHistoireStory(DateRangeFieldChromatic, {
  columns: 1,
  mask: ['[data-variant="Locale timezone"] [data-variant-frame]'],
})

function fieldText(c: VisualCell<{ name: string }>) {
  return c.get('[role="group"]').textContent?.replace(/\s+/g, '')
}

describe('dateRangeField histoire story', () => {
  histoire.it('renders each range field with start and end segments', ({ title, cells, cell }) => {
    expect(title).toBe('Date Range Field/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Empty default',
      'With default',
      'Uncontrolled',
      'Controlled',
      'Disabled',
      'Locale awareness',
      'Placeholder',
      'Locale timezone',
    ])

    expect(fieldText(cell('Empty default'))).toBe('mm/dd/yyyy-mm/dd/yyyy')
    for (const name of ['With default', 'Uncontrolled', 'Controlled', 'Disabled'])
      expect(fieldText(cell(name)), `${name}: 20–27 Feb with midnight times`).toBe('2/20/2024,12:00AM-2/27/2024,12:00AM')
    expect(fieldText(cell('Locale awareness')), 'de ordering, 24-hour').toBe('20.2.2024,00:00-27.2.2024,00:00')
    // A date-time placeholder gives the empty field time segments too.
    expect(fieldText(cell('Placeholder'))).toBe('mm/dd/yyyy,––:––AM-mm/dd/yyyy,––:––AM')
    // Zoned placeholder: segments exist (including a zone name); exact text is host-dependent and masked.
    const zoned = cell('Locale timezone')
    expect(zoned.getAll('[data-reka-date-field-segment="timeZoneName"]').length).toBeGreaterThanOrEqual(2)

    expect(cells.filter(c => c.get('[role="group"]').hasAttribute('data-disabled')).map(c => c.name)).toEqual(['Disabled'])
  })
})
