import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import Collapsible from './story/_Collapsible.vue'

// Not a port — no jsdom original, so `port:parity` reports this file as
// unpaired and skips it. The Collapsible half of the Accordion sheet's finding. At rest
// the trigger renders `aria-controls=""` — CollapsibleRoot hands out a plain
// `contentId: ''`, CollapsibleContent fills it with `||= useId()` during ITS
// setup, after the trigger's first render already read the empty string, and
// nothing reactive tells the trigger to look again. The first `open` change
// re-renders the trigger and repairs the attribute as a side effect.
//
// The second test records why this cannot be written as an ARIA snapshot:
// `toMatchAriaInlineSnapshot` renders roles, names and the active states
// (checked/disabled/expanded/level/pressed/selected/active, plus /url and
// /placeholder) — never a relation. Measured: the tree is byte-identical with
// `aria-controls=""` and with it filled. If that test ever goes red, the tree
// has started carrying relations and the quarantine above can become a snapshot.
describe('given a closed uncontrolled Collapsible at rest', () => {
  // @finding Collapsible/Collapsible.aria-controls.browser.test.ts#aria-controls-empty-at-rest
  it.fails('links the trigger to its content with aria-controls before any interaction', async () => {
    const screen = await render(Collapsible)
    const trigger = screen.getByRole('button').element()
    const content = screen.container.querySelector('[id^="reka-collapsible-content"]') as HTMLElement
    expect(content.id).toMatch(/^reka-collapsible-content/)
    expect(trigger.getAttribute('aria-controls')).toBe(content.id)
  })

  it('renders an identical ARIA snapshot with aria-controls empty and filled', async () => {
    const screen = await render(Collapsible, { props: { defaultOpen: true } })
    const trigger = screen.getByRole('button')
    const root = screen.container.firstElementChild as HTMLElement

    await expect.element(trigger).toHaveAttribute('aria-controls', '')
    await expect.element(root).toMatchAriaInlineSnapshot(`
      - button "Trigger" [expanded]
      - text: Content
    `)

    await trigger.click()
    await trigger.click()
    await expect.element(trigger).toHaveAttribute('aria-controls', expect.stringMatching(/^reka-collapsible-content/))
    await expect.element(root).toMatchAriaInlineSnapshot(`
      - button "Trigger" [expanded]
      - text: Content
    `)
  })
})
