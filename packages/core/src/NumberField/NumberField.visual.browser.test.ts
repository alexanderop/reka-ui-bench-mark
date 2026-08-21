import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import NumberFieldChromatic from './story/NumberFieldChromatic.story.vue'

/**
 * Histoire's Chromatic story: eleven number fields whose one visible output
 * is the formatted input value — decimal, percent, accounting currency and
 * long units through `Intl.NumberFormat` in en-US.
 */
const histoire = defineHistoireStory(NumberFieldChromatic)

describe('numberField histoire story', () => {
  histoire.it('renders every field with its formatted value and both stepper buttons', ({ title, cells, cell }) => {
    expect(title).toBe('NumberField/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Uncontrolled',
      'Controlled',
      'Decimal',
      'Percentage',
      'Currency values',
      'Units',
      'Minimum',
      'Maximum',
      'Step (3)',
      'Step (3) + Minimum (2)',
      'Step (3) + Minimum (2) + Maximum (21)',
    ])

    const value = (name: string) => cell(name).get<HTMLInputElement>('input').value
    expect(value('Uncontrolled')).toBe('5')
    expect(value('Controlled')).toBe('5')
    expect(value('Decimal'), 'signDisplay exceptZero, one fraction digit').toBe('0.0')
    expect(value('Percentage')).toBe('5%')
    // Intl joins the code and the amount with a no-break space.
    expect(value('Currency values'), 'code display, accounting sign').toBe('EUR\u00A05.00')
    expect(value('Units')).toBe('5 inches')
    expect(value('Minimum')).toBe('5')
    expect(value('Maximum')).toBe('5')
    for (const name of ['Step (3)', 'Step (3) + Minimum (2)', 'Step (3) + Minimum (2) + Maximum (21)'])
      expect(value(name), `${name}: no value`).toBe('')

    for (const c of cells) {
      expect(c.getAll('button'), `${c.name}: decrement + increment`).toHaveLength(2)
      expect(c.getAll('svg.iconify--radix-icons'), `${c.name}: preloaded icons`).toHaveLength(2)
    }
  })
})
