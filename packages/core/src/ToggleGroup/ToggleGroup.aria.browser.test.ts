import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { ToggleGroupItem, ToggleGroupRoot } from '.'

// Not a port — the story intentionally gives all three items the same label,
// which is useful to its visual fixture but weak as a semantic contract. This
// named fixture proves the group name, each item name, roving keyboard focus,
// and the single pressed state exposed through role filters.

describe('given a single-value ToggleGroup', () => {
  it('keeps its named pressed state in sync after keyboard activation', async () => {
    const screen = await render({
      components: { ToggleGroupItem, ToggleGroupRoot },
      template: `
        <ToggleGroupRoot type="single" default-value="center" aria-label="Text alignment">
          <ToggleGroupItem value="left" aria-label="Align left">L</ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center">C</ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right">R</ToggleGroupItem>
        </ToggleGroupRoot>
      `,
    })
    const center = screen.getByRole('button', { name: 'Align center', exact: true })
    const right = screen.getByRole('button', { name: 'Align right', exact: true })

    // `<html>` (role `document`) + `/children: deep-equal`: the only shape in
    // which an extra node anywhere in the tree fails the snapshot (a directive
    // at the root of a `<body>` snapshot is ignored — see AGENTS.md).
    await expect.element(document.documentElement).toMatchAriaInlineSnapshot(`
      - document:
        - /children: deep-equal
        - group "Text alignment":
          - button "Align left": L
          - button "Align center" [pressed]: C
          - button "Align right": R
    `)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(1)
    await expect.element(page.getByRole('button', { pressed: false })).toHaveLength(2)

    await center.click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(right).toHaveFocus()
    await userEvent.keyboard('{Space}')

    await expect.element(document.documentElement).toMatchAriaInlineSnapshot(`
      - document:
        - /children: deep-equal
        - group "Text alignment":
          - button "Align left": L
          - button "Align center": C
          - button "Align right" [pressed]: R
    `)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(1)
    await expect.element(page.getByRole('button', { pressed: false })).toHaveLength(2)
  })
})
