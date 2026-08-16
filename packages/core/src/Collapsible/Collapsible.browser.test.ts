import type { Locator } from 'vitest/browser'
import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import Collapsible from './story/_Collapsible.vue'

// Browser-mode port of `Collapsible.test.ts`.
//
// Tiered T2-mechanical, and the tiering is wrong in one direction and right in
// another. `CollapsibleContent.vue:65-67` measures itself with
// `getBoundingClientRect()` and publishes the result as
// `--reka-collapsible-content-height` / `-width`, which is pure T3 geometry —
// under jsdom every one of those measurements is 0 and in Chromium they are
// 24px / 414px. But *the original asserts none of it*, so the port is still a
// mechanical translation: the geometry shows up as a finding, not as work.
// See `Collapsible/Collapsible.test.ts#content-size-vars`.
//
// Three things differ from a literal translation, all measured:
//
//  1. `should have hidden attribute` and the second `should close the content`
//     are quarantined under `it.fails`. Both assert
//     `getAttribute('hidden') === ''` on a `unmountOnHide: false` content,
//     where the component sets `hidden="until-found"`. jsdom implements
//     `hidden` as a plain boolean IDL attribute, so Vue's property write
//     coerces `'until-found'` to `true` and the attribute reflects back as
//     `''`; Chromium implements the spec's union type and reflects
//     `'until-found'`. The original's own comment says the value "should be
//     until-found" — the browser agrees with the comment, not the assertion.
//     Assertions left exactly as strong as they were.
//     See `Collapsible/Collapsible.test.ts#hidden-until-found`.
//
//  2. Two assertions moved OUT of the second quarantined test and into the
//     `unmountOnHide:false` block's `beforeEach`. `it.fails` passes as soon as
//     the body throws anything, so the `hidden` assertion — which throws
//     unconditionally in Chromium — was disarming the two assertions sharing
//     its body. Measured: two mutations that the jsdom original catches left
//     the port green before this move, and turn two tests red after it.
//     See `Collapsible/Collapsible.test.ts#quarantine-swallows-siblings`.
//
//  3. `should call `update:open` prop with `false` value` clicks the trigger
//     instead of calling `wrapper.vm.$emit('update:open', false)` by hand. The
//     original emits the event itself and then asserts the event was emitted,
//     which is a test of Vue's `$emit`; `render` exposes no `vm` to reproduce
//     that with, and rule 4 says a name describing something that does not
//     happen gets fixed in the test rather than renamed. Measured: with
//     `defaultOpen: true`, one click on the trigger makes the fixture emit
//     `update:open` with `false`, so the name is now literally true.
//     See `Collapsible/Collapsible.test.ts#emit-self-emitted`.
//
// `findByText` translates to `getByText(..., { exact: true })` — vitest
// locators default to a substring match and `@testing-library`'s `findByText`
// does not. Without `exact` the query would still resolve here (nothing else
// in the fixture contains the string), but the two silent vacuities from
// `Switch` were both checked rather than assumed: no bare `getBy*` is used as
// an assertion anywhere below.

const CONTENT_TEXT = 'Content'

describe('given a default Collapsible', async () => {
  let screen: Awaited<ReturnType<typeof render<typeof Collapsible>>>
  let trigger: Locator
  let content: HTMLElement | null

  beforeEach(async () => {
    screen = await render(Collapsible)
    trigger = screen.getByRole('button')
    // `[hidden]` carries no role and holds no text while closed, so no locator
    // can address it — `container.querySelector` is the documented escape
    // hatch for exactly this.
    content = screen.container.querySelector('[hidden]')
  })
  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have hidden content', async () => {
    expect(content).not.toBeNull()
    await expect.element(content!).toHaveTextContent('')
  })

  describe('when clicking the trigger', async () => {
    let content: HTMLElement
    beforeEach(async () => {
      await trigger.click()
      const located = screen.getByText(CONTENT_TEXT, { exact: true })
      await expect.element(located).toBeInTheDocument()
      content = located.element() as HTMLElement
    })

    it('should open the content', async () => {
      expect(screen.container.textContent).toContain(content.innerHTML)
    })

    describe('and clicking the trigger again', () => {
      beforeEach(async () => {
        await trigger.click()
        // Settles Vue's flush before the synchronous read below. The original
        // did not await its second click at all and got away with it because
        // `nextTick` is a microtask; a real click is a round trip to the
        // browser, so the wait has to be explicit.
        await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
      })

      it('should close the content', () => {
        expect(screen.container.textContent).not.toContain(content.innerHTML)
      })
    })
  })
})

describe('given a Collapsible with `unmountOnHide:false` ', async () => {
  let screen: Awaited<ReturnType<typeof render<typeof Collapsible>>>
  let trigger: Locator
  let content: HTMLElement | null

  beforeEach(async () => {
    screen = await render(Collapsible, { props: { unmountOnHide: false } })
    trigger = screen.getByRole('button')
    content = screen.container.querySelector('[hidden]')

    // These two assertions restate this block's premise — with
    // `unmountOnHide: false` the content stays MOUNTED while closed, and
    // reports itself `closed` — and they are here rather than in an `it` body
    // for a reason worth understanding before touching them.
    //
    // Both tests in this block that assert those facts are quarantined under
    // `it.fails`, and `it.fails` passes as soon as the body throws ANYTHING.
    // The `hidden` assertion throws unconditionally in Chromium, so every
    // other assertion sharing that body stops discriminating: measured, with
    // `data-state` mutated to 'BROKEN' or the slot's `v-if` broken outright,
    // the jsdom suite goes red and the port stayed GREEN.
    //
    // A hook is absorbed too — for a `.fails` test. It is NOT absorbed for the
    // two tests in this block that are not quarantined (`should pass axe
    // accessibility tests` and `when clicking the trigger > should open the
    // content`), so putting them here keeps both detectors live and attributes
    // the failure to setup instead of mislabelling it as an axe failure.
    // Mutation-verified against both regressions.
    // See `Collapsible/Collapsible.test.ts#quarantine-swallows-siblings`.
    expect(content!.getAttribute('data-state')).toBe('closed')
    expect(screen.container.textContent).toContain(CONTENT_TEXT)
  })
  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  // @finding Collapsible/Collapsible.test.ts#hidden-until-found
  it.fails('should have hidden attribute', async () => {
    // `jsdom` doesn't render hidden attribute correctly
    expect(content!.getAttribute('hidden')).toBe('')
    // it should be
    // expect(content.element.getAttribute('hidden')).toBe('until-found')
  })

  describe('when clicking the trigger', async () => {
    let content: HTMLElement
    beforeEach(async () => {
      await trigger.click()
      const located = screen.getByText(CONTENT_TEXT, { exact: true })
      await expect.element(located).toBeInTheDocument()
      content = located.element() as HTMLElement
    })

    it('should open the content', async () => {
      expect(screen.container.textContent).toContain(content.innerHTML)
    })

    describe('and clicking the trigger again', () => {
      beforeEach(async () => {
        await trigger.click()
        await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
      })

      // @finding Collapsible/Collapsible.test.ts#hidden-until-found
      it.fails('should close the content', () => {
        expect(content.getAttribute('data-state')).toBe('closed')
        expect(content.getAttribute('hidden')).toBe('')
        expect(screen.container.textContent).toContain(content.innerHTML)
      })
    })
  })
})

describe('given an open uncontrolled Collapsible', () => {
  let content: HTMLElement
  describe('when clicking the trigger', async () => {
    let screen: Awaited<ReturnType<typeof render<typeof Collapsible>>>
    beforeEach(async () => {
      screen = await render(Collapsible, {
        props: {
          defaultOpen: true,
        },
      })
      const located = screen.getByText(CONTENT_TEXT, { exact: true })
      await expect.element(located).toBeInTheDocument()
      content = located.element() as HTMLElement
    })

    it('should open the content by default', () => {
      expect(screen.container.textContent).toContain(content.innerHTML)
    })

    it('should close the content', async () => {
      const trigger = screen.getByRole('button')
      await trigger.click()
      await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.container.textContent).not.toContain(content.innerHTML)
    })

    it('should call `update:open` prop with `false` value', async () => {
      await screen.getByRole('button').click()
      await expect.element(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
      expect(screen.emitted('update:open')?.[0]?.[0]).toBe(false)
    })
  })
})
