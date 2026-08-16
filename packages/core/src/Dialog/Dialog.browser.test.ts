import type { Mock, MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, nextTick } from 'vue'
import { sleep } from '@/test'
import { DialogClose, DialogContent, DialogOverlay, DialogRoot, DialogTitle, DialogTrigger } from '.'

const OPEN_TEXT = 'Open'
const CLOSE_TEXT = 'Close'
const TITLE_TEXT = 'Title'
const DESCRIPTION_WARNING = 'Warning: Missing `Description` or `aria-describedby="undefined"` for DialogContent.'
const TITLE_WARNING = `Warning: \`DialogContent\` requires a \`DialogTitle\` for the component to be accessible for screen reader users.

If you want to hide the \`DialogTitle\`, you can wrap it with our VisuallyHidden component.

For more information, see https://www.reka-ui.com/docs/components/dialog.html#title`

const NoLabelDialogTest = defineComponent({
  components: { DialogRoot, DialogTrigger, DialogOverlay, DialogContent, DialogClose },
  template: `<DialogRoot>
  <DialogTrigger>${OPEN_TEXT}</DialogTrigger>
  <DialogOverlay />
  <DialogContent :aria-describedby="undefined">
    <DialogClose>${CLOSE_TEXT}</DialogClose>
  </DialogContent>
</DialogRoot>`,
})

const UndefinedDescribedByDialog = defineComponent({
  components: { DialogRoot, DialogTrigger, DialogOverlay, DialogContent, DialogClose, DialogTitle },
  template: `<DialogRoot>
  <DialogTrigger>${OPEN_TEXT}</DialogTrigger>
  <DialogOverlay />
  <DialogContent :aria-describedby="undefined">
    <DialogTitle>${TITLE_TEXT}</DialogTitle>
    <DialogClose>${CLOSE_TEXT}</DialogClose>
  </DialogContent>
</DialogRoot>`,
})

async function renderAndClickDialogTrigger(Dialog: any) {
  const screen = await render(Dialog)
  await screen.locator.getByRole('button', { name: OPEN_TEXT, exact: true }).click()
  return screen
}

const DialogTest = defineComponent({
  components: { DialogRoot, DialogTrigger, DialogOverlay, DialogContent, DialogClose, DialogTitle },
  template: `<DialogRoot>
  <DialogTrigger>${OPEN_TEXT}</DialogTrigger>
  <DialogOverlay data-testid="default-overlay" style="position: fixed; inset: 0" />
  <DialogContent>
    <DialogTitle>${TITLE_TEXT}</DialogTitle>
    <DialogClose>${CLOSE_TEXT}</DialogClose>
  </DialogContent>
</DialogRoot>`,
})

const UnmountOnHideDialogTest = defineComponent({
  components: { DialogRoot, DialogTrigger, DialogOverlay, DialogContent, DialogClose, DialogTitle },
  template: `<DialogRoot :unmount-on-hide="false">
  <DialogTrigger>${OPEN_TEXT}</DialogTrigger>
  <DialogOverlay />
  <DialogContent>
    <DialogTitle>${TITLE_TEXT}</DialogTitle>
    <DialogClose>${CLOSE_TEXT}</DialogClose>
  </DialogContent>
</DialogRoot>`,
})

const NonModalUnmountOnHideDialogTest = defineComponent({
  components: { DialogRoot, DialogTrigger, DialogOverlay, DialogContent, DialogClose, DialogTitle },
  template: `<DialogRoot :modal="false" :unmount-on-hide="false">
  <DialogTrigger>${OPEN_TEXT}</DialogTrigger>
  <DialogContent>
    <DialogTitle>${TITLE_TEXT}</DialogTitle>
    <DialogClose>${CLOSE_TEXT}</DialogClose>
  </DialogContent>
</DialogRoot>`,
})

const NestedContentDialogTest = defineComponent({
  components: { DialogRoot, DialogTrigger, DialogOverlay, DialogContent, DialogClose, DialogTitle },
  template: `<DialogRoot>
  <DialogTrigger>${OPEN_TEXT}</DialogTrigger>
  <DialogOverlay>
    <DialogContent>
      <DialogTitle>${TITLE_TEXT}</DialogTitle>
      <input data-testid="text-input" type="text">
      <DialogClose>${CLOSE_TEXT}</DialogClose>
    </DialogContent>
  </DialogOverlay>
</DialogRoot>`,
})

describe('given a Dialog with unmountOnHide=false', () => {
  let screen: Awaited<ReturnType<typeof render>>
  let trigger: ReturnType<typeof page.getByRole>

  beforeEach(async () => {
    screen = await render(UnmountOnHideDialogTest)
    trigger = screen.getByRole('button', { name: OPEN_TEXT, exact: true })
  })

  it('should keep content in DOM when closed after being opened', async () => {
    await trigger.click()
    await userEvent.keyboard('{Escape}')

    const contentEl = document.querySelector('[role="dialog"]')
    expect(contentEl).not.toBeNull()
    expect((contentEl as HTMLElement).style.display).toBe('none')
  })

  it('should not pull focus into the content while closed on mount', async () => {
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.activeElement).toBe(document.body)
  })

  it('should focus the close button on open', async () => {
    await trigger.click()
    const closeButton = screen.getByRole('button', { name: CLOSE_TEXT, exact: true })
    await expect.element(closeButton).toHaveFocus()
  })

  it('should re-focus the content when reopened', async () => {
    await trigger.click()
    await userEvent.keyboard('{Escape}')
    await expect.element(trigger).toHaveFocus()

    await trigger.click()
    const closeButton = screen.getByRole('button', { name: CLOSE_TEXT, exact: true })
    await expect.element(closeButton).toHaveFocus()
  })

  it('should restore focus to trigger on close', async () => {
    await trigger.click()
    await userEvent.keyboard('{Escape}')
    await expect.element(trigger).toHaveFocus()
  })

  it('should not apply aria-hidden to body after open then close', async () => {
    await trigger.click()
    await userEvent.keyboard('{Escape}')

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.getAttribute('aria-hidden')).toBeNull()
  })

  it('should pass axe accessibility tests when open', async () => {
    await trigger.click()
    expect(await axe(document.body)).toHaveNoViolations()
  })
})

describe('given a non-modal Dialog with unmountOnHide=false', () => {
  let screen: Awaited<ReturnType<typeof render>>
  let trigger: ReturnType<typeof page.getByRole>

  beforeEach(async () => {
    screen = await render(NonModalUnmountOnHideDialogTest)
    trigger = screen.getByRole('button', { name: OPEN_TEXT, exact: true })
  })

  it('should keep content in DOM when closed after being opened', async () => {
    await trigger.click()
    await userEvent.keyboard('{Escape}')

    const contentEl = document.querySelector('[role="dialog"]')
    expect(contentEl).not.toBeNull()
    expect((contentEl as HTMLElement).style.display).toBe('none')
  })

  it('should focus the close button on open', async () => {
    expect(document.activeElement).toBe(document.body)

    await trigger.click()
    const closeButton = screen.getByRole('button', { name: CLOSE_TEXT, exact: true })
    await expect.element(closeButton).toHaveFocus()
  })

  it('should restore focus to trigger on close', async () => {
    await trigger.click()
    await userEvent.keyboard('{Escape}')
    await expect.element(trigger).toHaveFocus()
  })
})

describe('given a Dialog with unmountOnHide=false, openAutoFocus', () => {
  const OpenAutoFocusDialog = defineComponent({
    components: { DialogRoot, DialogTrigger, DialogContent, DialogClose, DialogTitle },
    props: ['onOpenAutoFocus'],
    template: `<DialogRoot :unmount-on-hide="false">
  <DialogTrigger>${OPEN_TEXT}</DialogTrigger>
  <DialogContent @open-auto-focus="onOpenAutoFocus">
    <DialogTitle>${TITLE_TEXT}</DialogTitle>
    <DialogClose>${CLOSE_TEXT}</DialogClose>
  </DialogContent>
</DialogRoot>`,
  })

  it('should not emit openAutoFocus while closed and emit once per open', async () => {
    const onOpenAutoFocus = vi.fn()
    const screen = await render(OpenAutoFocusDialog, { props: { onOpenAutoFocus } })
    const trigger = screen.getByRole('button', { name: OPEN_TEXT, exact: true })

    await nextTick()
    expect(onOpenAutoFocus).toHaveBeenCalledTimes(0)

    await trigger.click()
    await vi.waitFor(() => expect(onOpenAutoFocus).toHaveBeenCalledTimes(1))
  })
})

describe('given two Dialogs with unmountOnHide=false', () => {
  const TwoDialogsTest = defineComponent({
    components: { DialogRoot, DialogTrigger, DialogOverlay, DialogContent, DialogClose, DialogTitle },
    props: ['onInteractOutside'],
    template: `<div>
  <DialogRoot :unmount-on-hide="false">
    <DialogTrigger data-testid="first-trigger">open first</DialogTrigger>
    <DialogOverlay />
    <DialogContent data-testid="first-content">
      <DialogTitle>first</DialogTitle>
      <DialogClose data-testid="first-close">close first</DialogClose>
    </DialogContent>
  </DialogRoot>
  <DialogRoot :modal="false" :unmount-on-hide="false">
    <DialogTrigger data-testid="second-trigger">open second</DialogTrigger>
    <DialogContent data-testid="second-content" @interact-outside="onInteractOutside">
      <DialogTitle>second</DialogTitle>
      <DialogClose data-testid="second-close">close second</DialogClose>
    </DialogContent>
  </DialogRoot>
</div>`,
  })

  let screen: Awaited<ReturnType<typeof render>>
  let onInteractOutside: Mock

  beforeEach(async () => {
    onInteractOutside = vi.fn()
    screen = await render(TwoDialogsTest, { props: { onInteractOutside } })
  })

  it('should close the open dialog on Escape even though a hidden one mounted after it', async () => {
    const trigger = screen.getByTestId('first-trigger')
    await trigger.click()

    const content = screen.getByTestId('first-content').element() as HTMLElement
    expect(content.style.display).not.toBe('none')

    await userEvent.keyboard('{Escape}')

    expect(content.style.display).toBe('none')
    await expect.element(trigger).toHaveFocus()
  })

  it('should keep the modal focus trap active despite the hidden later-mounted scope', async () => {
    await screen.getByTestId('first-trigger').click()
    const close = screen.getByTestId('first-close')
    await expect.element(close).toHaveFocus()

    const outside = screen.getByTestId('second-trigger').element() as HTMLElement
    outside.focus()
    await nextTick()

    const content = screen.getByTestId('first-content').element() as HTMLElement
    expect(content.contains(document.activeElement)).toBe(true)
  })

  it('should not emit interactOutside on a closed keep-mounted dialog', async () => {
    await sleep(1)
    await screen.getByTestId('second-trigger').click()
    expect(onInteractOutside).not.toHaveBeenCalled()
  })
})

function makeModalDialog(contentBinding: string) {
  return defineComponent({
    components: { DialogRoot, DialogTrigger, DialogContent, DialogClose, DialogTitle },
    template: `<DialogRoot>
  <DialogTrigger>${OPEN_TEXT}</DialogTrigger>
  <DialogContent ${contentBinding}>
    <DialogTitle>${TITLE_TEXT}</DialogTitle>
    <DialogClose>${CLOSE_TEXT}</DialogClose>
  </DialogContent>
</DialogRoot>`,
  })
}

describe('given a modal Dialog (#2677)', () => {
  let consoleWarnMock: MockInstance

  beforeEach(() => {
    document.body.style.pointerEvents = ''
    consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnMock.mockRestore()
  })

  it('should lock body pointer-events by default', async () => {
    const screen = await render(makeModalDialog(''))
    await screen.locator.getByRole('button', { name: OPEN_TEXT, exact: true }).click()
    screen.getByRole('button', { name: CLOSE_TEXT, exact: true }).element()

    expect(document.body.style.pointerEvents).toBe('none')
  })

  it('should respect disableOutsidePointerEvents=false on the content', async () => {
    const screen = await render(makeModalDialog(':disable-outside-pointer-events="false"'))
    await screen.locator.getByRole('button', { name: OPEN_TEXT, exact: true }).click()
    screen.getByRole('button', { name: CLOSE_TEXT, exact: true }).element()

    expect(document.body.style.pointerEvents).not.toBe('none')
  })

  it('should still lock body pointer-events when explicitly true', async () => {
    const screen = await render(makeModalDialog(':disable-outside-pointer-events="true"'))
    await screen.locator.getByRole('button', { name: OPEN_TEXT, exact: true }).click()
    screen.getByRole('button', { name: CLOSE_TEXT, exact: true }).element()

    expect(document.body.style.pointerEvents).toBe('none')
  })
})

describe('given a default Dialog', () => {
  let screen: Awaited<ReturnType<typeof render>>
  let trigger: ReturnType<typeof page.getByRole>
  let closeButton: HTMLElement
  let consoleWarnMock: MockInstance
  let consoleWarnMockFunction: Mock

  beforeEach(async () => {
    screen = await render(DialogTest)
    trigger = screen.getByRole('button', { name: OPEN_TEXT, exact: true })
    consoleWarnMockFunction = vi.fn()
    consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      if (String(args[0]).startsWith('Warning:'))
        consoleWarnMockFunction(...args)
    })
  })

  afterEach(() => {
    consoleWarnMock.mockRestore()
    consoleWarnMockFunction.mockClear()
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(document.body)).toHaveNoViolations()

    await trigger.click()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  describe('after clicking the trigger', () => {
    beforeEach(async () => {
      await trigger.click()
      closeButton = screen.getByRole('button', { name: CLOSE_TEXT, exact: true }).element() as HTMLElement
    })

    describe('when no description has been provided', () => {
      it('should warn to the console', () => {
        expect(consoleWarnMockFunction).toHaveBeenCalledWith(DESCRIPTION_WARNING)
      })
    })

    describe('when no title has been provided', () => {
      it('should warn to the console', async () => {
        await userEvent.keyboard('{Escape}')
        await sleep(1)
        consoleWarnMockFunction.mockClear()

        await renderAndClickDialogTrigger(NoLabelDialogTest)
        expect(consoleWarnMockFunction).toHaveBeenCalledWith(TITLE_WARNING)
      })
    })

    describe('when aria-describedby is set to undefined', () => {
      it('should not warn to the console', async () => {
        await userEvent.keyboard('{Escape}')
        await sleep(1)
        consoleWarnMockFunction.mockClear()

        await renderAndClickDialogTrigger(UndefinedDescribedByDialog)
        expect(consoleWarnMockFunction).not.toHaveBeenCalled()
      })
    })

    it('should open the content', () => {
      expect(closeButton.isConnected).toBe(true)
    })

    it('should focus the close button', async () => {
      await expect.element(closeButton).toHaveFocus()
      expect(closeButton).toBe(document.activeElement)
    })

    describe('when pressing escape', () => {
      beforeEach(async () => {
        await userEvent.keyboard('{Escape}')
      })

      it('should close the content', () => {
        expect(closeButton.isConnected).toBe(false)
      })

      it('should focus trigger', async () => {
        await expect.element(trigger).toHaveFocus()
        expect(document.activeElement).toBe(trigger.element())
      })
    })

    describe('when clicking the overlay', () => {
      beforeEach(async () => {
        await sleep(1)
        await screen.getByTestId('default-overlay').click()
      })

      it('should close the content', () => {
        expect(closeButton.isConnected).toBe(false)
      })

      it('should focus trigger', async () => {
        await expect.element(trigger).toHaveFocus()
        expect(document.activeElement).toBe(trigger.element())
      })
    })
  })
})

describe('given a Dialog with content nested inside the overlay', () => {
  let screen: Awaited<ReturnType<typeof render>>
  let consoleWarnMock: MockInstance

  beforeEach(async () => {
    screen = await render(NestedContentDialogTest)
    consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await screen.getByRole('button', { name: OPEN_TEXT, exact: true }).click()
    screen.getByRole('button', { name: CLOSE_TEXT, exact: true }).element()
  })

  afterEach(() => {
    consoleWarnMock.mockRestore()
  })

  describe('when pressing down on a control inside the content', () => {
    it('should not prevent the default pointerdown action', async () => {
      const input = screen.getByTestId('text-input').element() as HTMLInputElement
      let pointerEvent: PointerEvent | undefined
      input.addEventListener('pointerdown', event => pointerEvent = event, { once: true })

      await page.elementLocator(input).click()

      expect(pointerEvent?.defaultPrevented).toBe(false)
    })

    it('should keep the dialog open', async () => {
      await screen.getByTestId('text-input').click()

      expect(document.body.textContent).toContain(CLOSE_TEXT)
    })
  })
})
