import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import RatingChromatic from './story/RatingChromatic.story.vue'

/**
 * Histoire's Chromatic story through `_Rating.vue`: star icons from the
 * preloaded radix set, one indicator per step, coloured by `data-state`.
 */
const histoire = defineHistoireStory(RatingChromatic)

describe('rating histoire story', () => {
  histoire.it('renders one star per step and lights the default value', ({ title, cells, cell }) => {
    expect(title).toBe('Rating/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Steps',
      'Uncontrolled',
      'Clerable',
      'Hoverable',
      'Length of 3',
      'Disabled',
      'Combination',
      'Disabled combination',
    ])

    // Items × steps per item.
    const expectedIndicators: Record<string, number> = {
      'Steps': 5 * 4,
      'Uncontrolled': 5,
      'Clerable': 5,
      'Hoverable': 5,
      'Length of 3': 3,
      'Disabled': 5,
      'Combination': 10 * 2,
      'Disabled combination': 10 * 2,
    }
    for (const c of cells) {
      const icons = c.getAll('svg.iconify--radix-icons')
      expect(icons, `${c.name}: star per step`).toHaveLength(expectedIndicators[c.name])
      for (const icon of icons)
        expect(icon.getBoundingClientRect().width, `${c.name}: star painted`).toBeGreaterThan(0)
    }

    const active = (name: string) => cell(name).getAll('[data-state="active"]').length
    expect(active('Uncontrolled'), 'default 3 of 5').toBe(3)
    expect(active('Clerable')).toBe(3)
    for (const name of ['Steps', 'Hoverable', 'Length of 3', 'Disabled', 'Combination', 'Disabled combination'])
      expect(active(name), `${name}: nothing lit`).toBe(0)

    expect(cells.filter(c => c.el.querySelector('[data-disabled]')).map(c => c.name)).toEqual(['Disabled', 'Disabled combination'])
  })
})
