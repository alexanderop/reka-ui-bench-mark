import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { commands, userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'
import { useIsUsingKeyboard } from './useIsUsingKeyboard'

const mouse = commands as unknown as {
  mouseDown: (x: number, y: number) => Promise<void>
  mouseMove: (x: number, y: number) => Promise<void>
  mousePress: () => Promise<void>
  mouseUp: () => Promise<void>
}

function setupTestComponent() {
  return defineComponent({
    setup() {
      return {
        isUsingKeyboard: useIsUsingKeyboard(),
      }
    },
    template: '<div data-testid="is-using-keyboard">{{ isUsingKeyboard }}</div>',
  })
}

describe('useIsUsingKeyboard', () => {
  it('should be false by default', async () => {
    const screen = await render(setupTestComponent())
    await expect.element(screen.getByTestId('is-using-keyboard')).toHaveTextContent('false')
  })

  it('should be true after keydown', async () => {
    const screen = await render(setupTestComponent())
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(screen.getByTestId('is-using-keyboard')).toHaveTextContent('true')
  })

  it('should reset to false after pointermove', async () => {
    const screen = await render(setupTestComponent())
    const state = screen.getByTestId('is-using-keyboard')
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(state).toHaveTextContent('true')

    const rect = (await state.element()).getBoundingClientRect()
    await mouse.mouseMove(rect.left + 1, rect.top + rect.height / 2)
    await mouse.mouseMove(rect.right - 1, rect.top + rect.height / 2)
    await expect.element(state).toHaveTextContent('false')
  })

  it('should reset to false after pointerdown', async () => {
    const screen = await render(setupTestComponent())
    const state = screen.getByTestId('is-using-keyboard')
    const rect = (await state.element()).getBoundingClientRect()

    // Move before the keydown so the reset below is attributable to the real
    // pointerdown, rather than the pointermove that precedes a normal click.
    await mouse.mouseMove(rect.left + rect.width / 2, rect.top + rect.height / 2)
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(state).toHaveTextContent('true')

    await mouse.mousePress()
    await mouse.mouseUp()
    await expect.element(state).toHaveTextContent('false')
  })
})
