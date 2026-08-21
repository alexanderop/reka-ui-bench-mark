import { describe, expect } from 'vitest'
import { defineHistoireStory, pinClock, PINNED_TODAY } from '@/test/visual'
import RangeCalendarChromatic from './story/RangeCalendarChromatic.story.vue'

/**
 * Histoire's Chromatic story through `_DummyRangeCalendar.vue`, clock pinned
 * to 2024-02-14 for the same reason as Calendar: the value-less variants
 * open on today's month and the February grids dot today.
 */
pinClock(PINNED_TODAY)

const histoire = defineHistoireStory(RangeCalendarChromatic)

describe('rangeCalendar histoire story', () => {
  histoire.it('renders every range calendar with the 20–27 February range where one is set', ({ title, cells, cell }) => {
    expect(title).toBe('Range Calendar/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Uncontrolled (modelValue)',
      'Controlled (modelValue)',
      'Uncontrolled (placeholder)',
      'Controlled (placeholder)',
      'Empty default',
      'Default value',
      'Disabled',
      'Fixed weeks',
      'Localization',
      'Prevent deselection',
      'Multiple selection',
      'Different calendar',
      'Pagination functions',
    ])

    const heading = (name: string) => cell(name).get('button + div').textContent?.trim()
    const text = (el: Element) => el.textContent?.trim()
    const range = (name: string) => ({
      start: cell(name).getAll('[data-selection-start]').map(text),
      end: cell(name).getAll('[data-selection-end]').map(text),
      selected: cell(name).getAll('[data-selected]:not([data-outside-view])').map(text),
    })

    const FEB_RANGE = ['20', '21', '22', '23', '24', '25', '26', '27']
    for (const name of ['Uncontrolled (modelValue)', 'Controlled (modelValue)', 'Default value', 'Fixed weeks', 'Prevent deselection', 'Multiple selection', 'Pagination functions']) {
      expect(heading(name), `${name}: heading`).toBe('February 2024')
      expect(range(name), `${name}: range`).toEqual({ start: ['20'], end: ['27'], selected: FEB_RANGE })
    }
    expect(heading('Localization')).toBe('Februar 2024')
    expect(range('Localization')).toEqual({ start: ['20'], end: ['27'], selected: FEB_RANGE })

    // Placeholder April: the range is off-view.
    for (const name of ['Uncontrolled (placeholder)', 'Controlled (placeholder)']) {
      expect(heading(name), `${name}: heading`).toBe('April 2024')
      expect(range(name).selected, `${name}: nothing in view`).toEqual([])
    }
    for (const name of ['Empty default', 'Disabled']) {
      expect(heading(name), `${name}: heading`).toBe('February 2024')
      expect(range(name).selected, `${name}: nothing selected`).toEqual([])
      expect(cell(name).getAll('[data-today]:not([data-outside-view])').map(text), `${name}: pinned today`).toEqual(['14'])
    }

    // 20–27 Feb 2024 is 1–8 Esfand 1402 in the Persian calendar.
    const persian = range('Different calendar')
    expect(persian.start).toEqual(['1'])
    expect(persian.end).toEqual(['8'])
    expect(persian.selected).toHaveLength(8)

    expect(cell('Disabled').get('[data-variant-frame] > *').hasAttribute('data-disabled')).toBe(true)
    expect(cells.filter(c => c.get('[data-variant-frame] > *').hasAttribute('data-disabled'))).toHaveLength(1)
    expect(cells.flatMap(c => c.getAll('svg.iconify--radix-icons'))).toHaveLength(26)
  })
})
