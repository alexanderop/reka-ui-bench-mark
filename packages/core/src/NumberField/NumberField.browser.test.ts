import type { NumberFieldRootProps } from './NumberFieldRoot.vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { useKbd } from '@/shared'
import { handleSubmit } from '@/test'
import NumberField from './story/_NumberField.vue'

async function setup(props?: NumberFieldRootProps) {
  const user = userEvent.setup()
  const returned = await render(NumberField, { props })
  const root = returned.getByTestId('root').element()
  const input = returned.getByTestId('input').element() as HTMLInputElement
  const label = returned.getByTestId('label').element()
  const increment = returned.getByTestId('increment').element()
  const decrement = returned.getByTestId('decrement').element()
  expect(root).toBeVisible()
  return { ...returned, user, root, input, label, increment, decrement }
}

const dispatchKeyboardPayload = {
  keyDown(element: HTMLElement, init: KeyboardEventInit) {
    // Synthetic only for payload/guard states Chromium input cannot create:
    // `isComposing` and keydown delivery to a disabled native input.
    const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
    if (init.isComposing !== undefined)
      Object.defineProperty(event, 'isComposing', { value: init.isComposing })
    element.dispatchEvent(event)
  },
}

const kbd = useKbd()
describe('numberField', () => {
  beforeEach(() => {
    document.body.style.pointerEvents = ''
  })

  // @finding NumberField/NumberField.test.ts#fixture-color-contrast
  it.fails('should pass axe accessibility tests', async () => {
    const { root } = await setup()
    expect(await axe(root)).toHaveNoViolations()
  })

  it('should show a default value if provided', async () => {
    const { input } = await setup({ defaultValue: 5 })
    expect(input.value).toBe('5')
  })

  it('should show modelValue if provided', async () => {
    const { input } = await setup({ modelValue: 10 })
    expect(input.value).toBe('10')
  })

  it('should show negative sign if less than 0', async () => {
    const { input } = await setup({ modelValue: -10 })
    expect(input.value).toBe('-10')
  })

  it('should restart from 0 when clearing the value', async () => {
    const { input, increment } = await setup({ defaultValue: 5 })

    await userEvent.clear(input)

    expect(input.value).toBe('')
    await userEvent.click(document.body)
    await userEvent.click(increment)
    expect(input.value).toBe('0')
  })

  it('should increase and decrease based on default step', async () => {
    const { input, increment, decrement } = await setup({ defaultValue: 10 })
    expect(input.value).toBe('10')

    await userEvent.click(increment)
    expect(input.value).toBe('11')
    await userEvent.click(increment)
    expect(input.value).toBe('12')

    await userEvent.click(decrement)
    expect(input.value).toBe('11')
    await userEvent.click(decrement)
    expect(input.value).toBe('10')
  })

  it('should increase and decrease based on given step', async () => {
    const { input, increment, decrement } = await setup({ defaultValue: 0, step: 3 })
    expect(input.value).toBe('0')

    await userEvent.click(increment)
    expect(input.value).toBe('3')
    await userEvent.click(increment)
    expect(input.value).toBe('6')

    await userEvent.click(decrement)
    expect(input.value).toBe('3')
    await userEvent.click(decrement)
    expect(input.value).toBe('0')
  })

  it('should increase and decrease based on keyboard navigation on input', async () => {
    const { input } = await setup({ defaultValue: 0, min: 0, max: 10 })

    await userEvent.click(input)
    await userEvent.keyboard('{ArrowUp}')
    expect(input.value).toBe('1')
    await userEvent.keyboard('{ArrowDown}')
    expect(input.value).toBe('0')
    await userEvent.keyboard('{End}')
    expect(input.value).toBe('10')
    await userEvent.keyboard('{Home}')
    expect(input.value).toBe('0')
  })

  it('should not be changed when disabled', async () => {
    const { root, input, increment, decrement } = await setup({ defaultValue: 0, disabled: true })

    expect(root.getAttribute('data-disabled')).toBe('')
    expect(input.getAttribute('data-disabled')).toBe('')
    dispatchKeyboardPayload.keyDown(input, { key: kbd.ARROW_UP })
    expect(input.value).toBe('0')
    dispatchKeyboardPayload.keyDown(input, { key: kbd.ARROW_DOWN })
    expect(input.value).toBe('0')
    await userEvent.click(increment, { force: true })
    expect(input.value).toBe('0')
    await userEvent.click(decrement, { force: true })
    expect(input.value).toBe('0')
  })

  it('should not be changed when readonly', async () => {
    const { root, input, increment, decrement } = await setup({ defaultValue: 0, readonly: true })

    expect(root.getAttribute('data-readonly')).toBe('')
    expect(input.getAttribute('data-readonly')).toBe('')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowUp}')
    expect(input.value).toBe('0')
    await userEvent.keyboard('{ArrowDown}')
    expect(input.value).toBe('0')
    await userEvent.click(increment, { force: true })
    expect(input.value).toBe('0')
    await userEvent.click(decrement, { force: true })
    expect(input.value).toBe('0')
  })

  it('should be be focusable when readonly', async () => {
    const { input } = await setup({ defaultValue: 0, readonly: true })

    await userEvent.tab()
    expect(input).toBe(document.activeElement)
  })

  describe('with disable wheel change option', () => {
    it('should update value when scroll by default', async () => {
      const { input } = await setup({
        defaultValue: 10,
      })
      await userEvent.click(input)
      expect(input.value).toBe('10')
      await userEvent.wheel(input, { delta: { y: 100 } })
      expect(input.value).toBe('11')
      await userEvent.wheel(input, { delta: { y: -100 } })
      expect(input.value).toBe('10')
    })

    it('should invert update value when `invertWheelChange` is `true`', async () => {
      const { input } = await setup({
        defaultValue: 10,
        invertWheelChange: true,
      })
      await userEvent.click(input)
      expect(input.value).toBe('10')
      await userEvent.wheel(input, { delta: { y: 100 } })
      expect(input.value).toBe('9')
      await userEvent.wheel(input, { delta: { y: -100 } })
      expect(input.value).toBe('10')
    })

    it('should not update value when `disableWheelChange` is `true`', async () => {
      const { input } = await setup({
        defaultValue: 10,
        disableWheelChange: true,
      })
      await userEvent.click(input)
      expect(input.value).toBe('10')
      await userEvent.wheel(input, { delta: { y: 100 } })
      expect(input.value).toBe('10')
    })
  })

  describe('with different formatOptions', () => {
    it('should show decimal point', async () => {
      const { input } = await setup({
        defaultValue: 10,
        formatOptions: {
          signDisplay: 'exceptZero',
          minimumFractionDigits: 1,
        },
      })
      expect(input.value).toBe('+10.0')
    })

    it('should show percentage', async () => {
      const { input } = await setup({
        defaultValue: 0.05,
        step: 0.01,
        formatOptions: {
          style: 'percent',
        },
      })
      expect(input.value).toBe('5%')
    })

    it('should show currency', async () => {
      const { input } = await setup({
        defaultValue: 5,
        formatOptions: {
          style: 'currency',
          currency: 'EUR',
          currencyDisplay: 'code',
          currencySign: 'accounting',
        },
      })
      expect(input.value).toBe('EUR\u00A05.00')
    })

    it('should show units', async () => {
      const { input } = await setup({
        defaultValue: 5,
        formatOptions: {
          style: 'unit',
          unit: 'inch',
          unitDisplay: 'long',
        },
      })
      expect(input.value).toBe('5 inches')
    })

    it('should allow backspacing through the unit suffix', async () => {
      const { input, user } = await setup({
        defaultValue: 13,
        formatOptions: {
          style: 'unit',
          unit: 'minute',
          unitDisplay: 'short',
        },
      })
      expect(input.value).toBe('13 min')

      await user.click(input)
      await user.keyboard('{Backspace}')
      expect(input.value).toBe('13 mi')

      await user.keyboard('{Backspace}')
      await user.keyboard('{Backspace}')
      expect(input.value).toBe('13 ')
    })

    it('should change format based on reactive options', async () => {
      const { input, rerender } = await setup({
        defaultValue: 5,
        formatOptions: {
          style: 'currency',
          currency: 'EUR',
          currencyDisplay: 'code',
          currencySign: 'accounting',
        },
      })
      expect(input.value).toBe('EUR\u00A05.00')
      await rerender({
        defaultValue: 5,
        formatOptions: {
          style: 'currency',
          currency: 'USD',
          currencyDisplay: 'code',
          currencySign: 'accounting',
        },
      })
      expect(input.value).toBe('USD 5.00')
    })
  })

  describe('given min/max with step condition', () => {
    it('should compute min with step correctly', async () => {
      const { input } = await setup({ min: 2, step: 3 })

      expect(input.value).toBe('')
      await userEvent.click(input)
      await userEvent.keyboard('{ArrowUp}')
      expect(input.value).toBe('2')
      await userEvent.keyboard('{ArrowUp}')
      expect(input.value).toBe('5')
      await userEvent.keyboard('{ArrowUp}')
      expect(input.value).toBe('8')
    })

    it('should compute min-max with step correctly', async () => {
      const { input } = await setup({ min: 2, max: 21, step: 3, stepSnapping: true })

      expect(input.value).toBe('')
      await userEvent.click(input)
      await userEvent.keyboard('{ArrowUp}'.repeat(7)) // 2, 5, 8, 11, 14, 17, 20
      expect(input.value).toBe('20')
      await userEvent.keyboard('{ArrowUp}') // 20 (max snapped to step)
      expect(input.value).toBe('20')
    })

    it('should compute min-max with step correctly when stepSnapping false', async () => {
      const { input } = await setup({ min: 17, max: 21, step: 3, stepSnapping: false })

      expect(input.value).toBe('')
      await userEvent.click(input)
      await userEvent.keyboard('{ArrowUp}{ArrowUp}') // 17, 20
      expect(input.value).toBe('20')
      await userEvent.keyboard('{ArrowUp}') // 21 (max not snapped to step)
      expect(input.value).toBe('21')
    })

    it('should snap an off-grid value to the next grid line when incrementing', async () => {
      // Seed the off-grid value via defaultValue: typing it would snap on commit.
      const { input, increment } = await setup({ step: 1, stepSnapping: true, defaultValue: 18.98 })

      await userEvent.click(increment) // snap up to the nearest grid line, not 18.98 + 1 -> 20
      expect(input.value).toBe('19')
    })

    it('should snap an off-grid value to the previous grid line when decrementing', async () => {
      const { input, decrement } = await setup({ step: 1, stepSnapping: true, defaultValue: 18.11 })

      await userEvent.click(decrement) // snap down to the nearest grid line, not 18.11 - 1 -> 17
      expect(input.value).toBe('18')
    })

    it('should add a full step when the value is already on the grid', async () => {
      const { input, increment, decrement } = await setup({ step: 1, stepSnapping: true, defaultValue: 5 })

      await userEvent.click(increment)
      expect(input.value).toBe('6')
      await userEvent.click(decrement)
      expect(input.value).toBe('5')
    })
  })

  describe('given step alignment near min/max boundaries', () => {
    it('should keep increment enabled when an off-grid value can still align below max', async () => {
      const { input, increment } = await setup({ max: 10, step: 3, stepSnapping: true, defaultValue: 8 })

      expect(increment).not.toHaveAttribute('disabled')
      await userEvent.click(increment) // aligns to 9, not 8 + 3
      expect(input.value).toBe('9')
    })

    it('should keep decrement enabled when an off-grid value can still align above min', async () => {
      const { input, decrement } = await setup({ min: 2, step: 3, stepSnapping: true, defaultValue: 4 })

      expect(decrement).not.toHaveAttribute('disabled')
      await userEvent.click(decrement) // aligns to 2, not 4 - 3
      expect(input.value).toBe('2')
    })

    it('should disable increment once the next aligned value cannot exceed max', async () => {
      const { increment } = await setup({ max: 10, step: 3, stepSnapping: true, defaultValue: 9 })

      expect(increment).toHaveAttribute('disabled')
    })

    it('should disable decrement once the next aligned value cannot go below min', async () => {
      const { decrement } = await setup({ min: 2, step: 3, stepSnapping: true, defaultValue: 2 })

      expect(decrement).toHaveAttribute('disabled')
    })

    it('should clamp the empty/NaN fallback to the range', async () => {
      const { input, increment } = await setup({ max: -5 })

      // Empty input: the bare fallback would be 0, which is above max; it must be clamped.
      await userEvent.click(increment)
      expect(input.value).toBe('-5')
    })
  })

  describe('given setting the input value manually', async () => {
    it('should it increase/decrease the value appropriately', async () => {
      const { input, increment, decrement } = await setup({ defaultValue: 6 })

      await userEvent.fill(input, '100')
      await userEvent.click(increment)
      expect(input.value).toBe('101')

      await userEvent.fill(input, '100')
      await userEvent.click(decrement)
      expect(input.value).toBe('99')

      await userEvent.clear(input)
      await userEvent.click(decrement)
      expect(input.value).toBe('0')

      await userEvent.fill(input, '0')
      await userEvent.click(decrement)
      expect(input.value).toBe('-1')
    })
  })

  describe('given setting the input value manually and keydown enter', async () => {
    it('should it update the value appropriately', async () => {
      const { input } = await setup({
        defaultValue: 6,
        formatOptions: {
          style: 'currency',
          currency: 'EUR',
          currencyDisplay: 'code',
          currencySign: 'accounting',
        },
      })

      await userEvent.fill(input, '7')
      expect(input.value).toBe('7')
      await userEvent.keyboard('{Enter}')
      expect(input.value).toBe('EUR\u00A07.00')
    })
  })

  describe('given focusOnChange prop', () => {
    it('should focus input when clicking increment by default', async () => {
      const { input, increment } = await setup({ defaultValue: 0, focusOnChange: true })
      await userEvent.click(increment)
      expect(input).toHaveFocus()
    })

    it('should not focus input when clicking increment if focusOnChange is false', async () => {
      const { input, increment } = await setup({ defaultValue: 0, focusOnChange: false })
      await userEvent.click(increment)
      expect(input).not.toHaveFocus()
    })
  })
})

describe('given checkbox in a form', async () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    handleSubmit.mockClear()
    screen = await render({
      props: ['handleSubmit'],
      components: { NumberField },
      template: '<form @submit="handleSubmit"><NumberField name="test" :defaultValue="5" /><button type="submit">Submit</button></form>',
    }, { props: { handleSubmit } })
  })

  it('should have hidden input field', async () => {
    expect(screen.container.querySelector('[type="text"]')).toBeTruthy()
  })

  describe('after clicking submit button', () => {
    beforeEach(async () => {
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: '5' })
    })
  })

  describe('after changing value and click submit button again', () => {
    beforeEach(async () => {
      const increment = screen.getByTestId('increment').element()
      await userEvent.click(increment)
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: '6' })
    })
  })
})

describe('handle IME composition', () => {
  it('should not block beforeinput during IME composition', async () => {
    const { input } = await setup()
    await userEvent.click(input)

    // `isComposing` is the payload under test; Vitest 4.1.10 has no
    // cross-browser API for driving a real IME session.
    const event = new InputEvent('beforeinput', {
      data: 'あ',
      cancelable: true,
    })
    Object.defineProperty(event, 'isComposing', { value: true })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('should block invalid beforeinput when NOT composing', async () => {
    const { input } = await setup()
    await userEvent.click(input)

    // Direct dispatch keeps this test isolated to the cancelable beforeinput
    // payload; ordinary value entry elsewhere in this file uses `fill()`.
    const event = new InputEvent('beforeinput', {
      data: 'abc',
      cancelable: true,
    })
    Object.defineProperty(event, 'isComposing', { value: false })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('should not step the value during composition (arrow keys are IME candidate navigation)', async () => {
    const { input } = await setup({ defaultValue: 0, min: 0, max: 10 })

    // Arrow keys mid-composition navigate IME candidates, they must not step the value
    dispatchKeyboardPayload.keyDown(input, { key: kbd.ARROW_UP, isComposing: true })
    expect(input.value).toBe('0')
    dispatchKeyboardPayload.keyDown(input, { key: kbd.END, isComposing: true })
    expect(input.value).toBe('0')

    // Once composition ends, stepping works again
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowUp}')
    expect(input.value).toBe('1')
  })
})
