import type { VisualCell } from '@/test/visual'
import { describe, expect, it } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import AccordionChromatic from './story/AccordionChromatic.story.vue'

/**
 * Histoire's Chromatic story: twelve accordions covering single/multiple,
 * controlled/uncontrolled, the disabled combinations and the scoped
 * `*-attr` state-attribute styling. Open content is instant — the test CSS
 * compiles `animate-*` to nothing — so every open panel is fully laid out.
 */
const histoire = defineHistoireStory(AccordionChromatic)

function openTriggers(c: VisualCell<{ name: string }>) {
  return c.getAll('button[aria-expanded="true"]').map(b => b.textContent?.trim())
}
function disabledTriggers(c: VisualCell<{ name: string }>) {
  return c.getAll('button[aria-expanded]:disabled').map(b => b.textContent?.trim())
}

describe('accordion histoire story', () => {
  histoire.it('renders every accordion with the open and disabled items the props dictate', ({ title, cells, cell }) => {
    expect(title).toBe('Accordion/Chromatic')
    expect(cells.map(c => c.name)).toEqual([
      'Uncontrolled (Single closed)',
      'Uncontrolled (Single open)',
      'Uncontrolled (Multiple closed)',
      'Uncontrolled (Multiple open)',
      'Controlled (Single open)',
      'Controlled (Multiple open)',
      'Disabled (whole)',
      'Disabled (item)',
      'Disabled (with `disabled=false` on top-level)',
      'State attributes (Accordion disabled)',
      'State attributes (Accordion enabled with item override)',
      'State attributes (Accordion disabled with item override)',
    ])

    for (const c of cells)
      expect(c.getAll('button[aria-expanded]'), `${c.name}: four triggers`).toHaveLength(4)

    const expectedOpen: Record<string, string[]> = {
      'Uncontrolled (Single closed)': [],
      'Uncontrolled (Single open)': ['Two'],
      'Uncontrolled (Multiple closed)': [],
      'Uncontrolled (Multiple open)': ['One', 'Two'],
      'Controlled (Single open)': ['Three'],
      'Controlled (Multiple open)': ['Two', 'Three'],
      'Disabled (whole)': [],
      'Disabled (item)': [],
      'Disabled (with `disabled=false` on top-level)': [],
      'State attributes (Accordion disabled)': ['Two'],
      'State attributes (Accordion enabled with item override)': ['Two'],
      'State attributes (Accordion disabled with item override)': ['Two'],
    }
    for (const [name, open] of Object.entries(expectedOpen)) {
      const c = cell(name)
      expect(openTriggers(c), `${name}: open items`).toEqual(open)
      // Every open panel is a laid-out region. (At initial mount the open
      // region carries no `data-state` at all — CollapsibleContent omits it
      // while `skipAnimation` holds — so `hidden` is the discriminator.)
      const regions = c.getAll('[role="region"]:not([hidden])')
      expect(regions, `${name}: open regions`).toHaveLength(open.length)
      for (const region of regions)
        expect(region.getBoundingClientRect().height, `${name}: region has height`).toBeGreaterThan(20)
      // Closed panels stay mounted, `hidden`, `data-state="closed"`, and take
      // no space — except in the "State attributes" variants, whose scoped
      // `.content-attr { display: block }` overrides `hidden` on purpose so the
      // closed state shows as an empty 2px-red-bordered, 10px-padded box.
      const closed = c.getAll('[role="region"][hidden]')
      expect(closed, `${name}: closed regions`).toHaveLength(4 - open.length)
      const closedHeight = name.startsWith('State attributes') ? 24 : 0
      for (const region of closed) {
        expect(region.getAttribute('data-state'), `${name}: closed region state`).toBe('closed')
        expect(region.getBoundingClientRect().height, `${name}: closed region box`).toBe(closedHeight)
      }
    }

    // Item-level `disabled` is OR-ed with the root's, so `:disabled="false"`
    // on an item cannot re-enable it under a disabled root.
    const expectedDisabled: Record<string, string[]> = {
      'Disabled (whole)': ['One', 'Two', 'Three', 'Four'],
      'Disabled (item)': ['Two'],
      'Disabled (with `disabled=false` on top-level)': ['Two'],
      'State attributes (Accordion disabled)': ['One', 'Two', 'Three', 'Four'],
      'State attributes (Accordion enabled with item override)': ['Two', 'Four'],
      'State attributes (Accordion disabled with item override)': ['One', 'Two', 'Three', 'Four'],
    }
    for (const c of cells)
      expect(disabledTriggers(c), `${c.name}: disabled items`).toEqual(expectedDisabled[c.name] ?? [])
  })
})

// Not a sheet: a second mount of the same story, asserting the one relation
// the screenshot cannot show. Every trigger's `aria-controls` is "" at rest —
// CollapsibleRoot's non-reactive `contentId` is filled in by the content
// *after* the trigger's first render — and only a re-render repairs it.
describe('accordion trigger relations at rest', () => {
  // @finding Accordion/Accordion.visual.browser.test.ts#aria-controls-empty-at-rest
  it.fails('links every trigger to its region with aria-controls before any interaction', async () => {
    const { cells } = await histoire.mount()
    for (const c of cells) {
      const regionIds = c.getAll('[role="region"]').map(r => r.id)
      expect(regionIds.every(Boolean), `${c.name}: regions have ids`).toBe(true)
      expect(c.getAll('button[aria-expanded]').map(b => b.getAttribute('aria-controls')), `${c.name}: aria-controls`).toEqual(regionIds)
    }
  })
})
