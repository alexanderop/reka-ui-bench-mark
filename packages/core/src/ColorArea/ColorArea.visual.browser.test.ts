import { describe, expect } from 'vitest'
import { centerOf, defineHistoireStory } from '@/test/visual'
import ColorAreaDemo from './story/ColorAreaDemo.story.vue'

/**
 * Histoire's demo: HSL/HSB/RGB channel pairs and the disabled state, through
 * the `_ColorArea.vue` fixture with its Tailwind styling. The two-axis
 * gradient is the component's own derivation; the screenshot pins it, the
 * assertions pin that every thumb sits inside its area.
 */
const histoire = defineHistoireStory(ColorAreaDemo)

describe('colorArea histoire story', () => {
  histoire.it('renders every channel-pair demo with a gradient area and a thumb inside it', ({ title, cells, cell }) => {
    expect(title).toBe('ColorArea/Demo')
    expect(cells).toHaveLength(7)
    for (const c of cells) {
      const area = c.get('[role="application"]')
      expect(getComputedStyle(area).backgroundImage, `${c.name}: area gradient`).toContain('linear-gradient')
      const thumb = centerOf(c.get('[role="slider"]'))
      const areaRect = area.getBoundingClientRect()
      expect(thumb.x, `${c.name}: thumb x inside area`).toBeGreaterThanOrEqual(areaRect.left)
      expect(thumb.x, `${c.name}: thumb x inside area`).toBeLessThanOrEqual(areaRect.right)
      expect(thumb.y, `${c.name}: thumb y inside area`).toBeGreaterThanOrEqual(areaRect.top)
      expect(thumb.y, `${c.name}: thumb y inside area`).toBeLessThanOrEqual(areaRect.bottom)
    }
    expect(cell('Disabled').get('[role="slider"]').hasAttribute('data-disabled'), 'disabled thumb').toBe(true)
    expect(cells.filter(c => c.get('[role="slider"]').hasAttribute('data-disabled'))).toHaveLength(1)
  })
})
