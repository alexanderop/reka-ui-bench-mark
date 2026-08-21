import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import StepperChromatic from './story/StepperChromatic.story.vue'

/**
 * Histoire's Chromatic story through `_DummyStepper.vue`: five steps with
 * radix icons, the active/completed/inactive states driven by the value.
 */
// One column: five horizontal steps with descriptions need the full sheet width.
const histoire = defineHistoireStory(StepperChromatic, { columns: 1 })

describe('stepper histoire story', () => {
  histoire.it('renders five steps per stepper with the states the value dictates', ({ title, cells, cell }) => {
    expect(title).toBe('Stepper/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Uncontrolled',
      'Controlled',
      'Empty default',
      'Default value',
      'Linear',
      'Free',
      'Vertical',
    ])

    const states = (name: string) => cell(name).getAll('[data-variant-frame] > * > [data-state]').map(i => i.getAttribute('data-state'))
    for (const name of ['Uncontrolled', 'Controlled', 'Default value'])
      expect(states(name), `${name}: step 2 active`).toEqual(['completed', 'active', 'inactive', 'inactive', 'inactive'])
    for (const name of ['Empty default', 'Linear', 'Free', 'Vertical'])
      expect(states(name), `${name}: step 1 active by default`).toEqual(['active', 'inactive', 'inactive', 'inactive', 'inactive'])

    for (const c of cells) {
      expect(c.getAll('svg.iconify--radix-icons'), `${c.name}: five icons`).toHaveLength(5)
      expect(c.getAll('button').map(b => b.querySelector('h4')?.textContent?.trim()), `${c.name}: titles`)
        .toEqual(['Address', 'Shipping', 'Trade-in', 'Payment', 'Checkout'])
    }

    const vertical = cell('Vertical')
    expect(vertical.get('[data-orientation]').getAttribute('data-orientation')).toBe('vertical')
    expect(cells.filter(c => c.get('[data-orientation]').getAttribute('data-orientation') === 'vertical')).toHaveLength(1)
    // Vertical stacks the steps: the last title is below the first.
    const titles = vertical.getAll('button')
    expect(titles[4].getBoundingClientRect().top).toBeGreaterThan(titles[0].getBoundingClientRect().bottom)
  })
})
