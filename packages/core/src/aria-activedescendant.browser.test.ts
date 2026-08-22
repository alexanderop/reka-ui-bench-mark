import type { Locator } from 'vitest/browser'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import Autocomplete from './Autocomplete/story/_Autocomplete.vue'
import Combobox from './Combobox/story/_Combobox.vue'
import DropdownMenuWithFilter from './DropdownMenu/story/_DropdownMenuWithFilter.vue'

function resolveActiveDescendant(input: Locator) {
  const id = input.element().getAttribute('aria-activedescendant')
  return id ? document.getElementById(id) : null
}

async function expectActiveDescendant(input: Locator, name: string) {
  await expect.poll(() => resolveActiveDescendant(input)?.textContent?.trim()).toBe(name)
  const target = resolveActiveDescendant(input)
  expect(target).not.toBeNull()
  expect(target!.id).toBe(input.element().getAttribute('aria-activedescendant'))
}

describe('aria-activedescendant lifecycle', () => {
  it.each([
    ['Combobox', Combobox],
    ['Autocomplete', Autocomplete],
  ])('%s resolves the highlighted option and removes the relation when closed', async (_name, fixture) => {
    const screen = await render(fixture)
    const input = screen.getByRole('combobox')
    await expect.element(input).not.toHaveAttribute('aria-activedescendant')

    await input.fill('a')
    await expectActiveDescendant(input, 'Apple')

    await userEvent.keyboard('{ArrowDown}')
    await expectActiveDescendant(input, 'Banana')

    await userEvent.keyboard('{Escape}')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
    await expect.element(input).not.toHaveAttribute('aria-activedescendant')
    expect(resolveActiveDescendant(input)).toBeNull()
  })

  it('dropdown menu filter always points at a mounted menuitem and removes the relation with the menu', async () => {
    await render(DropdownMenuWithFilter)
    await page.getByRole('button', { name: 'Customise options' }).click()
    const input = page.getByRole('searchbox')
    await input.click()
    await expect.element(input).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{ArrowDown}')
    await expectActiveDescendant(input, 'New Tab')

    await userEvent.keyboard('{ArrowDown}')
    await expectActiveDescendant(input, 'New Window')

    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(page.getByRole('searchbox')).not.toBeInTheDocument()
  })
})
