import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import AspectRatioStory from './story/AspectRatio.story.vue'

/**
 * The component as Histoire shows it. The story loads a remote Unsplash
 * photo, so its pixels are masked — the ratio wrapper's geometry is what the
 * sheet pins, and the absolutely positioned `<img>` cannot change it.
 *
 * The neutral sheet host is load-bearing here: rendered directly through
 * `vitest-browser-vue`, `AspectRatio`'s forwarded `$el` can make the harness
 * unwrap the real ratio wrapper and leave a 414×0 false-green mount.
 */
const histoire = defineHistoireStory(AspectRatioStory, { mask: ['img'] })

describe('aspectRatio histoire story', () => {
  histoire.it('renders the Histoire demo at its 16:9 ratio', ({ title, cells, cell }) => {
    expect(title).toBe('Aspect Ratio/Demo')
    expect(cells.map(c => c.name)).toEqual(['default'])
    const rect = cell('default').rect('[data-reka-aspect-ratio-wrapper]')
    expect(rect.width / rect.height, 'wrapper ratio').toBeCloseTo(16 / 9, 2)
  })
})
