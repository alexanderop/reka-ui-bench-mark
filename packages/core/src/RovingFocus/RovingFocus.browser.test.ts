import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import Button from './story/_Button.vue'
import ButtonGroup from './story/_ButtonGroup.vue'

// Browser-mode port of `RovingFocus.test.ts`. A T2 file: the original installs
// no stubs, so there is nothing to delete. What it *does* do is unusual for a
// jsdom file — it drives the component with `userEvent.tab()` and
// `userEvent.keyboard()` from `@testing-library/user-event`, i.e. a JS
// reimplementation of sequential focus navigation, because jsdom has none of
// its own. Every assertion below therefore moves from "the polyfill's model of
// tab order" to "Chromium's tab order", which is the only reason to port it.
//
// Measured differences, all of which came out *identical* to jsdom:
//
//  - `wrapper.findAll('button')` → `screen.getByRole('button').elements()`.
//    Re-probed per the `AGENTS.md` rule rather than assumed: both return the
//    same 4 elements, same identities, same order — including the `disabled`
//    third button, which `getByRole` keeps (it is disabled, not hidden).
//  - `attachTo: document.body` dropped; `render` throws on it and attaches its
//    own container to the live document, which is all these tests need.
//  - Tab 1 lands on the group's single tab stop and tab 2 leaves the component
//    entirely, leaving `document.activeElement === document.body` — the same
//    result `user-event`'s polyfill produces under jsdom. Chromium routes the
//    second Tab out of the tester iframe.
//
// The `document.body.innerHTML = ''` resets are KEPT, for the `FocusGuards`
// reason: every assertion here reads `document.activeElement`, which is
// document-wide, so a leaked focusable node from an earlier test would change
// the tab order these tests are about. `vitest-browser-vue` registers its
// `beforeEach(cleanup)` on the file's root suite and these hooks sit inside a
// `describe`, so cleanup still runs first.
//
// One deliberate addition per the `AGENTS.md` retry rule: `RovingFocusItem`
// defers arrow-key focus movement through `nextTick(() => focusFirst(...))`
// (`RovingFocusItem.vue:96`), so the arrow tests settle with an awaited
// `toHaveFocus()` *before* the original's exact synchronous identity read. The
// synchronous `toBe` is kept — the retrying matcher only removes the race, it
// does not replace the assertion.

const ButtonsTemplate = `
  <Button value="one">
    One
  </Button>
  <Button value="two">
    Two
  </Button>
  <Button disabled value="three">
    Three
  </Button>
  <Button value="four">
    Four
  </Button>
`

describe('test RovingFocus functionalities', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  it('should only receive focus once, and select first item', async () => {
    const wrapper = await render(ButtonGroup, {
      global: {
        stubs: { Button },
      },
      slots: {
        default: {
          template: ButtonsTemplate,
        },
      },
    })
    const buttons = wrapper.getByRole('button').elements() as HTMLElement[]

    expect(document.activeElement).toBe(document.body)
    await userEvent.tab()
    expect(document.activeElement).toBe(buttons[0])
    await userEvent.tab()
    expect(document.activeElement).toBe(document.body)
  })

  it('should have default selected value based on `defaultValue`', async () => {
    const wrapper = await render(ButtonGroup, {
      global: {
        stubs: { Button },
      },
      props: {
        defaultValue: 'one',
      },
      slots: {
        default: {
          template: ButtonsTemplate,
        },
      },
    })
    const buttons = wrapper.getByRole('button').elements() as HTMLElement[]

    await expect.element(buttons[0]).toHaveAttribute('data-active', '')
    await expect.element(buttons[1]).not.toHaveAttribute('data-active')
    await expect.element(buttons[2]).not.toHaveAttribute('data-active')
  })
})

describe('test RovingFocus with Arrow Navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  it('[loop=false]: should stop at last item', async () => {
    const wrapper = await render(ButtonGroup, {
      global: {
        stubs: { Button },
      },
      props: {
        defaultValue: 'two',
      },
      slots: {
        default: {
          template: ButtonsTemplate,
        },
      },
    })
    const buttons = wrapper.getByRole('button').elements() as HTMLElement[]
    // make focus to the RovingFocusGroup
    await userEvent.tab()
    await expect.element(buttons[1]).toHaveAttribute('data-active', '')
    expect(buttons[1]).toBe(document.activeElement)

    await userEvent.keyboard('[ArrowRight]')
    await expect.element(buttons[3]).toHaveFocus()
    expect(buttons[2]).not.toBe(document.activeElement) // this element was disabled
    expect(buttons[3]).toBe(document.activeElement)

    await userEvent.keyboard('[ArrowRight]')
    expect(buttons[3]).toBe(document.activeElement) // stay at index 3 because loop=false
  })

  it('[loop=true]: should loop through items', async () => {
    const wrapper = await render(ButtonGroup, {
      global: {
        stubs: { Button },
      },
      props: {
        defaultValue: 'two',
        loop: true,
      },
      slots: {
        default: {
          template: ButtonsTemplate,
        },
      },
    })
    const buttons = wrapper.getByRole('button').elements() as HTMLElement[]

    // make focus to the RovingFocusGroup
    await userEvent.tab()
    await expect.element(buttons[1]).toHaveAttribute('data-active', '')
    expect(buttons[1]).toBe(document.activeElement)

    await userEvent.keyboard('[ArrowRight]')
    await userEvent.keyboard('[ArrowRight]')
    await expect.element(buttons[0]).toHaveFocus()
    expect(buttons[3]).not.toBe(document.activeElement)
    expect(buttons[0]).toBe(document.activeElement)
  })
})
