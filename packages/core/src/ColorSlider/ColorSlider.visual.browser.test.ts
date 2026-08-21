import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import ColorSliderDemo from './story/ColorSliderDemo.story.vue'

/**
 * Histoire's demo: three compound slider sets (4 channels each) plus twelve
 * single-channel sliders, through the `_ColorSlider*.vue` fixtures. The
 * track gradient is component-authored (`getSliderBackgroundStyle`) and is
 * the product output the screenshot pins.
 */
const histoire = defineHistoireStory(ColorSliderDemo)

describe('colorSlider histoire story', () => {
  histoire.it('renders every channel demo with a gradient track', ({ title, cells, cell }) => {
    expect(title).toBe('ColorSlider/Demo')
    expect(cells).toHaveLength(15)
    // 3 compound variants × 4 channels + 12 single-channel variants.
    const sliders = cells.flatMap(c => c.getAll('[role="slider"]'))
    expect(sliders).toHaveLength(24)
    for (const c of cells) {
      for (const track of c.getAll('[data-reka-color-slider-track]'))
        expect(getComputedStyle(track).backgroundImage, `${c.name}: track gradient`).toContain('linear-gradient')
    }
    expect(cell('Vertical').get('[role="slider"]').getAttribute('aria-orientation')).toBe('vertical')
    expect(cell('Disabled').get('[role="slider"]').hasAttribute('data-disabled')).toBe(true)
  })
})
