import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import ColorField from './story/_ColorField.vue'

type ColorFieldScreen = Awaited<ReturnType<typeof render<typeof ColorField>>>

function getInput(screen: ColorFieldScreen) {
  const element = screen.container.querySelector('input')
  if (!(element instanceof HTMLInputElement))
    throw new TypeError('Expected ColorField to render an input')

  return {
    element,
    locator: screen.getByRole('textbox'),
  }
}

function dispatchComposingKeydown(element: HTMLInputElement, key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(event, 'isComposing', { value: true })
  element.dispatchEvent(event)
}

describe('given default ColorField (hex mode)', () => {
  let screen: ColorFieldScreen

  beforeEach(async () => {
    screen = await render(ColorField, {
      props: {
        defaultValue: '#ff0000',
      },
    })
  })

  // @finding ColorField/ColorField.test.ts#input-color-contrast
  it.fails('should pass axe accessibility tests', async () => {
    // Chromium evaluates `color-contrast` on two text nodes: the preview text
    // passes, while the input's black text on #27272a is 1.4:1 (4.5:1 needed).
    // No rule is incomplete. Keep the original audit intact under quarantine.
    const results = await axe(screen.container.firstElementChild!, {
      rules: {
        label: { enabled: false },
      },
    })
    const knownFailure = results.violations.length === 1
      && results.violations[0].id === 'color-contrast'
      && results.violations[0].nodes.length === 1
      && results.violations[0].nodes[0].target.some(selector => selector.includes('input'))
    if (knownFailure)
      expect(results).toHaveNoViolations()
  })

  it('should render input with hex value', () => {
    const input = getInput(screen).element
    expect(input).toBeTruthy()
    expect(input.value).toBe('#ff0000')
  })

  it('should update value on input', async () => {
    const input = getInput(screen).locator
    await input.fill('#00ff00')
    await userEvent.tab()
    // Value should be updated after blur
    expect(screen.container.querySelector('span')?.textContent).toBe('#00ff00')
  })

  it('should accept valid hex colors', async () => {
    const input = getInput(screen).locator
    await input.fill('#00ff00')
    await userEvent.tab()
    // Valid color should be accepted
    expect(screen.container.querySelector('span')?.textContent).toBe('#00ff00')
  })

  describe('when disabled', () => {
    beforeEach(async () => {
      await screen.rerender({ disabled: true })
    })

    it('should have disabled attribute', () => {
      const input = getInput(screen).element
      expect(input.hasAttribute('disabled')).toBe(true)
    })

    it('should have data-disabled attribute', () => {
      const input = getInput(screen).element
      expect(input.getAttribute('data-disabled')).toBe('')
    })
  })

  describe('when readonly', () => {
    beforeEach(async () => {
      await screen.rerender({ readonly: true })
    })

    it('should have readonly attribute', () => {
      const input = getInput(screen).element
      expect(input.hasAttribute('readonly')).toBe(true)
    })
  })
})

describe('given ColorField in channel mode', () => {
  it('should render hue value', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
      },
    })
    const input = getInput(screen).element
    expect(input.value).toBe('0')
  })

  it('should render saturation value', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#7f007f',
        channel: 'saturation',
        colorSpace: 'hsl',
      },
    })
    const input = getInput(screen).element
    expect(input.value).toBe('100')
  })

  it('should render lightness value', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#bf40bf',
        channel: 'lightness',
        colorSpace: 'hsl',
      },
    })
    const input = getInput(screen).element
    expect(input.value).toBe('50')
  })

  it('should render alpha value', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: 'rgba(255, 0, 0, 0.5)',
        channel: 'alpha',
        colorSpace: 'hsl',
      },
    })
    const input = getInput(screen).element
    expect(input.value).toBe('50')
  })

  it('should have numeric inputmode', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
      },
    })
    const input = getInput(screen).element
    expect(input.getAttribute('inputmode')).toBe('numeric')
  })
})

describe('given ColorField with placeholder', () => {
  it('should show placeholder when empty', async () => {
    const screen = await render(ColorField, {
      props: {
        placeholder: 'Enter color',
      },
    })
    const input = getInput(screen).element
    expect(input.getAttribute('placeholder')).toBe('Enter color')
  })
})

describe('keyboard interactions', () => {
  describe('channel mode', () => {
    it('should increment on ArrowUp', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#ff0000',
          channel: 'hue',
          colorSpace: 'hsl',
        },
      })
      const input = getInput(screen)
      expect(input.element.value).toBe('0')
      await input.locator.click()
      await userEvent.keyboard('{ArrowUp}')
      expect(input.element.value).toBe('1')
    })

    it('should decrement on ArrowDown', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#bf40bf',
          channel: 'lightness',
          colorSpace: 'hsl',
        },
      })
      const input = getInput(screen)
      expect(input.element.value).toBe('50')
      await input.locator.click()
      await userEvent.keyboard('{ArrowDown}')
      expect(input.element.value).toBe('49')
    })

    it('should jump to max on End key', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#ff0000',
          channel: 'red',
          colorSpace: 'rgb',
        },
      })
      const input = getInput(screen)
      await input.locator.click()
      await userEvent.keyboard('{End}')
      expect(input.element.value).toBe('255')
    })

    it('should jump to min on Home key', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#ff0000',
          channel: 'red',
          colorSpace: 'rgb',
        },
      })
      const input = getInput(screen)
      await input.locator.click()
      await userEvent.keyboard('{Home}')
      expect(input.element.value).toBe('0')
    })

    it('should step by page amount on PageUp/PageDown', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#bf40bf',
          channel: 'lightness',
          colorSpace: 'hsl',
        },
      })
      const input = getInput(screen)
      expect(input.element.value).toBe('50')
      await input.locator.click()
      await userEvent.keyboard('{PageUp}')
      expect(input.element.value).toBe('60')
      await userEvent.keyboard('{PageDown}')
      expect(input.element.value).toBe('50')
    })

    it('should respect custom step prop', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#ff0000',
          channel: 'hue',
          colorSpace: 'hsl',
          step: 10,
        },
      })
      const input = getInput(screen)
      expect(input.element.value).toBe('0')
      await input.locator.click()
      await userEvent.keyboard('{ArrowUp}')
      expect(input.element.value).toBe('10')
    })

    it('should clamp at channel boundaries', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#ff0000',
          channel: 'hue',
          colorSpace: 'hsl',
        },
      })
      const input = getInput(screen)
      expect(input.element.value).toBe('0')
      await input.locator.click()
      await userEvent.keyboard('{ArrowDown}')
      // Should clamp to 0
      expect(input.element.value).toBe('0')
    })
  })

  describe('hex mode', () => {
    it('should increment hex value on ArrowUp', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#000000',
        },
      })
      const input = getInput(screen)
      expect(input.element.value).toBe('#000000')
      await input.locator.click()
      await userEvent.keyboard('{ArrowUp}')
      expect(input.element.value).toBe('#000001')
    })

    it('should decrement hex value on ArrowDown', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#000002',
        },
      })
      const input = getInput(screen)
      await input.locator.click()
      await userEvent.keyboard('{ArrowDown}')
      expect(input.element.value).toBe('#000001')
    })

    it('should jump to #ffffff on End', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#000000',
        },
      })
      const input = getInput(screen)
      await input.locator.click()
      await userEvent.keyboard('{End}')
      expect(input.element.value).toBe('#ffffff')
    })

    it('should jump to #000000 on Home', async () => {
      const screen = await render(ColorField, {
        props: {
          defaultValue: '#ff0000',
        },
      })
      const input = getInput(screen)
      await input.locator.click()
      await userEvent.keyboard('{Home}')
      expect(input.element.value).toBe('#000000')
    })
  })

  it('should commit on Enter key', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#ff0000',
      },
    })
    const input = getInput(screen)
    await input.locator.fill('#00ff00')
    await userEvent.keyboard('{Enter}')
    expect(input.element.value).toBe('#00ff00')
  })

  it('should not increment when disabled', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
        disabled: true,
      },
    })
    const input = getInput(screen).element
    expect(input.value).toBe('0')
    // A disabled input cannot receive a real keyboard event. Dispatching the
    // keydown keeps the original's guard-path scenario observable instead of
    // making this negative assertion pass merely because focus stayed on BODY.
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    }))
    expect(input.value).toBe('0')
  })

  it('should not increment when readonly', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
        readonly: true,
      },
    })
    const input = getInput(screen)
    expect(input.element.value).toBe('0')
    await input.locator.click()
    await userEvent.keyboard('{ArrowUp}')
    expect(input.element.value).toBe('0')
  })

  it('should not block beforeinput during IME composition', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
      },
    })
    const input = getInput(screen).element
    const blockedEvent = new InputEvent('beforeinput', {
      data: 'あ',
      cancelable: true,
    })
    input.dispatchEvent(blockedEvent)
    expect(blockedEvent.defaultPrevented).toBe(true)

    const event = new InputEvent('beforeinput', {
      data: 'あ',
      cancelable: true,
    })
    Object.defineProperty(event, 'isComposing', { value: true })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('should not step the value during composition (arrow keys are IME candidate navigation)', async () => {
    const screen = await render(ColorField, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
      },
    })
    const input = getInput(screen)
    expect(input.element.value).toBe('0')

    // Browser automation cannot drive a platform IME, so the composing event
    // remains synthetic scenario input while the post-composition key is real.
    dispatchComposingKeydown(input.element, 'ArrowUp')
    expect(input.element.value).toBe('0')

    // Once composition ends, stepping works again
    await input.locator.click()
    await userEvent.keyboard('{ArrowUp}')
    expect(input.element.value).toBe('1')
  })
})
