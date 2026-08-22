import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { commands, page, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from '.'

const OPTIONS = Array.from({ length: 12 }, (_, index) => `Option ${index + 1}`)

const SelectScrollButtonFixture = defineComponent({
  setup() {
    return () => h(SelectRoot, { defaultValue: OPTIONS[0] }, () => [
      h(SelectTrigger, {
        'aria-label': 'Choose an option',
        'style': 'width: 180px; height: 36px;',
      }, () => h(SelectValue)),
      h(SelectPortal, null, () => h(SelectContent, {
        position: 'popper',
        sideOffset: 4,
        style: {
          background: 'white',
          height: '150px',
          width: '180px',
        },
      }, () => [
        h(SelectScrollUpButton, {
          'data-testid': 'scroll-up',
          'style': 'height: 24px;',
        }, () => 'Scroll up'),
        h(SelectViewport, {
          'data-testid': 'viewport',
          'style': 'min-height: 0;',
        }, () => OPTIONS.map(option => h(SelectItem, {
          key: option,
          value: option,
          style: {
            alignItems: 'center',
            display: 'flex',
            height: '32px',
          },
        }, () => h(SelectItemText, null, () => option)))),
        h(SelectScrollDownButton, {
          'data-testid': 'scroll-down',
          'style': 'height: 24px;',
        }, () => 'Scroll down'),
      ])),
    ])
  },
})

describe('select scroll button browser interactions', () => {
  it('reveals overflowing options by hovering the down and up buttons', async () => {
    const screen = await render(SelectScrollButtonFixture)
    const trigger = screen.getByRole('combobox', { name: 'Choose an option', exact: true })

    await trigger.click()
    await expect.element(page.getByRole('listbox')).toBeInTheDocument()

    const viewport = page.getByTestId('viewport')
    const firstOption = page.getByRole('option', { name: OPTIONS[0], exact: true })
    const lastOption = page.getByRole('option', { name: OPTIONS.at(-1)!, exact: true })

    await expect.element(firstOption).toBeInViewport({ ratio: 1 })
    await expect.element(lastOption).not.toBeInViewport()
    await expect.element(page.getByTestId('scroll-down')).toBeInTheDocument()
    await expect.element(page.getByTestId('scroll-up')).not.toBeInTheDocument()

    await page.getByTestId('scroll-down').hover()

    await expect.poll(() => (viewport.element() as HTMLElement).scrollTop).toBeGreaterThan(0)
    await expect.element(lastOption).toBeInViewport({ ratio: 1 })
    await expect.element(page.getByTestId('scroll-down')).not.toBeInTheDocument()
    await expect.element(page.getByTestId('scroll-up')).toBeInTheDocument()

    await page.getByTestId('scroll-up').hover()

    await expect.poll(() => (viewport.element() as HTMLElement).scrollTop).toBe(0)
    await expect.element(firstOption).toBeInViewport({ ratio: 1 })
    await expect.element(page.getByTestId('scroll-up')).not.toBeInTheDocument()
    await expect.element(page.getByTestId('scroll-down')).toBeInTheDocument()
  })

  it('starts scrolling on a real pointer press and stops when the pointer leaves', async () => {
    const screen = await render(SelectScrollButtonFixture)
    await screen.getByRole('combobox', { name: 'Choose an option', exact: true }).click()

    const viewport = page.getByTestId('viewport')
    const scrollTop = () => (viewport.element() as HTMLElement).scrollTop

    // First reach the bottom through the public hover interaction. The button
    // unmounts there while the real mouse stays at its former screen position.
    await page.getByTestId('scroll-down').hover()
    await expect.element(page.getByTestId('scroll-down')).not.toBeInTheDocument()

    // Home is handled by the focused listbox and scrolls its first item into
    // view. The down button reappears under the stationary mouse, allowing the
    // next trusted pointerdown to exercise the press path without an earlier
    // pointermove starting the same timer first.
    await userEvent.keyboard('{Home}')
    await expect.poll(scrollTop).toBe(0)
    const downButton = page.getByTestId('scroll-down')
    await expect.element(downButton).toBeInTheDocument()

    await commands.mousePress()
    try {
      await expect.poll(scrollTop).toBeGreaterThan(0)
    }
    finally {
      await commands.mouseUp()
    }

    await page.getByRole('option', { name: OPTIONS[1], exact: true }).hover()
    await expect.element(page.getByRole('option', { name: OPTIONS[1], exact: true })).toHaveFocus()
    const stoppedAt = scrollTop()
    const pointerLeftAt = performance.now()

    await expect.poll(() =>
      performance.now() - pointerLeftAt >= 120 && scrollTop() === stoppedAt,
    ).toBe(true)
  })
})
