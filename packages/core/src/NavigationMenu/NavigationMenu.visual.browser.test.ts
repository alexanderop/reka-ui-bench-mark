import { describe, expect } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import NavigationMenuChromatic from './story/NavigationMenuChromatic.story.vue'

/**
 * Histoire's Chromatic story: the full `_NavigationMenu.vue` fixture, closed,
 * in its default / click-disabled / hover-disabled configurations.
 */
const histoire = defineHistoireStory(NavigationMenuChromatic)

describe('navigationMenu histoire story', () => {
  histoire.it('renders the three closed menus with every trigger collapsed', ({ title, cells }) => {
    expect(title).toBe('Navigation Menu/Chromatic')
    expect(cells.map(c => c.name)).toEqual(['Default', 'Disabled click trigger', 'Disabled hover trigger'])
    for (const c of cells) {
      const triggers = c.getAll('button[aria-expanded]')
      expect(triggers.length, `${c.name}: has triggers`).toBeGreaterThan(0)
      for (const trigger of triggers)
        expect(trigger.getAttribute('aria-expanded'), `${c.name}: "${trigger.textContent?.trim()}" closed`).toBe('false')
      expect(c.getAll('[data-reka-navigation-menu-content], [role="dialog"]'), `${c.name}: no open content`).toHaveLength(0)
    }
  })
})
