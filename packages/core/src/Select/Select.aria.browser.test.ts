import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import Select from './story/_Select.vue'

// Not a port — no jsdom original, so `port:parity` reports this file as
// unpaired and skips it. ARIA-tree transition tests for the Select fixture:
// the at-rest tree, the open tree, and the round trip back on Escape. A
// `Select.browser.test.ts` assertion reads one attribute at a time; this reads
// the structure an AT is handed, and the `getByRole` state filter proves the
// state is on exactly one node (the snapshot alone cannot — see AGENTS.md).

async function openFirst() {
  const screen = await render(Select)
  await screen.getByRole('combobox').first().click()
  await expect.element(page.getByRole('listbox')).toBeVisible()
  return screen
}

describe('given the Select story fixture', () => {
  it('round-trips the accessibility tree: rest → open → Escape', async () => {
    const screen = await render(Select)
    // The fixture renders two Selects (item-aligned and popper).
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - combobox "Customise options"
      - combobox "Customise options"
    `)
    expect(page.getByRole('combobox', { expanded: true }).elements()).toHaveLength(0)

    await screen.getByRole('combobox').first().click()
    await expect.element(page.getByRole('listbox')).toBeVisible()
    // This is the tree as the fixture is written today: `SelectLabel` sits
    // *beside* `SelectGroup`, so the label is loose text and each group is
    // unnamed. The quarantined test below holds the intended structure; when it
    // goes red, this snapshot changes too and both get updated together.
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - combobox "Customise options" [expanded]
      - combobox "Customise options"
      - listbox:
        - text: Fruits
        - group:
          - option "Apple"
          - option "Banana"
          - option "Blueberry"
          - option "Grapes"
          - option "Pineapple"
        - text: Vegetables
        - group:
          - option "Aubergine"
          - option "Broccoli"
          - option "Carrot"
          - option "Courgette" [disabled]
          - option "Leek"
    `)
    expect(page.getByRole('combobox', { expanded: true }).elements()).toHaveLength(1)
    expect(page.getByRole('option', { selected: true }).elements()).toHaveLength(0)

    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('listbox')).not.toBeInTheDocument()
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - combobox "Customise options"
      - combobox "Customise options"
    `)
    expect(page.getByRole('combobox', { expanded: true }).elements()).toHaveLength(0)
  })

  // `SelectGroup` renders `aria-labelledby=<its own id>` and `SelectLabel`
  // takes that id *only when nested inside the group* (SelectGroup.vue:28,
  // SelectLabel.vue:17-23). The fixture — and the docs demo it mirrors,
  // docs/components/demo/Select/tailwind/index.vue:50-53 — place the label as
  // a sibling, so the group's `aria-labelledby` points at an id no element
  // carries and the group is unnamed. axe files a dangling idref under
  // `incomplete`, which `toHaveNoViolations` scores as a pass.
  // @finding Select/Select.aria.browser.test.ts#label-outside-group-dangling-labelledby
  it.fails('names each option group by its label', async () => {
    await openFirst()
    expect(page.getByRole('group', { name: 'Fruits', exact: true }).elements()).toHaveLength(1)
  })
})
