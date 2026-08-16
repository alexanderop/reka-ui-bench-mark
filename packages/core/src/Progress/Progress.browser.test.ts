import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { sleep } from '@/test'
import Progress from './story/_Progress.vue'

// Browser-mode port of `Progress.test.ts`. A T2 file: the original installs no
// stubs, so nothing gets deleted here — `mount` → `await render` and
// `wrapper.html()` → the root's `outerHTML` is the whole translation.
//
// Two things the port checked that the original could not, both in
// `FINDINGS.tsv`:
//
//  - The axe test is NOT vacuous on either side (probed `results.inapplicable`
//    per the Slider lesson): `aria-progressbar-name` and `aria-valid-attr-value`
//    run and pass under jsdom too. What the browser adds is exactly one rule —
//    `color-contrast`, `inapplicable` under jsdom, and a **4.85:1 near miss**
//    against a 4.5:1 threshold in Chromium. See
//    `Progress/Progress.test.ts#color-contrast-only-real-gain`.
//  - The state where that axe test *would* fail is the one neither suite
//    renders: an indeterminate `ProgressRoot` has no accessible name at all and
//    violates `aria-progressbar-name`. Recorded as
//    `Progress/Progress.test.ts#indeterminate-untested`; adding a test for it is
//    forbidden by PORTING.md rule 7 (it would be `INVENTED`).

/** What `wrapper.html()` printed: the ProgressRoot element itself. */
function rootOf(screen: { container: Element }): HTMLElement {
  return screen.container.firstElementChild as HTMLElement
}

describe('given a default Progress', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Progress>>>

  beforeEach(async () => {
    screen = await render(Progress)
  })

  it('should pass axe accessibility tests', async () => {
    // `wrapper.element` in the original — the progressbar, not the container.
    expect(await axe(rootOf(screen))).toHaveNoViolations()
  })

  // Both value tests assert twice where the original asserts once, and the
  // extra assertion is the point rather than padding. `expect.element` retries
  // and so cannot race Vue's flush (AGENTS.md gotcha #1); the `outerHTML`
  // `toContain` that follows it is the original's assertion, character for
  // character, and reads synchronously once the retrying one has settled.
  // Keeping only the retrying form would silently widen "after 200ms" into
  // "within 200ms + the 1s retry budget".
  it('should contain correct value', async () => {
    await expect
      .element(screen.getByRole('progressbar'))
      .toHaveAttribute('data-value', '0')
    expect(rootOf(screen).outerHTML).toContain('data-value="0"')
  })

  describe('after 200ms', () => {
    beforeEach(async () => {
      // The fixture flips 0 → 50 from a `setTimeout(…, 200)` registered in its
      // own `setup()`, i.e. strictly before this sleep starts. Its callback
      // therefore fires first and Vue's flush is a microtask drained before
      // this sleep's macrotask, so the read below is settled, not lucky.
      await sleep(200)
    })

    it('should contain correct value', async () => {
      await expect
        .element(screen.getByRole('progressbar'))
        .toHaveAttribute('data-value', '50')
      expect(rootOf(screen).outerHTML).toContain('data-value="50"')
    })
  })
})
