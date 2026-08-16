import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import Slider from './Slider/story/_Slider.vue'

// Harness check, not a port — there is no jsdom counterpart and `port:parity`
// reports it as unpaired, same as `smoke.browser.test.ts`.
//
// Guards the CSS shim (`vitest.browser.css` + `tailwind.browser.config.js`,
// imported from `vitest.browser.setup.ts`). Story fixtures are styled with
// Tailwind classes that only Histoire ever compiled. With the shim removed
// this fixture measures 0x0 in Chromium — verified — and Playwright refuses to
// click a zero-size element, so every geometry-dependent test fails at once
// with an error that looks nothing like its cause.
//
// If this file starts failing, fix the CSS pipeline before touching any port.
describe('browser harness', () => {
  it('compiles the story fixtures Tailwind classes', async () => {
    const screen = await render(Slider, { props: { disabled: false } })

    const root = screen.container.querySelector('[data-slider-impl]') as HTMLElement
    const thumb = screen.getByRole('slider').element() as HTMLElement

    // `w-[200px] h-5` on the root, `w-5 h-5` on the thumb
    expect(root.getBoundingClientRect()).toMatchObject({ width: 200, height: 20 })
    expect(thumb.getBoundingClientRect()).toMatchObject({ width: 20, height: 20 })

    // the whole point: this throws if the element has no box
    await screen.getByRole('slider').click()
  })
})
