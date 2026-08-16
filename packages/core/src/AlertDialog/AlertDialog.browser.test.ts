import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import AlertDialog from './story/_AlertDialog.vue'

// Browser-mode port of `AlertDialog.test.ts`. A T2 file — the original installs
// no stubs — but three of its four translations are not mechanical, because the
// content is **portalled to `document.body`** and therefore lives outside
// `screen.container` entirely.
//
//  - `mount(AlertDialog, { attachTo: document.body })` → `await render(...)`.
//    `attachTo` throws in `vitest-browser-vue`; `render` attaches its own
//    container to the live document, which is all this file needs.
//  - `findByText/findAllByText/findByRole(document.body, …)` from
//    `@testing-library/vue` → `page.getBy*`, the document-scoped locator root.
//    NOTE — this comment used to add "`screen.getBy*` is container-scoped and
//    would find nothing once the dialog is open". **That is false**, and the
//    correction is now in `AGENTS.md`: `render`'s `getBy*` helpers bind to
//    `baseElement`, which defaults to `document.body`. Re-measured on this very
//    fixture with the dialog open — content's parent is BODY and
//    `container.contains(content)` is false, yet `screen.getByRole('alertdialog')`
//    returns 1, the *same node* `page` returns; only `screen.locator.*` returns 0.
//    `page` is kept here because it is explicit and correct, not because `screen`
//    fails. See `Teleport/Teleport.test.ts#screen-is-body-scoped`.
//  - `fireEvent.click(trigger)` — which the original does **not** await — →
//    `await trigger.click()`, a real Playwright click that is awaited.
//
// Teardown: `wrapper.unmount()` is dropped (cleanup does it, and a manual
// unmount leaks its container — see `AGENTS.md`), and so is
// `document.body.innerHTML = ''` (nothing here counts document-wide nodes;
// `should open the content` reads `document.body.innerHTML` but only after a
// fresh render, and `cleanup()` runs first). **`document.body.style.cssText`
// is KEPT** — `DismissableLayer.vue:172-173` writes
// `document.body.style.pointerEvents = 'none'` and restores the value it saw
// at mount, so a leaked `none` would make
// `should keep content interactive while body pointer events are locked` pass
// for the wrong reason. Verified it still discriminates: with the dialog closed
// the same read is `''`.

describe('given a default Dialog', async () => {
  let trigger: ReturnType<typeof page.getByText>

  beforeEach(async () => {
    await render(AlertDialog)
    trigger = page.getByText('Open')
  })

  afterEach(() => {
    document.body.style.cssText = ''
  })

  // Quarantined: the port is faithful and the assertion is unchanged. Opening
  // the dialog produces a real `color-contrast` violation (4.07:1 against a
  // 4.5:1 threshold) on the fixture's `text-red11 bg-red4` action button. jsdom
  // cannot see it — `color-contrast` reports zero nodes there, landing in
  // `inapplicable` on the open dialog and in `incomplete` on the closed one.
  // The rest of the audit is NOT vacuous in either environment; see
  // `#axe-census`.
  // @finding AlertDialog/AlertDialog.test.ts#axe-color-contrast
  it.fails('should pass axe accessibility tests', async () => {
    expect(await axe(document.body)).toHaveNoViolations()

    // open modal
    await trigger.click()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  describe('after clicking the trigger', () => {
    beforeEach(async () => {
      await trigger.click()
    })

    it('should open the content', () => {
      expect(document.body.innerHTML).toContain('Title')
    })

    it('should focus the cancel button', async () => {
      const cancelButton = page.getByText('Cancel').elements() as HTMLElement[]
      // `AlertDialogContent` focuses the cancel button inside a `nextTick`
      // after `open-auto-focus`, so settle with a retrying matcher before the
      // original's synchronous identity check. Both assertions are kept; the
      // sync one is the original's and is the one that would catch a regression
      // that focuses the *wrong* element.
      await expect.element(cancelButton.at(-1)!).toHaveFocus()
      expect(cancelButton.at(-1)).toBe(document.activeElement)
    })

    it('should keep content interactive while body pointer events are locked', async () => {
      const content = page.getByRole('alertdialog').element() as HTMLElement

      expect(document.body.style.pointerEvents).toBe('none')
      expect(content.style.pointerEvents).toBe('auto')
    })
  })
})
