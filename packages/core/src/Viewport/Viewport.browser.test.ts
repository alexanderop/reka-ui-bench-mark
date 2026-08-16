import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import Viewport from './Viewport.vue'

// Browser-mode port of `Viewport.test.ts` (T2, batch 2).
//
// Two things about this file that are not in the translation table:
//
//  - `Viewport.vue` has a **fragment root**: a `<div data-reka-viewport>` and a
//    sibling `<style>`. Neither is reachable by a locator. The div carries
//    `role="presentation"`, which removes it from the accessibility tree, and
//    `<style>` has no role and no accessible text at all. `getByRole(...,
//    { includeHidden: true })` does not help — `presentation` is not a queryable
//    role, and there is no `getByTagName`. So the two helpers below use
//    `screen.container.querySelector`, which is the honest translation of
//    `wrapper.find(selector)` here rather than a contortion around the locator
//    API. Both roots are direct children of `container` (measured:
//    `[...container.children].map(c => c.tagName)` is `['DIV', 'STYLE']`).
//
//  - The original's `beforeEach(() => { document.body.innerHTML = '' })` is
//    deleted, per the translation table. It was already dead code under jsdom —
//    every test mounts with `attachTo: document.body` and calls
//    `wrapper.unmount()` itself — and `vitest-browser-vue` removes its container
//    after each test regardless.
//
// The explicit `wrapper.unmount()` in every original test also means the
// `#auto-unmount` coverage freebie does not apply to this file: the jsdom suite
// already tears down.

function viewportOf(screen: { container: Element }): HTMLElement {
  return screen.container.querySelector('[data-reka-viewport]') as HTMLElement
}

function styleOf(screen: { container: Element }): HTMLStyleElement {
  return screen.container.querySelector('style') as HTMLStyleElement
}

describe('given default Viewport', () => {
  it('renders an element with data-reka-viewport attribute', async () => {
    const screen = await render(Viewport)
    expect(viewportOf(screen)).not.toBeNull()
  })

  it('renders with role="presentation"', async () => {
    const screen = await render(Viewport)
    expect(viewportOf(screen).getAttribute('role')).toBe('presentation')
  })

  it('applies overflow:auto style', async () => {
    const screen = await render(Viewport)
    const el = viewportOf(screen)
    // Kept verbatim: this reads the *inline* style property, i.e. what the
    // component wrote, not what the browser resolved. Both agree here —
    // `getComputedStyle(el).overflow` is also `'auto'`, in Chromium and in
    // jsdom — so the port neither gains nor loses anything by staying literal.
    // See `Viewport/Viewport.test.ts#inline-style-only`.
    expect(el.style.overflow).toBe('auto')
  })

  it('renders a <style> sibling whose text mentions [data-reka-viewport]', async () => {
    const screen = await render(Viewport)
    const styleEl = styleOf(screen)
    expect(styleEl).not.toBeNull()
    expect(styleEl.textContent).toContain('[data-reka-viewport]')
  })

  // QUARANTINED — the assertion is unchanged and it fails in Chromium.
  //
  // Measured, same component, same `nonce: 'abc123'` prop:
  //
  //   jsdom     getAttribute('nonce') === 'abc123'   el.nonce === 'abc123'
  //   Chromium  getAttribute('nonce') === null       el.nonce === 'abc123'
  //                                                  hasAttribute('nonce') === false
  //
  // The element is connected to the document in both cases, so this is not
  // VTU's detached mount. It is also **not** the HTML spec's nonce hiding, which
  // was the standing prediction: nonce hiding empties the content attribute but
  // leaves it present, and it only fires for a header-delivered CSP. Probed
  // directly in this page — `setAttribute('nonce', 'abc123')` then insert leaves
  // `hasAttribute('nonce') === true`.
  //
  // The real cause is Vue: `shouldSetAsProp` ends in `return key in el`
  // (`@vue/runtime-dom`, `patchProp`), `'nonce' in HTMLStyleElement.prototype`
  // is true, so Vue assigns `el.nonce = 'abc123'` as a DOM property and never
  // calls `setAttribute`. jsdom reflects that property into the content
  // attribute; Chromium stores it in the element's internal nonce slot and
  // leaves the attribute alone. The original's comment — "jsdom exposes the
  // attribute reliably" — is describing a jsdom implementation detail as if it
  // were platform behaviour.
  //
  // Not switching this to `el.nonce`: that is the weakening move, and the test
  // name says "attribute". See `Viewport/Viewport.test.ts#nonce-attribute`,
  // which also records that CSP still honours the nonce (probed in an iframe
  // under `style-src 'nonce-abc123'`), so this is a test artifact and not a
  // consumer-facing bug.
  // @finding Viewport/Viewport.test.ts#nonce-attribute
  it.fails('puts nonce attribute on the style tag when nonce prop is provided', async () => {
    const screen = await render(Viewport, { props: { nonce: 'abc123' } })
    const styleEl = styleOf(screen)
    expect(styleEl.getAttribute('nonce')).toBe('abc123')
  })
})
