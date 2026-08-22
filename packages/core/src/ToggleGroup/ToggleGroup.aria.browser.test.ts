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

    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - group "Text alignment":
        - button "Align left"
        - button "Align center" [pressed]
        - button "Align right"
    `)
    expect(page.getByRole('button', { pressed: true }).elements()).toHaveLength(1)
    expect(page.getByRole('button', { pressed: false }).elements()).toHaveLength(2)

    await center.click()
    await userEvent.keyboard('{ArrowRight}')
    expect(right.element()).toBe(document.activeElement)
    await userEvent.keyboard('{Space}')

    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - group "Text alignment":
        - button "Align left"
        - button "Align center"
        - button "Align right" [pressed]
    `)
    expect(page.getByRole('button', { pressed: true }).elements()).toHaveLength(1)
    expect(page.getByRole('button', { pressed: false }).elements()).toHaveLength(2)
  })
})
