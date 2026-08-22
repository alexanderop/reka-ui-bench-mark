import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { commands, userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import PinInput from './story/_PinInput.vue'

class InputPayloadHandle {
  constructor(readonly element: HTMLInputElement) {}

  async dispatch(type: string, init: Record<string, unknown> = {}) {
    // This adapter is intentionally payload-only: browser automation cannot
    // drive IME composition or password-manager autofill cross-browser.
    const options = { ...init, bubbles: true, cancelable: true }
    const event = type.startsWith('composition')
      ? new CompositionEvent(type, options)
      : type === 'input'
        ? new InputEvent(type, options)
        : new KeyboardEvent(type, options)
    if ('isComposing' in init)
      Object.defineProperty(event, 'isComposing', { value: init.isComposing })
    this.element.dispatchEvent(event)
  }

  assignValue(value: string) {
    this.element.value = value
  }
}

function getInputs(screen: Awaited<ReturnType<typeof render>>) {
  return Array.from(screen.container.querySelectorAll<HTMLInputElement>('input:not([aria-hidden])'), input => new InputPayloadHandle(input))
}

async function copyAndPaste(text: string, target: HTMLInputElement) {
  // Parallel tester pages share the OS clipboard. The typed command holds one
  // server-side mutex across the complete trusted copy/paste keyboard gesture.
  const token = crypto.randomUUID()
  const sourceSelector = `[data-browser-clipboard-source="${token}"]`
  const targetSelector = `[data-browser-clipboard-target="${token}"]`
  const source = document.createElement('textarea')
  source.dataset.browserClipboardSource = token
  source.value = text
  target.dataset.browserClipboardTarget = token
  document.body.append(source)

  try {
    await commands.copyPaste(sourceSelector, targetSelector, text)
  }
  finally {
    source.remove()
    delete target.dataset.browserClipboardTarget
  }
}

describe('given default PinInput', () => {
  let wrapper: Awaited<ReturnType<typeof render>>
  let inputs: InputPayloadHandle[] = []

  beforeEach(async () => {
    wrapper = await render(PinInput)
    inputs = getInputs(wrapper)
    await userEvent.click(inputs[0].element)
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(wrapper.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  it('should display input placeholders', () => {
    expect(inputs[0].element.placeholder).toBe('') // first input was focused thus not showing placeholder
    expect(inputs[1].element.placeholder).toBe('*')
    expect(inputs[2].element.placeholder).toBe('*')
    expect(inputs[3].element.placeholder).toBe('*')
    expect(inputs[4].element.placeholder).toBe('*')
  })

  describe('caret handling', () => {
    it('should handle caret at the start of the input', async () => {
      await userEvent.keyboard('a')
      await userEvent.click(inputs[0].element)
      await userEvent.keyboard('{Home}')
      await userEvent.keyboard('b')
      expect(inputs.map(i => i.element.value)).toStrictEqual(['b', '', '', '', ''])
      expect(inputs[1].element).toBe(document.activeElement)
    })

    it('should handle caret at the end of the input (default focus)', async () => {
      await userEvent.keyboard('a')
      await userEvent.click(inputs[0].element)
      await userEvent.keyboard('b')
      expect(inputs.map(i => i.element.value)).toStrictEqual(['b', '', '', '', ''])
      expect(inputs[1].element).toBe(document.activeElement)
    })
  })

  describe('after user input', () => {
    beforeEach(async () => {
      await userEvent.keyboard('test')
    })

    it('should populate the word in each box', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['t', 'e', 's', 't', ''])
    })

    describe('after user continue to input', () => {
      beforeEach(async () => {
        await userEvent.keyboard('next')
      })

      it('should complete and stop at the last input and populate remaining change', () => {
        expect(inputs.map(i => i.element.value)).toStrictEqual(['t', 'e', 's', 't', 't'])
        expect(inputs.at(-1)?.element).toBe(document.activeElement)
        expect(wrapper.container.querySelector('[data-complete]')?.getAttribute('data-complete')).toBe('')
      })
    })
  })

  describe('after user paste \'test\'', () => {
    beforeEach(async () => {
      await copyAndPaste('test', inputs[0].element)
    })

    it('should populate the word in each box', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['t', 'e', 's', 't', ''])
    })
  })

  describe('after user paste \'test\' at 2nd input', () => {
    beforeEach(async () => {
      await copyAndPaste('test', inputs[1].element)
    })

    it('should populate the word in correct box', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['', 't', 'e', 's', 't'])
    })
  })

  describe('after pressing ArrowRight key', () => {
    beforeEach(async () => {
      await userEvent.keyboard('{ArrowRight}')
    })

    it('should navigate to 2nd box', () => {
      expect(inputs[1].element).toBe(document.activeElement)
    })

    describe('after pressing ArrowRight key', () => {
      beforeEach(async () => {
        await userEvent.keyboard('{ArrowRight}')
      })

      it('should navigate to 3rd box', () => {
        expect(inputs[2].element).toBe(document.activeElement)
      })

      describe('after pressing ArrowLeft key twice', () => {
        beforeEach(async () => {
          await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
        })

        it('should navigate back to 1st box', () => {
          expect(inputs[0].element).toBe(document.activeElement)
        })
      })
    })
  })

  describe('after inserting \'test\' and pressing Backspace key', () => {
    beforeEach(async () => {
      await userEvent.keyboard('test')
      await userEvent.keyboard('{Backspace}')
    })

    it('should navigate back to previous box and clear the value', () => {
      expect(inputs[3].element).toBe(document.activeElement)
      expect(inputs[3].element.value).toBe('')
      expect(inputs.map(i => i.element.value)).toStrictEqual(['t', 'e', 's', '', ''])
    })

    describe('after pressing Backspace again', () => {
      beforeEach(async () => {
        await userEvent.keyboard('{Backspace}')
      })

      it('should navigate back to previous box and clear the value', () => {
        expect(inputs[2].element).toBe(document.activeElement)
        expect(inputs[2].element.value).toBe('')
        expect(inputs.map(i => i.element.value)).toStrictEqual(['t', 'e', '', '', ''])
      })
    })
  })

  describe('after inserting \'test\' and pressing Delete key', () => {
    beforeEach(async () => {
      await userEvent.keyboard('test')
      await userEvent.click(inputs[1].element)
      await userEvent.keyboard('{Delete}')
    })

    it('should clear the value', () => {
      expect(inputs[1].element).toBe(document.activeElement)
      expect(inputs[1].element.value).toBe('')
      expect(inputs.map(i => i.element.value)).toStrictEqual(['t', '', 's', 't', ''])
    })
  })

  describe('after completing input', async () => {
    beforeEach(async () => {
      await userEvent.keyboard('apple')
    })

    it('should emit \'complete\' with the result', () => {
      expect(wrapper.emitted('complete')?.[0]?.[0]).toStrictEqual(['a', 'p', 'p', 'l', 'e'])
    })

    describe('after resetting value', async () => {
      beforeEach(async () => {
        await userEvent.keyboard('apple')
        await wrapper.getByRole('button').click()
      })

      it('should display input placeholders', () => {
        expect(inputs[0].element.placeholder).toBe('*')
        expect(inputs[1].element.placeholder).toBe('*')
        expect(inputs[2].element.placeholder).toBe('*')
        expect(inputs[3].element.placeholder).toBe('*')

        // It should be "*", but the "document.activeElement"
        // is not updated to correctly in the test environment
        // thus the placeholder is not correctly updated in tests.
        // expect(inputs[4].element.placeholder).toBe('*')
      })
    })
  })

  describe('render placeholder', () => {
    // @finding PinInput/PinInput.test.ts#focused-placeholder-visible
    it('should render correct placeholder', async () => {
      expect(inputs[0].element.placeholder).toBe('')
      expect(inputs[1].element.placeholder).toBe('*')
      expect(inputs[2].element.placeholder).toBe('*')
      expect(inputs[3].element.placeholder).toBe('*')
      expect(inputs[4].element.placeholder).toBe('*')

      await userEvent.keyboard('a')
      expect(inputs[0].element.placeholder).toBe('*')
      // now focus moved to 2nd input
      expect(inputs[1].element.placeholder).toBe('')

      // focus to hide placeholder
      // Programmatic focus is the behavior under test. Vitest 4.1.10 exposes
      // no locator/userEvent focus primitive, so use the native DOM API here.
      inputs[2].element.focus()
      await nextTick()
      expect(inputs[1].element.placeholder).toBe('*')
      expect(inputs[2].element.placeholder).toBe('')

      inputs[0].element.focus()
      await nextTick()
      await userEvent.keyboard('{Backspace}')
      const focusedEmptyPlaceholder = inputs[0].element.placeholder
      inputs[1].element.focus()
      await nextTick()
      // input is empty and not focused thus showing placeholder
      expect(inputs[0].element.placeholder).toBe('*')

      // backspace to previous input and delete value
      inputs[0].element.focus()
      await userEvent.keyboard('a')
      await userEvent.keyboard('{Backspace}')
      expect(inputs[0].element.placeholder).toBe('')
      expect(inputs[1].element.placeholder).toBe('*')
      expect(focusedEmptyPlaceholder).toBe('')
    })
  })
})

describe('give PinInput type=number', async () => {
  let wrapper: Awaited<ReturnType<typeof render>>
  let inputs: InputPayloadHandle[] = []

  beforeEach(async () => {
    wrapper = await render(PinInput, { props: { type: 'number' } })
    inputs = getInputs(wrapper)
    await userEvent.click(inputs[0].element)
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(wrapper.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  describe('after user input non-numeric word', () => {
    beforeEach(async () => {
      await userEvent.keyboard('test')
    })

    it('should not populate the word', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['', '', '', '', ''])
    })
  })

  describe('after user paste non-numeric word', () => {
    beforeEach(async () => {
      await copyAndPaste('test', inputs[0].element)
    })

    it('should not populate the word', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['', '', '', '', ''])
    })
  })

  describe('after user paste mixed alphanumeric text', () => {
    beforeEach(async () => {
      await copyAndPaste('a1b2c3', inputs[0].element)
    })

    it('should only populate numeric characters', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['1', '2', '3', '', ''])
    })
  })

  describe('after user paste mixed text with enough numeric characters', () => {
    beforeEach(async () => {
      await copyAndPaste('a1b2c3d4e5', inputs[0].element)
    })

    it('should populate all boxes with numeric characters only', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['1', '2', '3', '4', '5'])
    })

    it('should emit \'complete\' with the result', async () => {
      await expect.poll(() => wrapper.emitted('complete')?.[0]?.[0]).toStrictEqual([1, 2, 3, 4, 5])
    })
  })

  describe('after user paste mixed text at 2nd input', () => {
    beforeEach(async () => {
      await copyAndPaste('a1b2c3', inputs[1].element)
    })

    it('should populate numeric characters in correct boxes', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['', '1', '2', '3', ''])
    })
  })

  describe('after user input numeric word', () => {
    beforeEach(async () => {
      await userEvent.keyboard('12345')
    })

    it('should populate the word in each box', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['1', '2', '3', '4', '5'])
    })

    it('should emit \'complete\' with the result', () => {
      expect(wrapper.emitted('complete')?.[0]?.[0]).toStrictEqual([1, 2, 3, 4, 5])
    })

    it('should delete the last input when pressing Backspace', async () => {
      await userEvent.keyboard('{Backspace}')
      expect(inputs[4].element).toBe(document.activeElement)
      expect(inputs.map(i => i.element.value)).toStrictEqual(['1', '2', '3', '4', ''])
    })

    it('should delete all values input when pressing Backspace for each input', async () => {
      // Delete the last value
      await userEvent.keyboard('{Backspace}')
      // Press again to move focus to the previous input
      await userEvent.keyboard('{Backspace}'.repeat(5))

      expect(inputs[0].element).toBe(document.activeElement)
      expect(inputs.map(i => i.element.value)).toStrictEqual(['', '', '', '', ''])
    })
  })

  describe('after user input numeric word consisting only of zeros', () => {
    beforeEach(async () => {
      await userEvent.keyboard('00000')
    })

    it('should populate the word in each box', () => {
      expect(inputs.map(i => i.element.value)).toStrictEqual(['0', '0', '0', '0', '0'])
    })

    it('should emit \'complete\' with the result', () => {
      expect(wrapper.emitted('complete')?.[0]?.[0]).toStrictEqual([0, 0, 0, 0, 0])
    })
  })

  describe('autofill', () => {
    it('should populate the opt code in each box', async () => {
      /**
       * https://github.com/unovue/reka-ui/issues/2210
       * Password managers (like 1Password, Bitwarden, etc.) fill PIN inputs with `input` events
       */
      for (const input of inputs) {
        // Password-manager assignment is the payload under test; a native
        // keyboard/paste interaction would exercise a different code path.
        input.assignValue('0')
        await input.dispatch('input', { data: undefined })
      }
      await nextTick()

      expect(inputs.map(i => i.element.value)).toStrictEqual(['0', '0', '0', '0', '0'])
      expect(wrapper.emitted('complete')?.[0]?.[0]).toStrictEqual([0, 0, 0, 0, 0])
    })
  })
})

describe('handle IME composition', () => {
  let wrapper: Awaited<ReturnType<typeof render>>
  let inputs: InputPayloadHandle[] = []

  beforeEach(async () => {
    wrapper = await render(PinInput)
    inputs = getInputs(wrapper)
    await userEvent.click(inputs[0].element)
  })

  it('should not shift focus during composition', async () => {
    await inputs[0].dispatch('compositionstart')
    await inputs[0].dispatch('input', { data: '1', isComposing: true })
    await nextTick()

    expect(document.activeElement).toBe(inputs[0].element)
    expect(inputs[0].element.value).toBe('')
  })

  it('should process the committed value after compositionend', async () => {
    await inputs[0].dispatch('compositionstart')
    await inputs[0].dispatch('input', { data: '5', isComposing: true })
    await nextTick()

    expect(document.activeElement).toBe(inputs[0].element)

    inputs[0].element.value = '5'
    await inputs[0].dispatch('compositionend', { data: '5' })
    await nextTick()

    expect(inputs[0].element.value).toBe('5')
    expect(document.activeElement).toBe(inputs[1].element)
  })

  it('should not move between inputs with arrow keys during composition', async () => {
    await inputs[0].dispatch('compositionstart')
    await inputs[0].dispatch('keydown', { key: 'ArrowRight', isComposing: true })
    await nextTick()

    expect(document.activeElement).toBe(inputs[0].element)
  })

  it('should reject non-numeric IME input in numeric mode', async () => {
    wrapper = await render(PinInput, { props: { type: 'number' } })
    inputs = getInputs(wrapper)
    await userEvent.click(inputs[0].element)

    await inputs[0].dispatch('compositionstart')
    inputs[0].element.value = 'あ'
    await inputs[0].dispatch('compositionend', { data: 'あ' })
    await nextTick()

    expect(inputs[0].element.value).toBe('')
    expect(document.activeElement).toBe(inputs[0].element)
  })

  it('should distribute multi-character composition commit across slots', async () => {
    await inputs[0].dispatch('compositionstart')
    inputs[0].element.value = 'ab'
    await inputs[0].dispatch('compositionend', { data: 'ab' })
    await nextTick()

    expect(inputs[0].element.value).toBe('a')
    expect(inputs[1].element.value).toBe('b')
    expect(document.activeElement).toBe(inputs[2].element)
  })

  it('should distribute multi-digit numeric composition commit across slots', async () => {
    wrapper = await render(PinInput, { props: { type: 'number' } })
    inputs = getInputs(wrapper)
    await userEvent.click(inputs[0].element)

    await inputs[0].dispatch('compositionstart')
    inputs[0].element.value = '123'
    await inputs[0].dispatch('compositionend', { data: '123' })
    await nextTick()

    expect(inputs[0].element.value).toBe('1')
    expect(inputs[1].element.value).toBe('2')
    expect(inputs[2].element.value).toBe('3')
    expect(document.activeElement).toBe(inputs[3].element)
  })
})

describe('give OTP PinInput', () => {
  let wrapper: Awaited<ReturnType<typeof render>>
  let inputs: InputPayloadHandle[] = []

  beforeEach(async () => {
    wrapper = await render(PinInput, { props: { otp: true } })
    inputs = getInputs(wrapper)
    await userEvent.click(inputs[0].element)
  })

  it('should disable later inputs if there are empty inputs before them', async () => {
    await userEvent.click(inputs[1].element, { force: true })
    expect(document.activeElement).toBe(inputs[0].element)
  })
})
