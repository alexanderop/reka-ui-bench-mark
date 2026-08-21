import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import Combobox from './story/_Combobox.vue'

// Not a port — no jsdom original, so `port:parity` reports this file as
// unpaired and skips it. ARIA-tree transition tests for the Combobox fixture;
// see Select.aria.browser.test.ts for the pattern. This one is the clean
// counterpart: `ComboboxLabel` is nested inside `ComboboxGroup` in the fixture,
// so every group is named — the tree shows what Select's and DropdownMenu's
// should look like.

describe('given the Combobox story fixture', () => {
  it('round-trips the accessibility tree: rest → open → Escape', async () => {
    const screen = await render(Combobox)
    // The input has no label in the fixture, so its placeholder is its name.
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - combobox "Placeholder..."
      - button "Show popup"
    `)
    expect(page.getByRole('combobox', { expanded: true }).elements()).toHaveLength(0)

    await screen.getByRole('button', { name: 'Show popup', exact: true }).click()
    await expect.element(page.getByRole('listbox')).toBeVisible()
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - combobox "Placeholder..." [expanded]
      - button "Show popup" [expanded]
      - listbox:
        - group "Fruits":
          - text: Fruits
          - option "Apple"
          - option "Banana"
          - option "Blueberry"
          - option "Grapes"
          - option "Pineapple"
        - group "Vegetables":
          - text: Vegetables
          - option "Aubergine"
          - option "Broccoli"
          - option "Carrot"
          - option "Courgette"
          - option "Leek"
    `)
    expect(page.getByRole('combobox', { expanded: true }).elements()).toHaveLength(1)
    expect(page.getByRole('group').elements()).toHaveLength(2)
    expect(page.getByRole('group', { name: 'Fruits', exact: true }).elements()).toHaveLength(1)

    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('listbox')).not.toBeInTheDocument()
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - combobox "Placeholder..."
      - button "Show popup"
    `)
    expect(page.getByRole('combobox', { expanded: true }).elements()).toHaveLength(0)
  })
})
