import type { DateValue } from '@internationalized/date'
import type { MonthPickerRootProps } from './MonthPickerRoot.vue'
import { CalendarDate, CalendarDateTime, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { useTestKbd } from '@/shared'
import { MonthPickerHeader, MonthPickerHeading, MonthPickerNext, MonthPickerPrev, MonthPickerRoot } from '..'
import MonthPicker from './story/_MonthPicker.vue'

const calendarDate = new CalendarDate(1980, 1, 20)
const calendarDateTime = new CalendarDateTime(1980, 1, 20, 12, 30, 0, 0)
const zonedDateTime = toZoned(calendarDateTime, 'America/New_York')

const kbd = useTestKbd()

async function setup(props: { pickerProps?: MonthPickerRootProps, emits?: { 'onUpdate:modelValue'?: (data: DateValue | DateValue[] | undefined) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(MonthPicker, { props })
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement
  const getButton = (name: string) => returned.getByRole('button', { name, exact: true }).element() as HTMLElement
  const picker = getByTestId('month-picker')
  expect(picker).toBeVisible()
  return { ...returned, getByTestId, getButton, user, picker }
}

function getSelectedMonth(picker: HTMLElement) {
  return picker.querySelector<HTMLElement>('[data-selected]')
}

function getSelectedMonths(picker: HTMLElement) {
  return Array.from(picker.querySelectorAll<HTMLElement>('[data-selected]'))
}

function text(element: Element | null) {
  return element?.textContent?.trim()
}

it('should pass axe accessibility tests', async () => {
  const { picker } = await setup()
  expect(await axe(picker)).toHaveNoViolations()
})

describe('month picker', async () => {
  it('does not forward month prop as a DOM attribute', async () => {
    const { getByTestId } = await setup({ pickerProps: { placeholder: calendarDate } })
    const janMonth = getByTestId('month-1')
    expect(janMonth.getAttribute('month')).toBe(null)
  })

  it('does not navigate when prev is disabled and rendered as div', async () => {
    const Test = {
      components: {
        MonthPickerRoot,
        MonthPickerHeader,
        MonthPickerPrev,
        MonthPickerHeading,
        MonthPickerNext,
      },
      setup() {
        const placeholder = new CalendarDate(1980, 1, 1)
        const minValue = new CalendarDate(1980, 1, 1)
        return { placeholder, minValue }
      },
      template: `
        <MonthPickerRoot
          :placeholder="placeholder"
          :min-value="minValue"
        >
          <MonthPickerHeader>
            <MonthPickerPrev as="div" data-testid="prev-button" />
            <MonthPickerHeading data-testid="heading" />
            <MonthPickerNext as="div" data-testid="next-button" />
          </MonthPickerHeader>
        </MonthPickerRoot>
      `,
    }

    const screen = await render(Test)
    const heading = screen.getByTestId('heading').element()
    const prevButton = screen.getByTestId('prev-button')
    expect(text(heading)).toBe('1980')
    await prevButton.click({ force: true })
    expect(text(heading)).toBe('1980')
  })

  it('respects a default value if provided - `CalendarDate`', async () => {
    const { getByTestId, picker } = await setup({ pickerProps: { modelValue: calendarDate } })
    expect(text(getSelectedMonth(picker))).toBe('Jan')
    expect(text(getByTestId('heading'))).toBe('1980')
  })

  it('respects a default value if provided - `CalendarDateTime`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: calendarDateTime } })
    expect(text(getSelectedMonth(picker))).toBe('Jan')
    expect(text(getByTestId('heading'))).toBe('1980')
  })

  it('respects a default value if provided - `ZonedDateTime`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: zonedDateTime } })
    expect(text(getSelectedMonth(picker))).toBe('Jan')
    expect(text(getByTestId('heading'))).toBe('1980')
  })

  it('does not crash when modelValue is null', async () => {
    const { picker, rerender } = await setup({ pickerProps: { modelValue: null } })

    expect(getSelectedMonths(picker)).toHaveLength(0)

    await rerender({
      pickerProps: {
        modelValue: calendarDate,
      },
    })

    expect(text(getSelectedMonth(picker))).toBe('Jan')
  })

  it('navigates to next year using next button', async () => {
    const { getByTestId, getButton, user } = await setup({ pickerProps: { modelValue: calendarDate } })

    const heading = getByTestId('heading')
    const nextBtn = getButton('Next year')

    expect(text(heading)).toBe('1980')
    await user.click(page.elementLocator(nextBtn))
    expect(text(heading)).toBe('1981')
    await user.click(page.elementLocator(nextBtn))
    expect(text(heading)).toBe('1982')
  })

  it('navigates to prev year using prev button', async () => {
    const { getByTestId, getButton, user } = await setup({ pickerProps: { modelValue: calendarDate } })

    const heading = getByTestId('heading')
    const prevBtn = getButton('Previous year')

    expect(text(heading)).toBe('1980')
    await user.click(page.elementLocator(prevBtn))
    expect(text(heading)).toBe('1979')
    await user.click(page.elementLocator(prevBtn))
    expect(text(heading)).toBe('1978')
  })

  it('allows months to be deselected by clicking the selected month', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthPicker>>>['rerender']
    const { user, picker, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDate },
      emits: { 'onUpdate:modelValue': (data: DateValue) => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    const selectedMonth = getSelectedMonth(picker)!
    expect(text(selectedMonth)).toBe('Jan')
    await user.click(page.elementLocator(selectedMonth))
    expect(getSelectedMonth(picker)).toBe(null)
  })

  it.each([kbd.ENTER, kbd.SPACE])('allows deselection with %s key', async (key) => {
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthPicker>>>['rerender']
    const { user, picker, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDate },
      emits: { 'onUpdate:modelValue': (data: DateValue) => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    const selectedMonth = getSelectedMonth(picker)!
    expect(text(selectedMonth)).toBe('Jan')
    selectedMonth.focus()
    await user.keyboard(key)
    expect(getSelectedMonth(picker)).toBe(null)
  })

  it('allows selection with mouse', async () => {
    const { getButton, user, picker } = await setup({
      pickerProps: { placeholder: zonedDateTime },
    })

    const marchMonth = getButton('March 1980')
    expect(text(marchMonth)).toBe('Mar')
    await user.click(page.elementLocator(marchMonth))

    const selectedMonth = getSelectedMonth(picker)
    expect(text(selectedMonth)).toBe('Mar')
  })

  it.each([kbd.ENTER, kbd.SPACE])('allows selection with %s key', async (key) => {
    const { getButton, user, picker } = await setup({
      pickerProps: { placeholder: zonedDateTime },
    })

    const marchMonth = getButton('March 1980')
    marchMonth.focus()
    await user.keyboard(key)

    const selectedMonth = getSelectedMonth(picker)
    expect(text(selectedMonth)).toBe('Mar')
  })

  it('should not allow navigation before the `minValue` (prev button)', async () => {
    const { getByTestId, getButton, user } = await setup({
      pickerProps: {
        modelValue: calendarDate,
        minValue: new CalendarDate(1979, 6, 1),
      },
    })

    const prevBtn = getButton('Previous year')
    await user.click(page.elementLocator(prevBtn))
    const heading = getByTestId('heading')
    expect(text(heading)).toBe('1979')
    expect(prevBtn).toHaveAttribute('aria-disabled', 'true')
    expect(prevBtn).toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(prevBtn), { force: true })
    expect(text(heading)).toBe('1979')
  })

  it('should not allow navigation after the `maxValue` (next button)', async () => {
    const { getByTestId, getButton, user } = await setup({
      pickerProps: {
        modelValue: calendarDate,
        maxValue: new CalendarDate(1981, 6, 30),
      },
    })

    const nextBtn = getButton('Next year')
    await user.click(page.elementLocator(nextBtn))
    const heading = getByTestId('heading')
    expect(text(heading)).toBe('1981')
    expect(nextBtn).toHaveAttribute('aria-disabled', 'true')
    expect(nextBtn).toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(nextBtn), { force: true })
    expect(text(heading)).toBe('1981')
  })

  it('handles unavailable months appropriately', async () => {
    const { getButton, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        isMonthUnavailable: (date: DateValue) => {
          return date.month === 3
        },
      },
    })

    const marchMonth = getButton('March 1980')
    expect(text(marchMonth)).toBe('Mar')
    expect(marchMonth).toHaveAttribute('data-unavailable')
    expect(marchMonth).toHaveAttribute('aria-disabled', 'true')
    await user.click(page.elementLocator(marchMonth), { force: true })
    expect(marchMonth).not.toHaveAttribute('data-selected')
  })

  it('handles disabled months appropriately', async () => {
    const { getButton, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        isMonthDisabled: (date: DateValue) => {
          return date.month === 3
        },
      },
    })

    const marchMonth = getButton('March 1980')
    expect(text(marchMonth)).toBe('Mar')
    expect(marchMonth).toHaveAttribute('data-disabled')
    expect(marchMonth).toHaveAttribute('aria-disabled', 'true')
    await user.click(page.elementLocator(marchMonth), { force: true })
    expect(marchMonth).not.toHaveAttribute('data-selected')
  })

  it('doesnt allow focus or interaction when `disabled` is `true`', async () => {
    const { getByTestId, getButton, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        disabled: true,
      },
    })

    const grid = getByTestId('grid')
    expect(grid).toHaveAttribute('aria-disabled', 'true')
    expect(grid).toHaveAttribute('data-disabled')

    const janMonth = getButton('January 1980')
    expect(janMonth).toHaveAttribute('aria-disabled', 'true')
    expect(janMonth).toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(janMonth), { force: true })
    expect(janMonth).not.toHaveAttribute('data-selected')
    janMonth.focus()
    expect(janMonth).not.toHaveFocus()

    const prevButton = getButton('Previous year')
    const nextButton = getButton('Next year')
    expect(prevButton).toBeDisabled()
    expect(nextButton).toBeDisabled()
  })

  it('prevents selection but allows focus when `readonly` is `true`', async () => {
    const { getByTestId, getButton, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        readonly: true,
      },
    })

    const grid = getByTestId('grid')
    expect(grid).toHaveAttribute('aria-readonly', 'true')
    expect(grid).toHaveAttribute('data-readonly')

    const janMonth = getButton('January 1980')
    await user.click(page.elementLocator(janMonth))
    expect(janMonth).not.toHaveAttribute('data-selected')
    janMonth.focus()
    expect(janMonth).toHaveFocus()
  })
})

describe('month picker - keyboard navigation', () => {
  it('navigates with arrow keys within the grid', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: { placeholder: calendarDate },
    })

    const janMonth = getByTestId('month-1')
    janMonth.focus()
    expect(janMonth).toHaveFocus()

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(getByTestId('month-2')).toHaveFocus()

    await user.keyboard(kbd.ARROW_DOWN)
    expect(getByTestId('month-6')).toHaveFocus()

    await user.keyboard(kbd.ARROW_LEFT)
    expect(getByTestId('month-5')).toHaveFocus()

    await user.keyboard(kbd.ARROW_UP)
    expect(getByTestId('month-1')).toHaveFocus()
  })

  it('navigates to next/prev year with PageDown/PageUp', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: { placeholder: calendarDate },
    })

    const janMonth = getByTestId('month-1')
    janMonth.focus()
    expect(janMonth).toHaveFocus()
    expect(text(getByTestId('heading'))).toBe('1980')

    await user.keyboard(kbd.PAGE_DOWN)
    expect(text(getByTestId('heading'))).toBe('1981')

    await user.keyboard(kbd.PAGE_UP)
    expect(text(getByTestId('heading'))).toBe('1980')
  })

  it('wraps around months when navigating past boundaries', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: { placeholder: calendarDate },
    })

    const decMonth = getByTestId('month-12')
    decMonth.focus()
    expect(decMonth).toHaveFocus()

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(text(getByTestId('heading'))).toBe('1981')
    expect(getByTestId('month-1')).toHaveFocus()
  })
})

describe('month picker - multiple', () => {
  it('handles multiple selection', async () => {
    const d1 = new CalendarDate(1980, 1, 1)
    const d2 = new CalendarDate(1980, 3, 1)
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthPicker>>>['rerender']

    const { picker, getButton, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: [d1, d2], multiple: true },
      emits: { 'onUpdate:modelValue': (data: DateValue) => rerender({ pickerProps: { modelValue: data as any, multiple: true } }) },
    } as any)
    rerender = screenRerender

    const selectedMonths = getSelectedMonths(picker)
    expect(selectedMonths.length).toBe(2)

    const mayMonth = getButton('May 1980')
    await user.click(page.elementLocator(mayMonth))

    expect(getSelectedMonths(picker).length).toBe(3)
  })

  it('allows deselection in multiple mode', async () => {
    const d1 = new CalendarDate(1980, 1, 1)
    const d2 = new CalendarDate(1980, 3, 1)
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthPicker>>>['rerender']

    const { picker, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: [d1, d2], multiple: true },
      emits: { 'onUpdate:modelValue': (data: DateValue) => rerender({ pickerProps: { modelValue: data as any, multiple: true } }) },
    } as any)
    rerender = screenRerender

    const selectedMonths = getSelectedMonths(picker)
    expect(selectedMonths.length).toBe(2)

    await user.click(page.elementLocator(selectedMonths[0]))
    expect(getSelectedMonths(picker).length).toBe(1)
  })

  it('normalizes single modelValue when multiple is true', async () => {
    const d1 = new CalendarDate(1980, 1, 1)
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthPicker>>>['rerender']

    const { picker, getByTestId, getButton, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: d1, multiple: true },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data as any, multiple: true } }) },
    })
    rerender = screenRerender

    expect(getSelectedMonths(picker)).toHaveLength(1)
    expect(getByTestId('month-1')).toHaveAttribute('data-selected')

    await user.click(page.elementLocator(getButton('May 1980')))

    expect(getSelectedMonths(picker)).toHaveLength(2)
    expect(getByTestId('month-1')).toHaveAttribute('data-selected')
    expect(getByTestId('month-5')).toHaveAttribute('data-selected')
  })
})
