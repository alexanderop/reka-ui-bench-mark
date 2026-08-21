import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import EditableChromatic from './story/EditableChromatic.story.vue'

/**
 * Histoire's Chromatic story through `_DummyEditable.vue`: thirteen editables,
 * all in preview mode except "Start in edit mode", which renders the input
 * with its submit/cancel pair.
 */
const histoire = defineHistoireStory(EditableChromatic)

describe('editable histoire story', () => {
  histoire.it('renders every editable in preview mode except the one that starts editing', ({ title, cells, cell }) => {
    expect(title).toBe('Editable/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Uncontrolled (modelValue)',
      'Controlled (modelValue)',
      'Empty default',
      'Default value',
      'Edit on focus',
      'Edit on double click',
      'Submit on blur',
      'Submit on enter',
      'Select on focus',
      'Disabled',
      'Start in edit mode',
      'Read only',
      'Auto resize',
    ])

    for (const c of cells) {
      const editing = c.name === 'Start in edit mode'
      const inputs = c.getAll<HTMLInputElement>('input')
      const buttons = c.getAll('button').map(b => b.textContent?.trim())
      if (editing) {
        expect(inputs.map(i => i.value), `${c.name}: input with the value`).toEqual(['Default value'])
        expect(buttons, `${c.name}: submit + cancel`).toEqual(['Submit', 'Cancel'])
      }
      else {
        expect(c.getAll('[tabindex="0"][data-placeholder-shown]:not([hidden])'), `${c.name}: preview shown`).toHaveLength(1)
        expect(buttons, `${c.name}: edit trigger`).toEqual(['Edit'])
      }
    }

    const preview = (name: string) => cell(name).get('[tabindex="0"][data-placeholder-shown]').textContent?.trim()
    expect(preview('Default value')).toBe('Default value')
    expect(preview('Empty default'), 'default placeholder').toBe('Enter text...')

    expect(cells.filter(c => c.el.querySelector('[data-disabled]')).map(c => c.name)).toEqual(['Disabled'])
    expect(cells.filter(c => c.el.querySelector('[data-readonly]')).map(c => c.name)).toEqual(['Read only'])
  })
})
