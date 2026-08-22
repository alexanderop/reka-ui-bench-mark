import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '.'
import DropdownMenu from './story/_DropdownMenu.vue'

const DropdownMenuTabTest = defineComponent({
  components: { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger },
  props: { modal: { type: Boolean, default: true } },
  template: `
    <div><button>Before</button><DropdownMenuRoot :open="true" :modal="modal">
      <DropdownMenuTrigger>Open</DropdownMenuTrigger><DropdownMenuPortal disabled>
        <DropdownMenuContent @close-auto-focus.prevent><DropdownMenuItem>Item</DropdownMenuItem>
          <DropdownMenuSub :open="true"><DropdownMenuSubTrigger>Sub Trigger</DropdownMenuSubTrigger>
            <DropdownMenuPortal disabled><DropdownMenuSubContent><DropdownMenuItem>Sub Item</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot><button>After</button></div>`,
})

describe('given default DropdownMenu', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => { screen = await render(DropdownMenu) })

  it('should render trigger button', async () => {
    await expect.element(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  describe('after opening the dropdown', () => {
    beforeEach(async () => { await screen.getByRole('button').click() })

    it('should pass axe accessibility tests', async () => {
      expect(await axe(document.body)).toHaveNoViolations()
    })

    it('should render the menu', async () => {
      await expect.element(screen.getByRole('menu')).toBeInTheDocument()
    })

    describe('after selecting the first item', () => {
      beforeEach(async () => { await screen.getByRole('menuitem').first().click() })

      it('should close the modal', async () => {
        await expect.element(screen.getByRole('menu')).not.toBeInTheDocument()
      })

      it('should emit select event', () => {
        expect(screen.emitted('select')?.length).toBe(1)
      })
    })
  })
})

describe('given DropdownMenu tab navigation', () => {
  async function tabEvent(modal: boolean, index = 0) {
    const screen = await render(DropdownMenuTabTest, { props: { modal } })
    const menu = screen.getByRole('menu').elements()[index]
    // The cancelation of this exact Tab event is the contract. Browser
    // keyboard helpers do not expose the dispatched event's defaultPrevented.
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
    menu.dispatchEvent(event)
    return event
  }

  it('should allow Tab to move focus out of non-modal menu', async () => {
    expect((await tabEvent(false)).defaultPrevented).toBe(false)
  })

  it('should prevent Tab in modal menu', async () => {
    expect((await tabEvent(true)).defaultPrevented).toBe(true)
  })

  it('should prevent Tab in modal submenu', async () => {
    expect((await tabEvent(true, 1)).defaultPrevented).toBe(true)
  })
})
