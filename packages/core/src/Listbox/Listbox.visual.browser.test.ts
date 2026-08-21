import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import ListboxChromatic from './story/ListboxChromatic.story.vue'

/**
 * Histoire's Chromatic story: eleven listboxes over the first twenty
 * countries, nothing selected until a user acts — the sheet is the resting
 * state of each configuration, first item highlighted.
 */
const histoire = defineHistoireStory(ListboxChromatic)

describe('listbox histoire story', () => {
  histoire.it('renders every listbox with twenty resting options', ({ title, cells, cell }) => {
    expect(title).toBe('Listbox/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Uncontrolled (Single)',
      'Uncontrolled (Multiple)',
      'Controlled (Single)',
      'Controlled (Multiple)',
      'Object (Single)',
      'Object (Multiple)',
      'Replace behavior (Single)',
      'Replace behavior (Multiple)',
      'Highlight on hover',
      'Highlight imperative',
      'Orientation (Horizontal)',
    ])

    for (const c of cells) {
      const options = c.getAll('[role="option"]')
      expect(options, `${c.name}: twenty options`).toHaveLength(20)
      expect(options[0].textContent?.trim(), `${c.name}: first country`).toBe('Afghanistan')
      expect(c.getAll('[role="option"][aria-selected="true"]'), `${c.name}: nothing selected`).toHaveLength(0)
      // The root highlights its first item on mount, before any interaction.
      expect(c.getAll('[role="option"][data-highlighted]').map(o => o.textContent?.trim()), `${c.name}: first item highlighted`).toEqual(['Afghanistan'])
    }

    const multiple = cells.filter(c => c.get('[role="listbox"]').getAttribute('aria-multiselectable') === 'true').map(c => c.name)
    expect(multiple).toEqual(['Uncontrolled (Multiple)', 'Controlled (Multiple)', 'Object (Multiple)', 'Replace behavior (Multiple)'])
    expect(cell('Orientation (Horizontal)').get('[role="listbox"]').getAttribute('aria-orientation')).toBe('horizontal')
    expect(cells.filter(c => c.get('[role="listbox"]').getAttribute('aria-orientation') === 'horizontal')).toHaveLength(1)
    expect(cell('Highlight imperative').get('button').textContent?.trim()).toBe('Select "Anguilla"')

    // The vertical lists overflow their `h-72` root box: real scroll geometry.
    const root = cell('Uncontrolled (Single)').get('[data-variant-frame] > *')
    expect(root.getBoundingClientRect().height, '18rem box').toBe(288)
    expect(root.scrollHeight, 'twenty rows overflow it').toBeGreaterThan(root.clientHeight)
  })
})
