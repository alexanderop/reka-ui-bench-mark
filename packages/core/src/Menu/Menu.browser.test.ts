import type { Locator } from 'vitest/browser'
import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import Menu from './story/_Menu.vue'
import MenuWithSubmenu from './story/_MenuWithSubmenu.vue'

describe('given a default Menu', () => {
  let screen: Awaited<ReturnType<typeof render>>
  beforeEach(async () => { screen = await render(Menu) })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('should have all the groups', () => {
    expect(screen.getByRole('group').elements().length).toBe(4)
  })

  it('should render item in group', () => {
    expect(screen.getByRole('group').elements()[0].querySelectorAll('[role=menuitem]').length).toBe(5)
  })

  describe('after focusing on item', () => {
    let firstItem: Locator
    beforeEach(async () => {
      firstItem = screen.getByRole('menuitem').first()
      firstItem.element().focus()
      await expect.element(firstItem).toHaveFocus()
    })

    it('should have highlighted state', () => {
      expect(firstItem.element().parentElement?.innerHTML).toContain('data-highlighted')
    })

    describe('after selecting the item', () => {
      beforeEach(async () => { await userEvent.click(firstItem) })
      it('should emit select', () => { expect(screen.emitted('select')?.length).toBe(1) })
    })
  })
})

describe('given a Menu with submenu', () => {
  let screen: Awaited<ReturnType<typeof render>>
  beforeEach(async () => { screen = await render(MenuWithSubmenu) })

  it('should highlight sub trigger on pointermove', async () => {
    const subTrigger = screen.getByRole('menuitem').all().find(locator => locator.element().getAttribute('aria-haspopup') === 'menu')!
    expect(subTrigger).toBeTruthy()
    await userEvent.hover(subTrigger)
    await expect.element(subTrigger).toHaveAttribute('data-highlighted')
  })
})
