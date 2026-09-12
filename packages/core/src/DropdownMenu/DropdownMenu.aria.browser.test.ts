import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import DropdownMenu from './story/_DropdownMenu.vue'

// Not a port — no jsdom original, so `port:parity` reports this file as
// unpaired and skips it. ARIA-tree transition tests for the DropdownMenu
// fixture; see Select.aria.browser.test.ts for the pattern.

async function open() {
  const screen = await render(DropdownMenu)
  await screen.getByRole('button').click()
  await expect.element(page.getByRole('menu')).toBeVisible()
  return screen
}

describe('given the DropdownMenu story fixture', () => {
  it('round-trips the accessibility tree: rest → open → Escape', async () => {
    const screen = await render(DropdownMenu)
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - button "Customise options"
    `)
    await expect.element(page.getByRole('button', { expanded: true })).toHaveLength(0)

    await screen.getByRole('button').click()
    await expect.element(page.getByRole('menu')).toBeVisible()
    // As written today: `DropdownMenuLabel` "People" sits beside the radio
    // group, so it is loose text and the group is unnamed; and the trailing
    // `- img` is `DropdownMenuArrow`'s `<svg>`, which carries no `aria-hidden`.
    // Both are held by the quarantined tests below.
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - button "Customise options" [expanded]
      - menu "Customise options":
        - menuitem "New Tab ⌘+T"
        - menuitem "New Window ⌘+N"
        - menuitem "New Private Window ⇧+⌘+N" [disabled]
        - separator
        - menuitemcheckbox "Show Bookmarks ⌘+B"
        - menuitemcheckbox "Show Full URLs"
        - separator
        - text: People
        - group:
          - menuitemradio "Pedro Duarte" [checked]
          - menuitemradio "Colm Tuite"
        - img
    `)
    await expect.element(page.getByRole('button', { expanded: true })).toHaveLength(1)
    await expect.element(page.getByRole('menuitemradio', { checked: true })).toHaveLength(1)
    await expect.element(page.getByRole('menuitemcheckbox', { checked: true })).toHaveLength(0)

    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - button "Customise options"
    `)
    await expect.element(page.getByRole('button', { expanded: true })).toHaveLength(0)
  })

  // Same mechanism as Select: `MenuGroup` (which `MenuRadioGroup` wraps) sets
  // `aria-labelledby` to its own id (MenuGroup.vue:28) and `MenuLabel` takes
  // that id only from a group context it is nested in (MenuLabel.vue:15-21).
  // The fixture and docs/components/demo/DropdownMenu/tailwind/index.vue:301-304
  // place the label before the group, so the reference dangles.
  // @finding DropdownMenu/DropdownMenu.aria.browser.test.ts#label-outside-radiogroup-dangling-labelledby
  it.fails('names the radio group by its label', async () => {
    await open()
    expect(page.getByRole('group', { name: 'People', exact: true }).elements()).toHaveLength(1)
  })

  // PopperArrow.vue renders a bare `<svg>` (as: 'svg', no aria-hidden). The
  // fixture's icons are `@iconify/vue` and carry aria-hidden themselves, so
  // the only image role in the open menu is the arrow.
  // @finding DropdownMenu/DropdownMenu.aria.browser.test.ts#popper-arrow-svg-exposed-as-img
  it.fails('exposes no image inside the open menu', async () => {
    await open()
    expect(page.getByRole('menu').getByRole('img').elements()).toHaveLength(0)
  })
})
