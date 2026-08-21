import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import SplitterChromatic from './story/SplitterChromatic.story.vue'

/**
 * Histoire's Chromatic story: horizontal, vertical and nested splitter
 * groups at their default equal split. Panel sizes are measured by the
 * group on mount, so the assertions poll for the settled `data-panel-size`.
 */
const histoire = defineHistoireStory(SplitterChromatic)

describe('splitter histoire story', () => {
  histoire.it('splits every group evenly between its panels', async ({ title, cells, cell }) => {
    expect(title).toBe('Splitter/Chromatic')
    expect(cells.map(c => c.name)).toEqual(['Horizontal', 'Vertical', 'Nested'])

    /** `data-panel-size` of the direct panels of a group (nested groups are panels too). */
    const sizes = (name: string, group = '[data-panel-group]') =>
      [...cell(name).get(group).children].filter(el => el.hasAttribute('data-panel')).map(p => p.getAttribute('data-panel-size'))

    await expect.poll(() => sizes('Horizontal'), { message: 'horizontal thirds' }).toEqual(['33.3', '33.3', '33.3'])
    await expect.poll(() => sizes('Vertical'), { message: 'vertical thirds' }).toEqual(['33.3', '33.3', '33.3'])
    // Nested: three outer panels, the middle one holding a two-panel vertical group.
    await expect.poll(() => sizes('Nested'), { message: 'outer thirds' }).toEqual(['33.3', '33.3', '33.3'])
    await expect.poll(() => sizes('Nested', '[data-panel] [data-panel-group]'), { message: 'inner halves' }).toEqual(['50.0', '50.0'])

    expect(cell('Horizontal').get('[data-panel-group]').getAttribute('data-orientation')).toBe('horizontal')
    expect(cell('Vertical').get('[data-panel-group]').getAttribute('data-orientation')).toBe('vertical')
    expect(cell('Horizontal').getAll('[role="separator"]')).toHaveLength(2)
    expect(cell('Nested').getAll('[role="separator"]')).toHaveLength(3)

    // Geometry: horizontal panels share the row, vertical ones share the column.
    const [a, b, c] = cell('Horizontal').getAll('[data-panel]').map(p => p.getBoundingClientRect())
    expect(a.width, 'equal widths').toBeNear(b.width)
    expect(b.width, 'equal widths').toBeNear(c.width)
    expect(a.top, 'same row').toBeNear(c.top)
    const [va, vb, vc] = cell('Vertical').getAll('[data-panel]').map(p => p.getBoundingClientRect())
    expect(va.height, 'equal heights').toBeNear(vb.height)
    expect(vb.height, 'equal heights').toBeNear(vc.height)
    expect(va.left, 'same column').toBeNear(vc.left)
  })
})
