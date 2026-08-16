import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { Toggle } from '.'

// Browser-mode port of `Toggle.test.ts`. A T2 file: the original installs no
// stubs, so nothing gets deleted. Three things are different, all measured and
// all written up in `FINDINGS.tsv`:
//
//  1. Geometry. `mount(Toggle)` passes no slot, so the component renders an
//     EMPTY `<button>`, and the browser project's Tailwind preflight zeroes
//     `button { padding }` and `* { border-width }` — measured 0x0, so
//     Playwright refuses to click it. Same shape as
//     `Switch/Switch.test.ts#zero-size-switch`; the <style> below is the
//     smallest thing that restores a clickable box (40x24 measured).
//     See `Toggle/Toggle.test.ts#zero-size-toggle`.
//  2. `{ force: true }` on the one click that lands on a *disabled* button.
//     Playwright's actionability checks include "enabled", so a plain
//     `.click()` there waits for the button to become enabled and times out
//     (measured: 1503ms to the timeout, against 6ms for the forced click).
//     `force: true` skips the wait, not the gesture: Chromium still delivers a
//     real pointerdown to the disabled control and then suppresses mousedown /
//     mouseup / click itself, which is exactly the platform behaviour the test
//     is about. See `Toggle/Toggle.test.ts#disabled-click-unclickable`.
//  3. The form fixture is rendered per test in a `beforeEach` rather than once
//     in the `describe` body — `render` unmounts after every test, so the
//     original's describe-body `mount` would leave tests 2 and 3 with nothing
//     on screen. Nothing in that block depends on accumulated state.
//
// The two silent vacuities found on `Switch` do NOT apply here and were both
// checked: this original is a `@vue/test-utils` file, not a
// `@testing-library` one, so there is no `getByText` in it at all (nothing to
// widen into a substring match), and no bare `getBy*`-as-assertion either —
// every one of the 11 tests already carries an explicit `expect`, and the
// implicit throw of `wrapper.get('button')` is preserved because every
// translation below feeds that same query into an `expect.element`, which
// retries and then throws when it finds nothing.
// See `Toggle/Toggle.test.ts#switch-vacuities-not-applicable`.

/**
 * The toggle is a contentless `<button>` and therefore 0x0 without this.
 * Scoped to the aria-label the fixtures already carry, and torn down after the
 * file so it cannot leak into another test file's DOM.
 */
let geometry: HTMLStyleElement

beforeAll(() => {
  geometry = document.createElement('style')
  geometry.textContent = `
    [aria-label="Toggle italic"] { display: inline-block; width: 40px; height: 24px; }
  `
  document.head.append(geometry)
})

afterAll(() => geometry.remove())

describe('given default Toggle', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Toggle>>>

  beforeEach(async () => {
    screen = await render(Toggle, {
      attrs: { 'aria-label': 'Toggle italic' },
    })
  })

  it('should pass axe accessibility tests', async () => {
    // Not vacuous — censused in both environments rather than assumed, reading
    // `incomplete` as well as `passes`. `button-name` and `nested-interactive`
    // both run with 1 node on both sides, so the audit genuinely reaches the
    // component. The one honest difference is that Chromium drops
    // `aria-hidden-body`, the detached-mount artifact from
    // `Separator#axe-context-detached-mount`. Note what is NOT here:
    // `color-contrast` is `inapplicable` in Chromium too, because the button
    // has no text. See `Toggle/Toggle.test.ts#axe-census`.
    expect(await axe(screen.getByRole('button').element())).toHaveNoViolations()
  })

  it('should not be toggled yet', async () => {
    await expect.element(screen.getByRole('button')).toHaveAttribute('data-state', 'off')
  })

  describe('after toggling', () => {
    beforeEach(async () => {
      // A real click, so the full pointerdown → mousedown → mouseup → click
      // sequence lands on the button (measured) rather than the lone `click`
      // event VTU's `trigger('click')` dispatches.
      await screen.getByRole('button').click()
    })

    it('should be toggled on', async () => {
      await expect.element(screen.getByRole('button')).toHaveAttribute('data-state', 'on')
    })

    describe('after toggling again', () => {
      beforeEach(async () => {
        // Settle the first click before firing the second: without this the
        // two clicks can be delivered inside one Vue flush and the component
        // would end up toggled once, not twice.
        await expect.element(screen.getByRole('button')).toHaveAttribute('data-state', 'on')
        await screen.getByRole('button').click()
      })

      it('should be toggled off', async () => {
        await expect.element(screen.getByRole('button')).toHaveAttribute('data-state', 'off')
      })
    })
  })
})

describe('given disabled Toggle', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Toggle>>>

  beforeEach(async () => {
    screen = await render(Toggle, {
      props: { disabled: true },
      attrs: { 'aria-label': 'Toggle italic' },
    })
  })

  it('should pass axe accessibility tests', async () => {
    // Byte-identical census to the enabled case in both environments — axe has
    // no rule that distinguishes a disabled toggle here. See
    // `Toggle/Toggle.test.ts#axe-census`.
    expect(await axe(screen.getByRole('button').element())).toHaveNoViolations()
  })

  it('should not be toggled yet', async () => {
    await expect.element(screen.getByRole('button')).toHaveAttribute('data-state', 'off')
  })

  describe('try toggling', () => {
    beforeEach(async () => {
      // `force: true` is required and is the faithful gesture — see the header.
      // The original's `trigger('click')` dispatches NOTHING here, because
      // VTU's `DOMWrapper.trigger` short-circuits on `isDisabled()`, so the
      // jsdom test asserts the harness's own guard rather than the platform's.
      // See `Toggle/Toggle.test.ts#disabled-click-unclickable`.
      await screen.getByRole('button').click({ force: true })
    })

    it('should be toggled off', async () => {
      await expect.element(screen.getByRole('button')).toHaveAttribute('data-state', 'off')
    })

    it('should render disable attributes', async () => {
      // `disabled` takes Vue's *property* path (`'disabled' in el`), unlike the
      // `nonce` case in `Viewport/Viewport.test.ts#nonce-attribute` — it is a
      // reflected boolean IDL attribute, so Chromium writes it back to the
      // content attribute exactly as jsdom does. Measured `""` in both.
      await expect.element(screen.getByRole('button')).toHaveAttribute('data-disabled', '')
      await expect.element(screen.getByRole('button')).toHaveAttribute('disabled', '')
    })
  })
})

describe('given Toggle in a form', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render({
      components: { Toggle },
      template: '<form><Toggle name="test" aria-label="Toggle italic" /></form>',
    })
  })

  it('should have hidden input field', async () => {
    // `[type="checkbox"]` has no locator equivalent, and `VisuallyHiddenInput`
    // is `aria-hidden="true"`, so the role query has to opt into hidden
    // elements — measured, 1 with `includeHidden` and 0 without.
    await expect
      .element(screen.getByRole('checkbox', { includeHidden: true }))
      .toBeInTheDocument()
  })

  it('should pass axe accessibility tests', async () => {
    // `wrapper.element` in the original is the `<form>` root of the inline
    // fixture; `screen.container.firstElementChild` is the same node.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should not nest the hidden input inside the interactive control', () => {
    // No locator can express "a descendant that must not exist", so this is
    // the `container.querySelector` escape hatch, same as `Switch`'s.
    expect(screen.container.querySelector('button input')).toBe(null)
  })
})
