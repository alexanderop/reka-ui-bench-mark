import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import ScrollAreaChromatic from './story/ScrollAreaChromatic.story.vue'
import ScrollAreaChromaticBoth from './story/ScrollAreaChromaticBoth.story.vue'
import ScrollAreaChromaticHorizontal from './story/ScrollAreaChromaticHorizontal.story.vue'
import ScrollAreaChromaticVertical from './story/ScrollAreaChromaticVertical.story.vue'

/**
 * Histoire's four Chromatic stories, through the `_ScrollAreaStory.vue`
 * fixture: lorem text, so thumb geometry here carries font metrics — which
 * is why these are screenshots per platform, with the assertions limited to
 * which bars are visible rather than where the thumbs sit.
 */
const VISIBLE_BAR = '[data-orientation][data-state="visible"]'

const chromatic = defineHistoireStory(ScrollAreaChromatic)
const both = defineHistoireStory(ScrollAreaChromaticBoth)
const horizontal = defineHistoireStory(ScrollAreaChromaticHorizontal)
const vertical = defineHistoireStory(ScrollAreaChromaticVertical)

/**
 * `type="auto"` decides visibility from a ResizeObserver measurement, so the
 * bars appear a frame after mount — poll, with the empty case polled too so a
 * late-appearing bar cannot slip past a one-shot read.
 */
async function expectBars(cell: { name: string, getAll: (s: string) => HTMLElement[] }, orientations: string[]) {
  await expect.poll(
    () => cell.getAll(VISIBLE_BAR).map(bar => bar.getAttribute('data-orientation')).sort(),
    { message: `${cell.name}: visible scrollbars` },
  ).toEqual([...orientations].sort())
}

describe('scrollArea histoire story', () => {
  chromatic.it('renders the min-thumb, RTL and ellipsis cases with always-visible bars', async ({ title, cells, cell }) => {
    expect(title).toBe('Scroll Area/Chromatic')
    expect(cells).toHaveLength(5)
    for (const name of ['Min thumb size', 'RTL (prop)', 'RTL (inherited)', 'Ellipsis at content width'])
      await expectBars(cell(name), ['vertical', 'horizontal'])
    await expectBars(cell('Ellipsis at viewport width'), ['vertical'])
    for (const name of ['RTL (prop)', 'RTL (inherited)'])
      expect(cell(name).get('[data-orientation="vertical"]').closest('[dir="rtl"]'), `${name}: rtl`).not.toBeNull()
  })

  both.it('shows both bars only where the type and the overflow call for them', async ({ title, cells, cell }) => {
    expect(title).toBe('Scroll Area/Chromatic/Both')
    expect(cells).toHaveLength(8)
    await expectBars(cell('Both (Auto with overflow)'), ['vertical', 'horizontal'])
    await expectBars(cell('Both (Always with overflow)'), ['vertical', 'horizontal'])
    for (const name of ['Both (Auto without overflow)', 'Both (Scroll with overflow)', 'Both (Scroll without overflow)', 'Both (Hover with overflow)', 'Both (Hover without overflow)'])
      await expectBars(cell(name), [])
    expect(cell('untitled').getAll('*'), 'Histoire placeholder cell stays empty').toHaveLength(2)
  })

  horizontal.it('shows the horizontal bar only where the type and the overflow call for it', async ({ title, cells, cell }) => {
    expect(title).toBe('Scroll Area/Chromatic/Horizontal')
    expect(cells).toHaveLength(8)
    await expectBars(cell('Horizontal (Auto with overflow)'), ['horizontal'])
    await expectBars(cell('Horizontal (Always with overflow)'), ['horizontal'])
    for (const name of ['Horizontal (Auto without overflow)', 'Horizontal (Scroll with overflow)', 'Horizontal (Scroll without overflow)', 'Horizontal (Hover with overflow)', 'Horizontal (Hover without overflow)'])
      await expectBars(cell(name), [])
  })

  vertical.it('shows the vertical bar only where the type and the overflow call for it', async ({ title, cells, cell }) => {
    expect(title).toBe('Scroll Area/Chromatic/Vertical')
    expect(cells).toHaveLength(8)
    await expectBars(cell('Vertical (Auto with overflow)'), ['vertical'])
    await expectBars(cell('Vertical (Always with overflow)'), ['vertical'])
    for (const name of ['Vertical (Auto without overflow)', 'Vertical (Scroll with overflow)', 'Vertical (Scroll without overflow)', 'Vertical (Hover with overflow)', 'Vertical (Hover without overflow)'])
      await expectBars(cell(name), [])
  })
})
