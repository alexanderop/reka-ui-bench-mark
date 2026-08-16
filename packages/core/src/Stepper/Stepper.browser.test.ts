import type { StepperRootProps } from './StepperRoot.vue'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { useTestKbd } from '@/shared'
import Stepper from './story/_Stepper.vue'
import StepperDynamic from './story/_StepperDynamic.vue'

const steps = [{
  step: 1,
  title: 'Address',
  description: 'Add your address here',
  icon: 'radix-icons:home',
}, {
  step: 2,
  title: 'Shipping',
  description: 'Set your preferred shipping method',
  icon: 'radix-icons:archive',
}, {
  step: 3,
  title: 'Trade-in',
  description: 'Add any trade-in items you have',
  icon: 'radix-icons:update',
}, {
  step: 4,
  title: 'Payment',
  description: 'Add any payment information you have',
  icon: 'radix-icons:sketch-logo',
}, {
  step: 5,
  title: 'Checkout',
  description: 'Confirm your order',
  icon: 'radix-icons:check',
}]

const kbd = useTestKbd()

async function setup(props: { stepperProps?: StepperRootProps & { steps: { step: number, title: string, description: string, icon: string, isCompleted?: boolean }[] }, emits?: { 'onUpdate:modelValue'?: (data: number) => void } } = {}) {
  const screen = await render(Stepper, { props })
  const stepper = screen.getByTestId('stepper')
  await expect.element(stepper).toBeVisible()
  return { ...screen, user: userEvent, stepper }
}

it('should pass axe accessibility tests', async () => {
  const { stepper } = await setup()
  // Not vacuous in either environment: both evaluate 16 rules with nodes,
  // including `button-name` across all five triggers. Clearing every
  // trigger's content produces five `button-name` violations in both. The
  // meaningful browser delta is `color-contrast`: Chromium evaluates it on
  // six nodes, while jsdom reports it incomplete with zero nodes. jsdom also
  // gains `aria-hidden-body`; both renders are document-connected, so that
  // rule delta is recorded without guessing at its cause.
  expect(await axe(stepper.element())).toHaveNoViolations()
})

describe('stepper', async () => {
  it('respects a default value if provided', async () => {
    // The original passes controlled `modelValue`, so its name is false and
    // the `defaultValue` path is never exercised. Make the existing test test
    // the contract it names without changing its assertion.
    const { getByTestId } = await setup({ stepperProps: { defaultValue: 2, steps } })
    await expect.element(getByTestId('stepper-item-2')).toHaveAttribute('aria-current', 'true')
  })

  it('navigates horizontally using the keyboard', async () => {
    const { getByTestId, user } = await setup({ stepperProps: { steps } })

    const firstItem = getByTestId('stepper-item-trigger-1')
    const lastItem = getByTestId('stepper-item-trigger-2')

    await user.click(firstItem)
    expect(document.activeElement).toBe(firstItem.element())

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(document.activeElement).toBe(lastItem.element())

    await user.keyboard(kbd.ARROW_LEFT)
    expect(document.activeElement).toBe(firstItem.element())
  })

  it('navigates vertically using the keyboard', async () => {
    const { getByTestId, user } = await setup({ stepperProps: { steps, orientation: 'vertical' } })

    const firstItem = getByTestId('stepper-item-trigger-1')
    const lastItem = getByTestId('stepper-item-trigger-2')

    await user.click(firstItem)
    expect(document.activeElement).toBe(firstItem.element())

    await user.keyboard(kbd.ARROW_DOWN)
    expect(document.activeElement).toBe(lastItem.element())

    await user.keyboard(kbd.ARROW_UP)
    expect(document.activeElement).toBe(firstItem.element())
  })

  it('prevents navigation to other elements if linear is true', async () => {
    const { getByTestId, user } = await setup({ stepperProps: { steps, linear: true } })

    const firstItem = getByTestId('stepper-item-trigger-1')
    const secondItem = getByTestId('stepper-item-trigger-2')
    const thirdItem = getByTestId('stepper-item-trigger-3')

    await user.click(firstItem)
    expect(document.activeElement).toBe(firstItem.element())

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(document.activeElement).toBe(secondItem.element())

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(document.activeElement).toBe(secondItem.element())

    // The third trigger is a disabled `<button>`. Playwright otherwise waits
    // for it to become enabled; forcing the gesture lets Chromium itself
    // suppress mousedown/click/focus, matching user-event's disabled control.
    await user.click(thirdItem, { force: true })
    expect(document.activeElement).not.toBe(thirdItem.element())
    await expect.element(getByTestId('stepper-item-1')).toHaveAttribute('aria-current', 'true')
    await expect.element(getByTestId('stepper-item-3')).not.toHaveAttribute('aria-current')
  })

  it('allows navigation to other elements if linear is false', async () => {
    const { getByTestId, user } = await setup({ stepperProps: { steps, linear: false } })

    const firstItem = getByTestId('stepper-item-trigger-1')
    const secondItem = getByTestId('stepper-item-trigger-2')
    const thirdItem = getByTestId('stepper-item-trigger-3')
    const fourthItem = getByTestId('stepper-item-trigger-4')

    await user.click(firstItem)
    expect(document.activeElement).toBe(firstItem.element())

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(document.activeElement).toBe(secondItem.element())

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(document.activeElement).toBe(thirdItem.element())

    await user.click(fourthItem)
    expect(document.activeElement).toBe(fourthItem.element())
  })

  it('selects a step on click', async () => {
    const { getByTestId, user } = await setup({ stepperProps: { steps } })

    const secondItem = getByTestId('stepper-item-trigger-2')

    await user.click(secondItem)
    await expect.element(getByTestId('stepper-item-2')).toHaveAttribute('aria-current', 'true')
  })

  it.each([kbd.ENTER, kbd.SPACE])('selects a step using the %s key', async (key) => {
    const { getByTestId, user } = await setup({ stepperProps: { steps } })

    const firstItem = getByTestId('stepper-item-trigger-1')
    const secondItem = getByTestId('stepper-item-2')
    const thirdItem = getByTestId('stepper-item-3')

    await user.click(firstItem)
    await user.keyboard(kbd.ARROW_RIGHT)

    await user.keyboard(key)
    await expect.element(secondItem).toHaveAttribute('aria-current', 'true')
    await user.keyboard(kbd.ARROW_RIGHT)

    await user.keyboard(key)
    await expect.element(thirdItem).toHaveAttribute('aria-current', 'true')
  })

  it('enables the next step for linear steppers', async () => {
    const { getByTestId, user } = await setup({ stepperProps: { steps, linear: true } })

    const secondItem = getByTestId('stepper-item-trigger-2')
    const thirdItem = getByTestId('stepper-item-trigger-3')

    await user.click(secondItem)
    await expect.element(getByTestId('stepper-item-2')).toHaveAttribute('aria-current', 'true')
    await expect.element(getByTestId('stepper-item-3')).not.toHaveAttribute('data-disabled', '')

    await user.click(thirdItem)
    await expect.element(getByTestId('stepper-item-3')).toHaveAttribute('aria-current', 'true')
    await expect.element(getByTestId('stepper-item-4')).not.toHaveAttribute('data-disabled', '')
  })

  it('keeps the total step count in sync when triggers unmount and remount', async () => {
    const screen = await render(StepperDynamic, { props: { visibleSteps: 5 } })
    const totalSteps = screen.getByTestId('total-steps')
    await expect.element(totalSteps).toHaveTextContent('5')

    // unmount two triggers
    await screen.rerender({ visibleSteps: 3 })
    await expect.element(totalSteps).toHaveTextContent('3')

    // remount them: count must not drift upwards
    await screen.rerender({ visibleSteps: 5 })
    await expect.element(totalSteps).toHaveTextContent('5')

    // repeated toggling must stay stable (regression: Set leaked stale elements)
    await screen.rerender({ visibleSteps: 1 })
    await expect.element(totalSteps).toHaveTextContent('1')

    await screen.rerender({ visibleSteps: 5 })
    await expect.element(totalSteps).toHaveTextContent('5')
  })
})
