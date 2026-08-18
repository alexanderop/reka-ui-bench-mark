import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import Menubar from './story/_Menubar.vue'

describe('given default Menubar', () => {
  let screen: Awaited<ReturnType<typeof render>>
  beforeEach(async () => { screen = await render(Menubar) })

  it('should render all trigger button', () => {
    expect(screen.container.querySelectorAll('button').length).toBe(4)
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  describe('after opening the dropdown', () => {
    beforeEach(async () => {
      await userEvent.click(screen.container.querySelector('button')!)
    })

    // @finding Menubar/Menubar.test.ts#open-color-contrast
    it.fails('should pass axe accessibility tests', async () => {
      expect(await axe(document.body)).toHaveNoViolations()
    })

    it('should render the menu', async () => {
      await expect.element(screen.getByRole('menu')).toBeInTheDocument()
    })

    describe('after selecting the first item', () => {
      beforeEach(async () => {
        await screen.getByRole('menuitem', { name: 'New Tab' }).click()
      })
      it('should close the modal', async () => { await expect.element(screen.getByRole('menu')).not.toBeInTheDocument() })
      it('should emit select event', () => { expect(screen.emitted('select')?.length).toBe(1) })
    })
  })
})
