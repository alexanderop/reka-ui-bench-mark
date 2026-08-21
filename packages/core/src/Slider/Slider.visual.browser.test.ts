import { describe, expect } from 'vitest'
import { centerOf, defineHistoireStory } from '@/test/visual'
import SliderChromatic from './story/SliderChromatic.story.vue'

/**
 * Histoire's Chromatic story: thirteen Tailwind-styled sliders straight from
 * the story file. The story's thumbs are `w-5` (20px) on a `w-[200px]` root,
 * so the expected thumb centre is root.left + 10 + 180 × fraction.
 */
const histoire = defineHistoireStory(SliderChromatic)

describe('slider histoire story', () => {
  histoire.it('renders every chromatic variant with thumbs at their values', async ({ title, cells, cell }) => {
    expect(title).toBe('Slider/Chromatic')
    expect(cells).toHaveLength(13)
    expect(cells.flatMap(c => c.getAll('[role="slider"]'))).toHaveLength(20)

    // The thumb's in-bounds offset comes from `useSize` measuring the thumb
    // through a ResizeObserver, so the final position lands a frame after
    // mount (measured: 81 → 87 px). Poll for it.
    const travel = (root: DOMRect, fraction: number) => root.left + 10 + (root.width - 20) * fraction
    const ltr = cell('Uncontrolled (LTR)')
    const ltrRoot = ltr.rect('[data-orientation="horizontal"]')
    await expect.poll(() => centerOf(ltr.get('[role="slider"]')).x, { message: 'LTR default 20 → 0.2' })
      .toBeNear(travel(ltrRoot, 0.2))

    const rtl = cell('Uncontrolled (RTL) ')
    const rtlRoot = rtl.rect('[data-orientation="horizontal"]')
    await expect.poll(() => centerOf(rtl.get('[role="slider"]')).x, { message: 'RTL default 20 → 0.8 from the left' })
      .toBeNear(travel(rtlRoot, 0.8))

    const vertical = cell('Vertical Overflow')
    expect(vertical.get('[role="slider"]').getAttribute('aria-orientation')).toBe('vertical')
  })
})
