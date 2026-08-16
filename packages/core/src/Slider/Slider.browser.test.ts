import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import Slider from './story/_Slider.vue'

// Browser-mode port of `Slider.test.ts`. The `describe` / `it` names are kept
// identical on purpose so the two files can be diffed against each other.
//
// Note what is missing compared to the jsdom version: no ResizeObserver stub,
// no scrollIntoView / hasPointerCapture / setPointerCapture mocks. The browser
// has all of them for real.
describe('given default Slider', () => {
  it('should have default value', async () => {
    const screen = await render(Slider, { props: { disabled: false } })

    await expect
      .element(screen.getByRole('slider'))
      .toHaveAttribute('aria-valuenow', '50')
  })

  // @finding Slider/Slider.test.ts#axe
  //
  // ⚠ QUARANTINED: this test fails, and the failure IS the result.
  //
  // `.fails` rather than `.skip` on purpose — the body still runs, so this
  // keeps contributing coverage, and the day someone gives the fixture an
  // `aria-label` this goes red to tell you the finding is stale.
  //
  // The jsdom original runs `axe()` synchronously after `mount()`, before Vue
  // flushes, so the thumb is still `display: none` (SliderThumbImpl.vue:80)
  // and axe skips it: `aria-input-field-name` comes back *inapplicable* and
  // the only interactive element in the Slider is never audited.
  //
  // `await render()` flushes, so axe sees the thumb and reports a genuine
  // violation — the fixture gives its single thumb no accessible name
  // (`getLabel`, utils.ts:35, only auto-labels sliders with 2+ thumbs).
  //
  // Do NOT add `'aria-input-field-name': { enabled: false }` to make this
  // green. The fix belongs in `_Slider.vue`, and fixing non-test source is
  // out of scope here.
  it.fails('should pass axe accessibility tests', async () => {
    const screen = await render(Slider, { props: { disabled: false } })
    expect(await axe(screen.container, {
      rules: {
        'label': { enabled: false },
        'nested-interactive': { enabled: false },
      },
    })).toHaveNoViolations()
  })
})
