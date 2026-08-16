import type { Mock, MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'
import {
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from '.'

const OPEN_TEXT = 'Open Drawer'
const CLOSE_TEXT = 'Close Drawer'
const TITLE_TEXT = 'Drawer Title'
const TITLE_WARNING = 'Warning: `DrawerContent` requires a `DrawerTitle` for accessibility.'

const DrawerTest = defineComponent({
  components: {
    DrawerRoot,
    DrawerTrigger,
    DrawerPortal,
    DrawerOverlay,
    DrawerContent,
    DrawerTitle,
    DrawerDescription,
    DrawerClose,
  },
  template: `
    <DrawerRoot>
      <DrawerTrigger>${OPEN_TEXT}</DrawerTrigger>
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerTitle>${TITLE_TEXT}</DrawerTitle>
          <DrawerDescription>Description text</DrawerDescription>
          <DrawerClose>${CLOSE_TEXT}</DrawerClose>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  `,
})

const NoTitleDrawerTest = defineComponent({
  components: { DrawerRoot, DrawerTrigger, DrawerPortal, DrawerContent, DrawerClose },
  template: `
    <DrawerRoot>
      <DrawerTrigger>${OPEN_TEXT}</DrawerTrigger>
      <DrawerPortal>
        <DrawerContent>
          <DrawerClose>${CLOSE_TEXT}</DrawerClose>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  `,
})

describe('given a default Drawer', () => {
  let consoleWarnMock: MockInstance
  let consoleWarnMockFunction: Mock

  beforeEach(() => {
    consoleWarnMockFunction = vi.fn()
    consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(consoleWarnMockFunction)
  })

  afterEach(() => {
    consoleWarnMock.mockRestore()
    consoleWarnMockFunction.mockClear()
  })

  it('should pass axe accessibility tests when closed', async () => {
    await render(DrawerTest)
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('should pass axe accessibility tests when open', async () => {
    const screen = await render(DrawerTest)
    await screen.getByText(OPEN_TEXT, { exact: true }).click()
    await expect.element(screen.getByRole('dialog')).toBeInTheDocument()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  describe('after clicking the trigger', () => {
    it('should show drawer content', async () => {
      const screen = await render(DrawerTest)
      await screen.getByText(OPEN_TEXT, { exact: true }).click()
      await expect.element(screen.getByText(TITLE_TEXT, { exact: true })).toBeInTheDocument()
    })

    it('should close when close button is clicked', async () => {
      const screen = await render(DrawerTest)
      await screen.getByText(OPEN_TEXT, { exact: true }).click()
      const closeBtn = screen.getByText(CLOSE_TEXT, { exact: true })
      await closeBtn.click()
      await expect.element(closeBtn).not.toBeInTheDocument()
    })

    it('should close on Escape key', async () => {
      const screen = await render(DrawerTest)
      await screen.getByText(OPEN_TEXT, { exact: true }).click()
      await expect.element(screen.getByRole('dialog')).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      await expect.element(screen.getByText(TITLE_TEXT, { exact: true })).not.toBeInTheDocument()
    })

    it('should have role="dialog" on content', async () => {
      const screen = await render(DrawerTest)
      await screen.getByText(OPEN_TEXT, { exact: true }).click()
      await expect.element(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have aria-labelledby pointing to title', async () => {
      const screen = await render(DrawerTest)
      await screen.getByText(OPEN_TEXT, { exact: true }).click()
      const dialog = screen.getByRole('dialog')
      await expect.element(dialog).toBeInTheDocument()
      const labelId = (await dialog.element()).getAttribute('aria-labelledby')
      expect(labelId).toBeTruthy()
      const titleEl = document.getElementById(labelId!)
      expect(titleEl?.textContent).toBe(TITLE_TEXT)
    })

    it('should have aria-describedby pointing to description', async () => {
      const screen = await render(DrawerTest)
      await screen.getByText(OPEN_TEXT, { exact: true }).click()
      const dialog = screen.getByRole('dialog')
      await expect.element(dialog).toBeInTheDocument()
      const descId = (await dialog.element()).getAttribute('aria-describedby')
      expect(descId).toBeTruthy()
      const descEl = document.getElementById(descId!)
      expect(descEl?.textContent).toBe('Description text')
    })
  })

  describe('when no title is provided', () => {
    it('should warn to the console', async () => {
      const screen = await render(NoTitleDrawerTest)
      await screen.getByText(OPEN_TEXT, { exact: true }).click()
      await expect.element(screen.getByText(CLOSE_TEXT, { exact: true })).toBeInTheDocument()
      expect(consoleWarnMockFunction).toHaveBeenCalledWith(TITLE_WARNING)
    })
  })
})

describe('update:open change event details', () => {
  const DrawerWithReason = defineComponent({
    components: { DrawerRoot, DrawerTrigger, DrawerPortal, DrawerContent, DrawerTitle, DrawerClose },
    props: {
      onOpenChange: { type: Function, required: true },
    },
    template: `
      <DrawerRoot @update:open="onOpenChange">
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerPortal>
          <DrawerContent>
            <DrawerTitle>T</DrawerTitle>
            <DrawerClose>Close</DrawerClose>
          </DrawerContent>
        </DrawerPortal>
      </DrawerRoot>
    `,
  })

  it('emits trigger-press reason on trigger click', async () => {
    const onOpenChange = vi.fn()
    const screen = await render(DrawerWithReason, { props: { onOpenChange } })
    await screen.getByText('Open', { exact: true }).click()
    expect(onOpenChange).toHaveBeenCalledWith(true, { reason: 'trigger-press' })
  })

  it('emits close-press reason on close click', async () => {
    const onOpenChange = vi.fn()
    const screen = await render(DrawerWithReason, { props: { onOpenChange } })
    await screen.getByText('Open', { exact: true }).click()
    onOpenChange.mockClear()
    await screen.getByText('Close', { exact: true }).click()
    expect(onOpenChange).toHaveBeenCalledWith(false, { reason: 'close-press' })
  })
})
