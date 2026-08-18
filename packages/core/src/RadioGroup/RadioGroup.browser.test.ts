import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { handleSubmit, sleep } from '@/test'
import { RadioGroupItem, RadioGroupRoot } from '..'
import Radio from './story/_Radio.vue'
import RadioGroup from './story/_RadioGroup.vue'

// Browser-mode port of `RadioGroup.test.ts`. A T2 file — the original installs
// no stubs — but it is the first port where the *gesture itself* had to be
// re-derived rather than translated, because the component's arrow-key
// selection depends on a `setTimeout(…, 0)` racing `keyup`.
//
// The three things that are not a literal translation, all measured and all in
// `FINDINGS.tsv`:
//
//  1. `fireEvent.keyDown` dispatches a keydown and *nothing else* — no keyup,
//     ever. `RadioGroupItem` latches `isArrowKeyPressed = true` on keydown and
//     clears it on keyup, and `handleFocus` defers its `.click()` by
//     `setTimeout(…, 0)`. So under jsdom the flag is stuck `true` for the rest
//     of the file and the deferred click always fires. In Chromium a complete
//     `userEvent.keyboard('{ArrowDown}')` sends down+up back-to-back and
//     Chromium services the input task before the 0ms timer, so the flag is
//     already `false` when the timeout runs and *the radio never gets checked*.
//     Measured 9 failures in 10 isolated runs; trace is always
//     `keydown → focusin → keyup → setTimeout(0)`.
//     The faithful *and* realistic gesture is therefore a key that is held
//     across one macrotask — which is what a human keypress is, and what
//     `fireEvent.keyDown` + `await sleep(0)` describes. Hence
//     `{ArrowDown>}` / `sleep(0)` / `{/ArrowDown}`.
//     See `RadioGroup/RadioGroup.test.ts#keyup-race`.
//  2. `render()` does not expose the underlying `VueWrapper`, so
//     `wrapper.findAllComponents(RadioGroupItem)[2].emitted('select')` has no
//     equivalent. The Vue emit is driven one-for-one by a real DOM
//     `CustomEvent('radio.select')` dispatched on the item
//     (`shared/handleAndDispatchCustomEvent.ts`), so the port observes that
//     instead. It is dispatched with `bubbles: false`, which is why the
//     listener below is a *capture* listener on `document`: capture still runs
//     for non-bubbling events. See `RadioGroup/RadioGroup.test.ts#select-event-dom`.
//  3. A real `<button type="submit">` replaces `form.trigger('submit')`,
//     following the `Slider/Slider.test.ts#form-submit-button` precedent.
//
// `attachTo: document.body` is dropped (render throws on it) and the
// `document.body.innerHTML = ''` resets with it — every assertion here is
// container-scoped or reads `document.activeElement`, and `render` registers
// its own cleanup.

describe('given a default RadioGroup', () => {
  let screen: Awaited<ReturnType<typeof render<typeof RadioGroup>>>
  let radios: HTMLElement[]

  beforeEach(async () => {
    screen = await render(RadioGroup)
    // `[role=radio]` is an attribute selector in the original, so it stays a
    // container query rather than becoming `getByRole`. `_RadioGroup.vue` has a
    // single root, so `VueWrapper.find`'s include-the-root behaviour makes no
    // difference here.
    radios = Array.from(screen.container.querySelectorAll('[role=radio]'))
  })

  it('should pass axe accessibility tests', async () => {
    // `wrapper.element` in the original — `_RadioGroup.vue`'s single root.
    //
    // Not vacuous, censused rather than assumed: 14 rules run with nodes on
    // both sides (`aria-*`, `button-name(3)`, `nested-interactive(3)`,
    // `tabindex(4)`, `duplicate-id-aria(3)`), so the audit does reach all three
    // radios. Chromium adds `color-contrast`, but it lands in `incomplete(2)`
    // rather than `passes` — the fixture's labels are `text-white` on an
    // undeterminable background. See `RadioGroup/RadioGroup.test.ts#axe-census`.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have default selected', () => {
    expect(radios[0].getAttribute('data-state')).toBe('checked')
  })

  it('should render icons', () => {
    // `DOMWrapper.find` is `element.querySelector`, which excludes the wrapped
    // element itself — the indicator is a `<span>` child, so this is exact.
    expect(radios[0].querySelector('span')).toBeTruthy()
  })

  describe('on keyboard navigation', () => {
    const selectEvents: CustomEvent[] = []
    const onSelect = (event: Event) => selectEvents.push(event as CustomEvent)

    beforeEach(async () => {
      selectEvents.length = 0
      document.addEventListener('radio.select', onSelect, true)

      radios[0].focus()
      // See note 1 at the top of the file: press, let the component's
      // `setTimeout(0)` run, then release. Releasing before that macrotask —
      // which is what a plain `{ArrowDown}` does — leaves the group unselected.
      await userEvent.keyboard('{ArrowDown>}')
      await sleep(0)
      await userEvent.keyboard('{/ArrowDown}')
    })

    afterEach(() => {
      document.removeEventListener('radio.select', onSelect, true)
    })

    it('should emit `select` event', async () => {
      // The original reads the third `RadioGroupItem`'s emit record; this reads
      // the DOM event that causes it, and additionally pins the target, which
      // the emit-record form got for free from the array index.
      expect(selectEvents.find(event => event.target === radios[2])?.detail).toBeTruthy()
    })

    it('should skip disabled item', () => {
      expect(radios[1].getAttribute('data-state')).toBe('unchecked')
      expect(document.activeElement).toBe(radios[2])
    })

    it('should select next item on keydown', async () => {
      expect(radios[0].getAttribute('data-state')).toBe('unchecked')
      expect(radios[2].getAttribute('data-state')).toBe('checked')
      expect(document.activeElement).toBe(radios[2])
    })

    describe('on arrow up', () => {
      it('should select the first item again', async () => {
        await userEvent.keyboard('{ArrowUp>}')
        await sleep(0)
        await userEvent.keyboard('{/ArrowUp}')
        expect(radios[0].getAttribute('data-state')).toBe('checked')
        expect(radios[2].getAttribute('data-state')).toBe('unchecked')
      })
    })
  })
})

describe('given disabled RadioGroup', () => {
  let screen: Awaited<ReturnType<typeof render<typeof RadioGroup>>>
  let radios: HTMLElement[]

  beforeEach(async () => {
    screen = await render(RadioGroup, { props: { disabled: true } })
    radios = Array.from(screen.container.querySelectorAll('[role=radio]'))
  })

  it('should pass axe accessibility tests', async () => {
    // Same 14 rules as the enabled group, byte-identical node counts — with one
    // real difference: `color-contrast` is `inapplicable` here rather than
    // `incomplete`, because axe skips disabled controls. So the one rule
    // browser mode adds is the one rule this block cannot run.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have default selected', () => {
    expect(radios[0].getAttribute('data-state')).toBe('checked')
  })

  it.each([[0, 'checked'], [1, 'unchecked'], [2, 'unchecked']])('should not select any item', async (input, output) => {
    // Playwright's actionability includes "enabled", so a plain `.click()` on a
    // disabled `<button>` burns the full timeout. `force: true` skips the
    // *wait*, not the gesture: Chromium still delivers a real `pointerdown` and
    // then suppresses `mousedown`/`mouseup`/`click` itself, which is the
    // platform behaviour this test is about. The jsdom side never clicked at
    // all — `DOMWrapper.trigger` short-circuits on `isDisabled()` — so the
    // original asserted VTU's guard rather than the browser's.
    await screen.getByRole('radio').nth(input as number).click({ force: true })
    expect(radios[input as number].getAttribute('data-state')).toBe(output)
  })

  it.each([[0], [1], [2]])('should have disabled attribute on item', async (input) => {
    // `disabled` is a prop-path binding (`'disabled' in HTMLButtonElement`), so
    // Vue assigns `el.disabled = ''`; both jsdom and Chromium reflect that back
    // as an empty content attribute. `data-disabled` takes `setAttribute` in
    // both. Verified against the T2 attribute sweep in `AGENTS.md`.
    expect(radios[input].getAttribute('disabled')).toBe('')
    expect(radios[input].getAttribute('data-disabled')).toBe('')
  })
})

describe('given a RadioGroupItem whose label is not found', () => {
  it('should not fall back to the value as the accessible name', async () => {
    const screen = await render({
      components: { RadioGroupItem, RadioGroupRoot },
      template: '<RadioGroupRoot><RadioGroupItem id="r1" value="event_type" /></RadioGroupRoot>',
    })

    // The original's `await nextTick()` waits for the re-render that follows
    // `useForwardExpose`'s `onMounted` assignment of `currentElement`, which is
    // what makes `ariaLabel`'s `document.querySelector` run at all. Measured
    // with a positive control (same template plus a `<label for>`): the label
    // text is already on the element immediately after `await render()`, so the
    // flush the tick waited for has happened. Read synchronously rather than
    // through a retrying `.not.toHaveAttribute`, which would settle on the
    // first poll and could not tell "never set" from "set one tick later".
    expect((screen.container.querySelector('[role=radio]') as HTMLElement).getAttribute('aria-label')).toBe(null)
  })
})

describe('given radio in a form', () => {
  // Rendered per test rather than once in the describe body: `render` unmounts
  // after every test, and the radio's checked state does not carry over, which
  // is why the second block has to build it itself.
  //
  // `handleSubmit` is a module-level `vi.fn()` shared across files, so it is
  // cleared per test and each block asserts its *own* single submit. The
  // original's (1, then 2) ladder made the second test pass only because a
  // sibling ran first — order-coupling that Vitest 5's `clearMocks: true`
  // default turns red (measured: 7 files). Owning the count also makes the
  // test name true.
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    handleSubmit.mockClear()
    screen = await render({
      props: ['handleSubmit'],
      components: { Radio },
      template: '<form @submit="handleSubmit"><Radio /><button type="submit">Submit</button></form>',
    }, {
      props: { handleSubmit },
    })
  })

  it('should have hidden input field', async () => {
    // Kept verbatim, capital R and all: `type` is on HTML's case-insensitive
    // attribute-value list, so `[type="Radio"]` matches `<input type="radio">`
    // in Chromium exactly as it does in jsdom (measured, both true).
    // No locator can express this — `getByRole('radio', { includeHidden: true })`
    // matches *two* elements here, the `role="radio"` button and the hidden
    // input's implicit role.
    expect(!!screen.container.querySelector('[type="Radio"]')).toBe(true)
  })

  it('should pass axe accessibility tests', async () => {
    // `wrapper.element` in the original — the `<form>`.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should not nest the hidden input inside the interactive control', () => {
    // No locator can express "a descendant that must not exist".
    expect(screen.container.querySelector('button input')).toBe(null)
  })

  describe('after clicking submit button', () => {
    beforeEach(async () => {
      const radio = screen.getByRole('radio')
      await radio.click()
      // Prove the click landed before submitting: without this a failure would
      // look like a FormData problem rather than a click that never happened.
      await expect.element(radio).toHaveAttribute('aria-checked', 'true')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: 'true' })
    })
  })

  describe('after uncheck and click submit button again', () => {
    beforeEach(async () => {
      const radio = screen.getByRole('radio')
      // The original inherits a checked radio from the previous block and
      // clicks it once — the "uncheck" the name promises, which a radio does
      // not do. Per-test rendering means the state has to be rebuilt here, and
      // asserting both transitions is what keeps the second click meaningful:
      // it must leave the radio checked, not toggle it off.
      await radio.click()
      await expect.element(radio).toHaveAttribute('aria-checked', 'true')
      await radio.click()
      await expect.element(radio).toHaveAttribute('aria-checked', 'true')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: 'true' })
    })
  })
})
