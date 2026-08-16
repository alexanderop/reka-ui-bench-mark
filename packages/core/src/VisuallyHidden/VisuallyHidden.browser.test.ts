import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import VisuallyHidden from './VisuallyHidden.vue'

// Browser-mode port of `VisuallyHidden.test.ts`. The original installs no
// stubs, mounts the raw primitive (there is no story fixture) and asserts
// attributes plus two *inline style* properties, so the translation is almost
// literal. Four mechanical differences:
//
//  - `mount(C, { attachTo: document.body })` → `await render(C)`. `render`
//    already attaches its container to the document, so `attachTo` has no
//    equivalent and needs none.
//  - Every `wrapper.unmount()` is deleted — `vitest-browser-vue` registers
//    cleanup itself. NOTE for the coverage diff: the original unmounts in all
//    six of its tests, so the usual `#auto-unmount` freebie does not apply
//    here and the browser is not owed any teardown lines.
//  - `beforeEach(() => { document.body.innerHTML = '' })` is deleted. It was
//    guarding against the previous `attachTo: document.body` mount being left
//    behind; `render`'s cleanup removes its own container, and nothing in
//    either describe reads `document.body` directly. Probed rather than
//    assumed: `document.body.children.length` is **0** at the start of every
//    test and 1 after `render`, so there is nothing left over to clear.
//  - `wrapper.element` → `container.firstElementChild` (`render` unwraps VTU's
//    intermediate node), `wrapper.text()` → `container.textContent`,
//    `wrapper.attributes(x)` → `expect.element(el).toHaveAttribute(x, …)`.
//
// WHAT THE PORT DELIBERATELY DOES NOT DO, and it is the finding for this file:
// `applies visually-hidden styles` still reads `el.style.*`, the inline string
// the component wrote, not what Chromium did with it. jsdom cannot do better;
// this port could, and does not, because adding the computed-style /
// bounding-rect assertions here would close the gap rather than record it, and
// an extra `it` would be INVENTED. The measurements are in
// `VisuallyHidden/VisuallyHidden.test.ts#inline-style-only` — the short version
// is that the component does work (rect 1×1 at -1,-1, clipped away, and its
// text still reachable through the accessibility tree) and that neither suite
// asserts any of it.
describe('given default VisuallyHidden', () => {
  it('renders a span by default', async () => {
    const screen = await render(VisuallyHidden)
    expect(screen.container.firstElementChild!.tagName).toBe('SPAN')
  })

  it('applies visually-hidden styles', async () => {
    const screen = await render(VisuallyHidden)
    const el = screen.container.firstElementChild as HTMLElement
    expect(el.style.position).toBe('absolute')
    expect(el.style.clipPath).toBe('inset(50%)')
  })

  it('renders slot content', async () => {
    const screen = await render(VisuallyHidden, {
      slots: { default: 'Hidden label text' },
    })
    expect(screen.container.textContent).toBe('Hidden label text')
  })
})

describe('given feature="focusable" (default)', () => {
  let el: HTMLElement

  beforeEach(async () => {
    const screen = await render(VisuallyHidden, {
      props: { feature: 'focusable' },
    })
    el = screen.container.firstElementChild as HTMLElement
  })

  it('sets aria-hidden="true"', async () => {
    await expect.element(el).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not set tabindex', async () => {
    await expect.element(el).not.toHaveAttribute('tabindex')
  })

  it('does not set data-hidden', async () => {
    await expect.element(el).not.toHaveAttribute('data-hidden')
  })
})

describe('given feature="fully-hidden"', () => {
  let el: HTMLElement

  beforeEach(async () => {
    const screen = await render(VisuallyHidden, {
      props: { feature: 'fully-hidden' },
    })
    el = screen.container.firstElementChild as HTMLElement
  })

  it('sets data-hidden attribute', async () => {
    await expect.element(el).toHaveAttribute('data-hidden', '')
  })

  it('sets tabindex="-1"', async () => {
    await expect.element(el).toHaveAttribute('tabindex', '-1')
  })

  it('sets aria-hidden="true"', async () => {
    // `fully-hidden` is `tabindex="-1"` (non-focusable), so removing it from the
    // accessibility tree is safe and prevents axe `label`/`nested-interactive`
    // violations for the hidden form inputs that rely on it.
    await expect.element(el).toHaveAttribute('aria-hidden', 'true')
  })
})
