import type { VisualCell } from '@/test/visual'
import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import DateRangePickerChromatic from './story/DateRangePickerChromatic.story.vue'

/**
 * Histoire's Chromatic story through `_DummyDateRangePicker.vue`: ten closed
 * range pickers. Values are `CalendarDateTime`s, so the fields carry time
 * segments; the popover calendar is unmounted while closed.
 */
// One column: a range field is wider than a half-sheet cell.
const histoire = defineHistoireStory(DateRangePickerChromatic, { columns: 1 })

function fieldText(c: VisualCell<{ name: string }>) {
  return c.get('[role="group"]').textContent?.replace(/\s+/g, '')
}

describe('dateRangePicker histoire story', () => {
  histoire.it('renders every range picker closed with its field value and trigger', ({ title, cells, cell }) => {
    expect(title).toBe('Date Range Picker/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Empty default',
      'With default',
      'Uncontrolled',
      'Controlled',
      'Disabled',
      'Prevent deselect',
      'Locale awareness',
      'Fixed weeks',
      'Multiple months',
      'Multiple months (Paged navigation)',
    ])

    expect(fieldText(cell('Empty default'))).toBe('mm/dd/yyyy-mm/dd/yyyy')
    expect(fieldText(cell('Locale awareness'))).toBe('20.2.2024,00:00-27.2.2024,00:00')
    for (const c of cells) {
      if (c.name === 'Empty default' || c.name === 'Locale awareness')
        continue
      expect(fieldText(c), `${c.name}: default range`).toBe('2/20/2024,12:00AM-2/27/2024,12:00AM')
    }

    for (const c of cells) {
      const trigger = c.get('button[aria-haspopup="dialog"], button[aria-expanded]')
      expect(trigger.getAttribute('aria-expanded'), `${c.name}: closed`).toBe('false')
      expect(c.getAll('svg.iconify--radix-icons'), `${c.name}: calendar icon`).toHaveLength(1)
      expect(c.getAll('[role="dialog"]'), `${c.name}: no popover content`).toHaveLength(0)
    }
    expect(cells.filter(c => c.get('[role="group"]').hasAttribute('data-disabled')).map(c => c.name)).toEqual(['Disabled'])
  })
})
