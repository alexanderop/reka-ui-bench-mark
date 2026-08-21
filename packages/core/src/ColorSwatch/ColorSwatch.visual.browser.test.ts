import { describe, expect, it, vi } from 'vitest'
import { defineHistoireStory } from '@/test/visual'
import ColorSwatchDemo from './story/ColorSwatchDemo.story.vue'

/**
 * The swatch's one product output is actual rendered color — the only place
 * in the library where color itself, not geometry or ARIA, is the contract.
 * Histoire's demo: 19 swatches across seven variants, including transparent,
 * empty-string and HSL-object inputs.
 *
 * Literal expected values on purpose: comparing against the component's own
 * color parsing would move actual and expected together.
 */
const histoire = defineHistoireStory(ColorSwatchDemo)

describe('colorSwatch histoire story', () => {
  // Plain `it` + `histoire.mount()`: the spy has to be installed *before* the
  // render, because the warnings fire during it.
  it('renders every demo swatch as an image with the CSS color var set', async () => {
    // The swatch's DEV-only contrast helper parses 6-digit hex only, so every
    // 8-digit or non-hex input in the demo warns. Capture, then assert the
    // count and that nothing else hid behind the spy.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { title, cells, cell, screenshot } = await histoire.mount()
    expect(title).toBe('ColorSwatch/Demo')
    expect(cells).toHaveLength(7)

    const swatches = cells.flatMap(c => c.getAll('[role="img"]'))
    expect(swatches).toHaveLength(19)
    expect(cell('Custom Label').get('[role="img"]').getAttribute('aria-label')).toBe('Brand Red')
    expect(getComputedStyle(cell('Default').get('[role="img"]')).backgroundColor).toBe('rgb(229, 72, 77)')

    const messages = warn.mock.calls.map(call => String(call[0]))
    expect(messages.every(m => m.includes('Unable to resolve contrast color')), messages.join('\n')).toBe(true)
    // Exactly the demo's non-6-digit-hex inputs, nothing more.
    expect(messages.map(m => /contrast color for "([^"]*)"/.exec(m)?.[1]).sort()).toEqual(
      ['#ff000000', '', '#E5484Dff', '#E5484Dcc', '#E5484D80', '#E5484D33'].sort(),
    )
    warn.mockRestore()

    await screenshot()
  })
})
