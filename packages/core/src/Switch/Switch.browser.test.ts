import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { handleSubmit } from '@/test'
import Switch from './_Switch.vue'

// Browser-mode port of `Switch.test.ts`. A T2 file: the original installs no
// stubs, so nothing gets deleted. What it *does* need is three things the
// jsdom original got for free, all measured and all in `FINDINGS.tsv`:
//
//  1. Geometry. `_Switch.vue` styles nothing, and the browser project's
//     Tailwind preflight zeroes `button { padding }` and `* { border-width }`,
//     so the switch measures exactly 0×0 in Chromium and Playwright refuses to
//     click it — `force: true` fails too ("outside of the viewport"). Measured
//     against a `<button>` in a shadow root, where preflight cannot reach: the
//     UA default is 16×6, i.e. the CSS shim added in B3 to make fixtures
//     clickable is what makes *this* one unclickable. The style block below is
//     the smallest thing that restores a clickable box.
//     See `Switch/Switch.test.ts#zero-size-switch`.
//  2. `{ exact: true }` on every `getByText`. Vitest's locator `getByText`
//     defaults to a **substring** match where `@testing-library`'s defaults to
//     whole-string, so a literal port of `getByText('checked')` matches
//     `<p>unchecked</p>` and the toggle tests pass without toggling. Measured:
//     1 element vs 0. See `Switch/Switch.test.ts#getbytext-substring`.
//  3. Real assertions. `@testing-library`'s `getBy*` throws when it misses, so
//     a bare `screen.getByTestId('thumb')` *is* the assertion. A locator is
//     lazy and throws nothing, so the same line ports to a no-op. Every such
//     call is wrapped in `expect.element(...)` here.
//     See `Switch/Switch.test.ts#lazy-locator-vacuum`.

/**
 * The switch is 0×0 without this (see above). Scoped to the fixture's own
 * test id so it cannot leak into anything else, and torn down after the file.
 */
let geometry: HTMLStyleElement

beforeAll(() => {
  geometry = document.createElement('style')
  geometry.textContent = `
    [data-testid="root"] { display: inline-block; width: 40px; height: 24px; }
    [data-testid="thumb"] { display: inline-block; width: 16px; height: 16px; }
  `
  document.head.append(geometry)
})

afterAll(() => geometry.remove())

describe('test switch functionalities', () => {
  // The original's `document.body.innerHTML = ''` is gone: `render` registers
  // its own cleanup and every assertion below is scoped to `screen`, so there
  // is nothing document-wide left to reset.
  let screen: Awaited<ReturnType<typeof render<typeof Switch>>>

  beforeEach(async () => {
    screen = await render(Switch)
  })

  it('should pass axe accessibility tests', async () => {
    // `wrapper.element` in the original: `_Switch.vue` has two roots, so VTU
    // hands back its parent div — `screen.container` is the same thing.
    //
    // Not vacuous, in either environment — censused rather than assumed.
    // `button-name` runs and passes on both sides and the switch is the only
    // interactive element, so the audit does reach the component. Two honest
    // differences, neither a weakening:
    //   • Chromium adds `color-contrast(2)`, which jsdom reports inapplicable.
    //   • Chromium drops `aria-hidden-body` (the detached-mount artifact from
    //     `Separator#axe-context-detached-mount`) and `aria-hidden-focus`.
    //     The second one is a finding of its own: jsdom audits an unflushed
    //     DOM that still contains a `VisuallyHiddenInput` the component
    //     removes on the next tick — see `Switch/Switch.test.ts#transient-input`.
    // The two disabled rules are kept verbatim even though neither fires; see
    // `Switch/Switch.test.ts#dead-rule-exclusions`.
    expect(await axe(screen.container, {
      rules: {
        'label': { enabled: false },
        'nested-interactive': { enabled: false },
      },
    })).toHaveNoViolations()
  })

  it('thumb can render', async () => {
    // The original is a bare `screen.getByTestId('thumb')`, which asserts by
    // throwing. Locators do not throw, so the assertion has to be spelled out.
    await expect.element(screen.getByTestId('thumb')).toBeInTheDocument()
  })

  it('clicking thumb will toggle value', async () => {
    // The original clicks `container.querySelector('button')` — the root, not
    // the thumb the name promises. Rule 4 says fix the test, so this clicks the
    // thumb for real; the click bubbles to `SwitchRoot`'s `@click` exactly as
    // it does in production, and the gesture now matches the name.
    const thumb = screen.getByTestId('thumb')

    await expect.element(screen.getByText('unchecked', { exact: true })).toBeInTheDocument()

    await thumb.click()
    await expect.element(screen.getByText('checked', { exact: true })).toBeInTheDocument()

    await thumb.click()
    await expect.element(screen.getByText('unchecked', { exact: true })).toBeInTheDocument()
  })

  it('keydown enter root will toggle value', async () => {
    // jsdom fires `keydown` straight at the element; Playwright types into
    // whatever has focus. The switch is a real `<button>`, so it is natively
    // focusable and the keydown bubbles to `SwitchRoot`'s handler.
    //
    // This is the test the browser actually earns something on. Under jsdom a
    // keydown has no default action, so `@keydown.enter.prevent`'s `.prevent`
    // is inert and untested. In Chromium, Enter on a `<button>` *also*
    // synthesises a click — without `.prevent` the switch would toggle twice
    // and land back where it started. Mutation-verified; see
    // `Switch/Switch.test.ts#enter-prevent-untested-in-jsdom`.
    const root = screen.getByRole('switch')
    root.element().focus()

    await expect.element(screen.getByText('unchecked', { exact: true })).toBeInTheDocument()

    await userEvent.keyboard('{Enter}')
    await expect.element(screen.getByText('checked', { exact: true })).toBeInTheDocument()

    await userEvent.keyboard('{Enter}')
    await expect.element(screen.getByText('unchecked', { exact: true })).toBeInTheDocument()
  })
})

describe('given switch in a form', () => {
  // Two deliberate differences from the original, both following the `Slider`
  // precedent (`Slider/Slider.test.ts#form-submit-button`):
  //
  //  1. A real `<button type="submit">` replaces `form.trigger('submit')`, so
  //     `describe('after clicking submit button')` describes something a user
  //     does. It goes through the locator API like everything else.
  //  2. The fixture is rendered per test rather than once in the describe body,
  //     because `vitest-browser-vue` unmounts after every test. `handleSubmit`
  //     is a module-level `vi.fn()`, so its call count still accumulates across
  //     tests exactly as the original depends on — but the *switch state* does
  //     not, which is why the second block below has to check and then uncheck
  //     rather than inheriting a checked switch from the first.
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render({
      props: ['handleSubmit'],
      components: { Switch },
      template: '<form @submit="handleSubmit"><Switch /><button type="submit">Submit</button></form>',
    }, {
      props: { handleSubmit },
    })
  })

  it('should have hidden input field', async () => {
    // `VisuallyHiddenInput` is `aria-hidden="true"`, so the role query has to
    // opt into hidden elements — measured, 1 with `includeHidden` and 0
    // without. `[type="checkbox"]` has no locator equivalent.
    await expect
      .element(screen.getByRole('checkbox', { includeHidden: true }))
      .toBeInTheDocument()
  })

  it('should pass axe accessibility tests', async () => {
    // `wrapper.element` in the original: the `<form>`. Unlike the standalone
    // block this one disables nothing, and `nested-interactive` genuinely runs
    // here (2 nodes, passing) because the hidden input only exists inside a
    // form.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should not nest the hidden input inside the interactive control', () => {
    // No locator can express "a descendant that must not exist", so this is
    // the `container.querySelector` escape hatch. Mutation-verified: moving
    // `VisuallyHiddenInput` inside the `Primitive` slot turns this red.
    expect(screen.container.querySelector('button input')).toBe(null)
  })

  describe('after clicking submit button', () => {
    beforeEach(async () => {
      const sw = screen.getByRole('switch')
      await sw.click()
      // Settle Vue's flush before submitting, and prove the click landed —
      // without this the submit below could serialise an unchecked switch and
      // the failure would look like a FormData problem.
      await expect.element(sw).toHaveAttribute('aria-checked', 'true')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: 'true' })
    })
  })

  describe('after uncheck and click submit button again', () => {
    beforeEach(async () => {
      const sw = screen.getByRole('switch')
      // The original inherits a checked switch from the previous block and
      // clicks once. Per-test rendering means this block has to build that
      // state itself — and asserting both transitions is what stops the
      // `{}` below from passing against a switch that was simply never
      // checked. See `Switch/Switch.test.ts#uncheck-needs-state`.
      await sw.click()
      await expect.element(sw).toHaveAttribute('aria-checked', 'true')
      await sw.click()
      await expect.element(sw).toHaveAttribute('aria-checked', 'false')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(2)
      expect(handleSubmit.mock.results[1].value).toStrictEqual({ })
    })
  })
})
