import { describe, expect } from 'vitest'
import { defineHistoireStory, pinClock, PINNED_TODAY } from '@/test/visual'
import CalendarChromatic from './story/CalendarChromatic.story.vue'

/**
 * Histoire's Chromatic story through `_DummyCalendar.vue`. Two variants have
 * no value and open on *today's* month, and every February grid marks today
 * with a dot, so the clock is pinned to 2024-02-14 — a day inside the
 * story's own February 2024 fixture, distinct from the selected 20th.
 */
pinClock(PINNED_TODAY)

const histoire = defineHistoireStory(CalendarChromatic)

describe('calendar histoire story', () => {
  histoire.it('renders every calendar on the month its value or placeholder names', ({ title, cells, cell }) => {
    expect(title).toBe('Calendar/Chromatic')
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
      'Pagination functions',
    ])

    const heading = (name: string) => cell(name).get('button + div').textContent?.trim()
    const selected = (name: string) => cell(name).getAll('[data-selected]').map(el => el.textContent?.trim())
    const today = (name: string) => cell(name).getAll('[data-today]:not([data-outside-view])').map(el => el.textContent?.trim())

    // Value-driven months.
    for (const name of ['Uncontrolled (modelValue)', 'Controlled (modelValue)', 'Default value', 'Fixed weeks', 'Prevent deselection', 'Multiple selection', 'Pagination functions']) {
      expect(heading(name), `${name}: heading`).toBe('February 2024')
      expect(selected(name), `${name}: selected day`).toEqual(['20'])
      expect(today(name), `${name}: pinned today`).toEqual(['14'])
    }
    // A placeholder wins over the value for the month in view.
    for (const name of ['Uncontrolled (placeholder)', 'Controlled (placeholder)']) {
      expect(heading(name), `${name}: heading`).toBe('April 2024')
      expect(selected(name), `${name}: value is off-view`).toEqual([])
    }
    // No value, no placeholder: the pinned clock decides.
    for (const name of ['Empty default', 'Disabled']) {
      expect(heading(name), `${name}: heading`).toBe('February 2024')
      expect(selected(name), `${name}: nothing selected`).toEqual([])
      expect(today(name), `${name}: pinned today`).toEqual(['14'])
    }
    expect(heading('Localization')).toBe('Februar 2024')

    // Every February 2024 grid is five rows; fixed weeks pads to six.
    const rows = (name: string) => cell(name).getAll('tbody tr').length
    expect(rows('Default value')).toBe(5)
    expect(rows('Fixed weeks')).toBe(6)

    const disabled = cell('Disabled')
    expect(disabled.get('[data-variant-frame] > *').hasAttribute('data-disabled')).toBe(true)
    expect(disabled.getAll('[data-reka-calendar-cell-trigger]:not([data-disabled])'), 'every day disabled').toHaveLength(0)
    expect(cells.filter(c => c.get('[data-variant-frame] > *').hasAttribute('data-disabled'))).toHaveLength(1)

    // Nav icons come from the preloaded radix set, not the network.
    expect(cells.flatMap(c => c.getAll('svg.iconify--radix-icons'))).toHaveLength(24)
  })
})
