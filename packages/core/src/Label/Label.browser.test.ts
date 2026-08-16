import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import Label from './Label.vue'

// Browser-mode port of `Label.test.ts` — the T2 trial run from PORTING.md
// phase 1. The original installs no stubs, so there is nothing to delete; what
// it exercises is `<label for>` activation, which is browser behaviour rather
// than component behaviour, and the port is the first one to actually put it
// in a browser.
//
// Three things it needed that the translation table did not cover, all three
// now added there:
//
//  - The original uses `@testing-library/vue`'s `render`, not VTU's `mount`,
//    and calls `.html()` on the result. `vitest-browser-vue` exposes no VTU
//    wrapper and therefore no `.html()` — see `rootOf` below.
//  - Its `beforeEach(() => { document.body.innerHTML = '' })` is deleted:
//    `render` unmounts and removes its container after every test.
//  - The two click tests give their label a text slot, which the original does
//    not. That is forced, not cosmetic — see the note on the first of them.

/**
 * The component root, i.e. what VTU's `wrapper.html()` prints — which is what
 * `@testing-library/vue` returns from `html()` (`dist/render.js:53` is
 * literally `html: () => wrapper.html()`).
 *
 * `vitest-browser-vue` returns locators and a `container`, no wrapper, so
 * there is no equivalent method. `outerHTML` on the mounted root is the exact
 * translation: `render` unwraps VTU's intermediate node, so the component root
 * is a direct child of `container`. A locator assertion is not a substitute
 * here — the original pins the *entire* rendered output, and
 * `toHaveAttribute` would check one attribute and let extra ones through.
 */
function rootOf(screen: { container: Element }): HTMLElement {
  return screen.container.firstElementChild as HTMLElement
}

describe('test label functionalities', () => {
  it('should pass axe accessibility tests', async () => {
    const screen = await render(
      defineComponent({
        setup() {
          return () =>
            h('div', [
              h(Label, { for: 'input' }, { default: () => 'Label' }),
              h('input', { id: 'input' }),
            ])
        },
      }),
    )
    expect(await axe(screen.container)).toHaveNoViolations()
  })

  it('should render without crashing', async () => {
    const label = await render(Label)
    expect(rootOf(label).outerHTML).toBe('<label></label>')
  })

  it('should render with a default slot', async () => {
    const label = await render(Label, { slots: { default: 'Label' } })
    expect(rootOf(label).outerHTML).toBe('<label>Label</label>')
  })

  it('should render with a `for` attribute', async () => {
    const label = await render(Label, { props: { for: 'input' } })
    expect(rootOf(label).outerHTML).toBe('<label for="input"></label>')
  })

  it('should render with a `for` attribute and a default slot', async () => {
    const label = await render(Label, {
      props: { for: 'input' },
      slots: { default: 'Label' },
    })
    expect(rootOf(label).outerHTML).toBe('<label for="input">Label</label>')
  })

  // The two click tests below add a text slot the original does not have, and
  // click through the locator API rather than calling `HTMLElement.click()`.
  //
  // Both are forced by the same measurement: an empty `<label>` is 0px wide in
  // Chromium (probed: `0x18` — zero width, full line-height), and Playwright
  // refuses to click a zero-size element, so `locator.click()` times out. The
  // original clicks an element no user could ever hit; jsdom's `.click()`
  // dispatches on anything, size included. Recorded as
  // `Label/Label.test.ts#empty-label-unclickable`.
  //
  // The assertions are unchanged and are not vacuous: the same real click on a
  // label whose `for` DOES match focuses the input (probed), so these two are
  // discriminating rather than passing because nothing happened.
  it('should not focus the input when click on the label without a `for` attribute', async () => {
    const screen = await render(
      defineComponent({
        setup() {
          return () =>
            h('div', [
              h(Label, null, { default: () => 'Label' }),
              h('input', { id: 'input' }),
            ])
        },
      }),
    )

    await screen.getByText('Label').click()
    expect(screen.container.querySelector('input')).not.toBe(document.activeElement)
  })

  it('should not focus the input when click on the label with a `for` attribute that does not match any input', async () => {
    const screen = await render(
      defineComponent({
        setup() {
          return () =>
            h('div', [
              h(Label, { for: 'input' }, { default: () => 'Label' }),
              h('input', { id: 'input2' }),
            ])
        },
      }),
    )

    await screen.getByText('Label').click()
    expect(screen.container.querySelector('input')).not.toBe(document.activeElement)
  })
})
