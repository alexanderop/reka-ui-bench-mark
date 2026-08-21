import type { VisualCell } from '@/test/visual'
import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import DatePickerChromatic from './story/DatePickerChromatic.story.vue'

/**
 * Histoire's Chromatic story through `_DummyDatePicker.vue`: ten closed
 * pickers, so the sheet is the field plus its calendar trigger — the popover
 * calendar is not mounted while closed and is out of scope here.
 */
const histoire = defineHistoireStory(DatePickerChromatic)

function fieldText(c: VisualCell<{ name: string }>) {
  return c.get('[role="group"]').textContent?.replace(/\s+/g, '')
}

describe('datePicker histoire story', () => {
  histoire.it('renders every picker closed with its field value and trigger', ({ title, cells, cell }) => {
    expect(title).toBe('Date Picker/Chromatic')
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

    expect(fieldText(cell('Empty default'))).toBe('mm/dd/yyyy')
    expect(fieldText(cell('Locale awareness'))).toBe('20.2.2024')
    for (const c of cells) {
      if (c.name === 'Empty default' || c.name === 'Locale awareness')
        continue
      expect(fieldText(c), `${c.name}: default value`).toBe('2/20/2024')
    }

    for (const c of cells) {
      const trigger = c.get('button[aria-haspopup="dialog"], button[aria-expanded]')
      expect(trigger.getAttribute('aria-expanded'), `${c.name}: closed`).toBe('false')
      expect(c.getAll('svg.iconify--radix-icons'), `${c.name}: calendar icon`).toHaveLength(1)
      expect(c.getAll('[role="dialog"]'), `${c.name}: no popover content`).toHaveLength(0)
    }
    const disabled = cell('Disabled')
    expect(disabled.get('[role="group"]').hasAttribute('data-disabled')).toBe(true)
    expect(cells.filter(c => c.get('[role="group"]').hasAttribute('data-disabled')).map(c => c.name)).toEqual(['Disabled'])
  })
})
