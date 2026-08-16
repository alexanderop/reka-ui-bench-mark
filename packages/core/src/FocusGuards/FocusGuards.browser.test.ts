import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import FocusGuards from './FocusGuards.vue'

// Browser-mode port of `FocusGuards.test.ts`.
//
// This file is the counter-example to two entries in `AGENTS.md`, both of which
// would have produced a port that passes for the wrong reason. Both were
// settled by measurement, not by reading:
//
//  1. **`attachTo` is NOT a supported mount option.** The translation table
//     says `render` "accepts all `@vue/test-utils` mount options"; it does not.
//     `vitest-browser-vue` throws on `attachTo` outright
//     (`dist/pure-*.js`: `if (mountOptions.attachTo) throw new Error(...)`),
//     because it owns the mount point. It appends its own container `<div>` to
//     `document.body` and mounts there, so the component is attached to the
//     live document either way — which is all these tests need, since
//     `useFocusGuards` inserts its guards into `document.body` directly rather
//     than relative to the component. Recorded as `#render-rejects-attachTo`.
//
//  2. **The `document.body.innerHTML = ''` reset is KEPT, not deleted.** The
//     table says to delete it because `render` removes its own container. That
//     is only true for containers `cleanup()` unmounts itself: every test here
//     calls `unmount()` explicitly, and `cleanup()` only removes a container
//     whose wrapper is still mounted under `document.body`, so the empty
//     containers accumulate (measured: `__vitest_1__`, `__vitest_2__`,
//     `__vitest_3__` all still in `<body>` on the fourth test). Every assertion
//     in this file is a `document.querySelectorAll` count over the WHOLE
//     document, so leaked nodes are exactly the failure mode the reset exists
//     to prevent.
//
//     Clearing the body is also safe here, which had to be checked separately:
//     the tester iframe's `<body>` holds nothing but render containers
//     (measured — empty at the first `beforeEach`), and `vitest-browser-vue`
//     registers its `beforeEach(cleanup)` at the file's root suite, so it runs
//     BEFORE this describe-level hook. Verified with a deliberately leaked
//     mount: the next test still started at 0 guards and still counted 2 → 0
//     around a fresh render, i.e. `cleanup()` unmounted the leak properly and
//     `useFocusGuards`' module-level refcount did not desync.
//
// The counts were confirmed to discriminate rather than to be trivially true:
// nothing mounted → 0, one component mounted → 2, unmounted → 0.
//
// The original's "watchEffect runs synchronously on mount" comment survives the
// `await`. Measured: the count is already 2 on a synchronous read taken before
// awaiting `render()` at all, and `markThenable` only awaits a trace mark, not
// a Vue flush. `expect(countGuards())` is a plain non-retrying assertion in
// both suites, so nothing here was widened by a retry budget.

// The guard attribute used by useFocusGuards (verified in useFocusGuards.ts)
const GUARD_ATTR = '[data-reka-focus-guard]'

function countGuards(): number {
  return document.querySelectorAll(GUARD_ATTR).length
}

describe('given FocusGuards', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    // Ensure guards are cleaned up between tests
    document.querySelectorAll(GUARD_ATTR).forEach(node => node.remove())
  })

  it('adds exactly 2 guard elements to document.body on mount', async () => {
    expect(countGuards()).toBe(0)
    const wrapper = await render(FocusGuards)
    // watchEffect runs synchronously on mount
    expect(countGuards()).toBe(2)
    wrapper.unmount()
  })

  it('removes guard elements from document.body on unmount', async () => {
    const wrapper = await render(FocusGuards)
    expect(countGuards()).toBe(2)
    wrapper.unmount()
    expect(countGuards()).toBe(0)
  })

  it('does not double-add guards when two consumers are mounted', async () => {
    const wrapper1 = await render(FocusGuards)
    const wrapper2 = await render(FocusGuards)
    // useFocusGuards reuses existing guard elements (insertAdjacentElement with existing)
    expect(countGuards()).toBe(2)
    wrapper1.unmount()
    wrapper2.unmount()
  })

  it('keeps guards when only one of two consumers unmounts', async () => {
    const wrapper1 = await render(FocusGuards)
    const wrapper2 = await render(FocusGuards)
    expect(countGuards()).toBe(2)
    // Unmounting first consumer — guards must remain for the second
    wrapper1.unmount()
    expect(countGuards()).toBe(2)
    // Only after the last consumer unmounts should guards be removed
    wrapper2.unmount()
    expect(countGuards()).toBe(0)
  })

  it('renders slot content', async () => {
    const wrapper = await render(FocusGuards, {
      slots: { default: '<span id="slot-content">hello</span>' },
    })
    expect(document.getElementById('slot-content')).not.toBeNull()
    wrapper.unmount()
  })
})
