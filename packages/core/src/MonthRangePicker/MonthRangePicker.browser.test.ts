import type { DateValue } from '@internationalized/date'
import type { MonthRangePickerRootProps } from './MonthRangePickerRoot.vue'
import type { DateRange } from '@/shared/date'
import { CalendarDate, CalendarDateTime, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { useTestKbd } from '@/shared'
import MonthRangePicker from './story/_MonthRangePicker.vue'

const calendarDateRange = {
  start: new CalendarDate(1980, 1, 20),
  end: new CalendarDate(1980, 3, 25),
}

const updatedCalendarDateRange = {
  start: new CalendarDate(1980, 4, 5),
  end: new CalendarDate(1980, 6, 5),
}

const calendarDateTimeRange = {
  start: new CalendarDateTime(1980, 1, 20, 12, 30, 0, 0),
  end: new CalendarDateTime(1980, 3, 25, 12, 30, 0, 0),
}

const zonedDateTimeRange = {
  start: toZoned(calendarDateTimeRange.start, 'America/New_York'),
  end: toZoned(calendarDateTimeRange.end, 'America/New_York'),
}

const kbd = useTestKbd()
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

async function setup(props: { pickerProps?: MonthRangePickerRootProps, emits?: { 'onUpdate:modelValue'?: (data: DateRange) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(MonthRangePicker, { props })
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement
  const getButton = (name: string) => returned.getByRole('button', { name, exact: true }).element() as HTMLElement
  const getMonth = (month: number, year = 1980) => getButton(`${monthNames[month - 1]} ${year}`)
  const picker = getByTestId('month-range-picker')
  expect(picker).toBeVisible()
  return { ...returned, getByTestId, getButton, getMonth, user, picker }
}

function getSelectedMonths(picker: HTMLElement) {
  return Array.from(picker.querySelectorAll<HTMLElement>('[data-selected]'))
}

function monthLabels(months: HTMLElement[]) {
  return months.map(month => month.textContent?.trim())
}

function text(element: Element | null) {
  return element?.textContent?.trim()
}

it('should pass axe accessibility tests', async () => {
  const { picker } = await setup()
  // Chromium produces 21 node-bearing passes, including aria-command-name
  // (12), button-name (2), color-contrast (15), and the table relationships.
  // aria-prohibited-attr has one incomplete node; there are no violations.
  const results = await axe(picker)
  expect(results).toHaveNoViolations()
})

describe('month range picker', () => {
  it('respects a default value if provided - `CalendarDate`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: calendarDateRange } })
    const selectedMonths = getSelectedMonths(picker)
    expect(monthLabels(selectedMonths)).toStrictEqual(['Jan', 'Feb', 'Mar'])
    expect(text(getByTestId('heading'))).toBe('1980')
  })

  it('respects a default value if provided - `CalendarDateTime`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: calendarDateTimeRange } })
    const selectedMonths = getSelectedMonths(picker)
    expect(monthLabels(selectedMonths)).toStrictEqual(['Jan', 'Feb', 'Mar'])
    expect(text(getByTestId('heading'))).toBe('1980')
  })

  it('respects a default value if provided - `ZonedDateTime`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: zonedDateTimeRange } })
    const selectedMonths = getSelectedMonths(picker)
    expect(monthLabels(selectedMonths)).toStrictEqual(['Jan', 'Feb', 'Mar'])
    expect(text(getByTestId('heading'))).toBe('1980')
  })

  it('does not crash when modelValue is null', async () => {
    const { picker, rerender } = await setup({ pickerProps: { modelValue: null } })

    expect(monthLabels(getSelectedMonths(picker))).toStrictEqual([])

    await rerender({
      pickerProps: {
        modelValue: calendarDateRange,
      },
    })

    expect(monthLabels(getSelectedMonths(picker))).toStrictEqual(['Jan', 'Feb', 'Mar'])
  })

  it('resets range on select when a range is already selected', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthRangePicker>>>['rerender']
    const { getMonth, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDateRange },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    let startValue = picker.querySelector('[data-selection-start]')
    let endValue = picker.querySelector('[data-selection-end]')

    expect(text(startValue)).toBe('Jan')
    expect(text(endValue)).toBe('Mar')

    await user.click(page.elementLocator(getMonth(5)))

    expect(monthLabels(getSelectedMonths(picker))).toStrictEqual(['May'])

    startValue = picker.querySelector('[data-selection-start]')
    endValue = picker.querySelector('[data-selection-end]')

    expect(startValue).toBe(getMonth(5))
    expect(endValue).not.toBeInTheDocument()

    await user.click(page.elementLocator(getMonth(7)))
    expect(monthLabels(getSelectedMonths(picker))).toStrictEqual(['May', 'Jun', 'Jul'])
  })

  it('keeps controlled end when parent preserves it after start edit', async () => {
    const preservedEnd = new CalendarDate(1980, 8, 1)
    const controlledRange = {
      start: new CalendarDate(1980, 1, 1),
      end: preservedEnd,
    }

    let rerender!: Awaited<ReturnType<typeof render<typeof MonthRangePicker>>>['rerender']
    const { getByTestId, getMonth, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: controlledRange },
      emits: {
        'onUpdate:modelValue': (data) => {
          return rerender({
            pickerProps: {
              modelValue: {
                start: data.start ?? controlledRange.start,
                end: data.end ?? preservedEnd,
              },
            },
          })
        },
      },
    })
    rerender = screenRerender

    await user.click(page.elementLocator(getMonth(4)))

    expect(getByTestId('month-4')).toHaveAttribute('data-selection-start')
    expect(getByTestId('month-8')).toHaveAttribute('data-selection-end')
    expect(getByTestId('month-5')).toHaveAttribute('data-selected')
    expect(getByTestId('month-7')).toHaveAttribute('data-selected')
    expect(monthLabels(getSelectedMonths(picker))).toStrictEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug'])
  })

  it('allows same month selection', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthRangePicker>>>['rerender']
    const { getMonth, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { placeholder: calendarDateRange.start },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    const janMonth = getMonth(1)
    await user.click(page.elementLocator(janMonth))
    await user.click(page.elementLocator(janMonth))

    expect(monthLabels(getSelectedMonths(picker))).toStrictEqual(['Jan'])
    expect(picker.querySelector('[data-selection-start]')).toBe(getMonth(1))
    expect(picker.querySelector('[data-selection-end]')).toBe(getMonth(1))
  })

  it('allows deselection', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthRangePicker>>>['rerender']
    const { getMonth, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { placeholder: calendarDateRange.start },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    const janMonth = getMonth(1)
    await user.click(page.elementLocator(janMonth))
    await user.click(page.elementLocator(janMonth))

    expect(monthLabels(getSelectedMonths(picker))).toStrictEqual(['Jan'])

    await user.click(page.elementLocator(janMonth))
    expect(getSelectedMonths(picker)).toHaveLength(0)
  })

  it('resets range selection when pressing Escape', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthRangePicker>>>['rerender']
    const { getMonth, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDateRange },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    let startValue = picker.querySelector('[data-selection-start]')
    let endValue = picker.querySelector('[data-selection-end]')

    expect(text(startValue)).toBe('Jan')
    expect(text(endValue)).toBe('Mar')

    await user.click(page.elementLocator(getMonth(5)))

    const selectedMonths = getSelectedMonths(picker)
    expect(selectedMonths).toHaveLength(1)

    await user.keyboard(kbd.ESCAPE)

    startValue = picker.querySelector('[data-selection-start]')
    endValue = picker.querySelector('[data-selection-end]')

    expect(text(startValue)).toBe('Jan')
    expect(text(endValue)).toBe('Mar')
  })

  it('resets to latest externally controlled complete range when pressing Escape', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof MonthRangePicker>>>['rerender']
    const { getMonth, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDateRange },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    await rerender({ pickerProps: { modelValue: updatedCalendarDateRange } })

    let startValue = picker.querySelector('[data-selection-start]')
    let endValue = picker.querySelector('[data-selection-end]')

    expect(text(startValue)).toBe('Apr')
    expect(text(endValue)).toBe('Jun')

    await user.click(page.elementLocator(getMonth(2)))
    expect(getSelectedMonths(picker)).toHaveLength(1)

    await user.keyboard(kbd.ESCAPE)

    startValue = picker.querySelector('[data-selection-start]')
    endValue = picker.querySelector('[data-selection-end]')

    expect(text(startValue)).toBe('Apr')
    expect(text(endValue)).toBe('Jun')
  })

  it('navigates years forward using the next button', async () => {
    const { getByTestId, getButton, user } = await setup({ pickerProps: { modelValue: calendarDateRange } })

    const heading = getByTestId('heading')
    const nextBtn = getButton('Next year')

    expect(text(heading)).toBe('1980')
    await user.click(page.elementLocator(nextBtn))
    expect(text(heading)).toBe('1981')
  })

  it('navigates years backwards using the prev button', async () => {
    const { getByTestId, getButton, user } = await setup({ pickerProps: { modelValue: calendarDateRange } })

    const heading = getByTestId('heading')
    const prevBtn = getButton('Previous year')

    expect(text(heading)).toBe('1980')
    await user.click(page.elementLocator(prevBtn))
    expect(text(heading)).toBe('1979')
  })

  it('handles fixedDate with start correctly', async () => {
    const { getByTestId, getMonth, user } = await setup({
      pickerProps: {
        defaultValue: calendarDateRange,
        fixedDate: 'start',
      },
    })

    const heading = getByTestId('heading')
    expect(text(heading)).toBe('1980')

    await user.click(page.elementLocator(getMonth(5)))

    expect(getByTestId('month-4')).toHaveAttribute('data-selected')
    expect(getByTestId('month-1')).toHaveAttribute('data-selection-start')
    expect(getByTestId('month-5')).toHaveAttribute('data-selection-end')
  })

  it('handles fixedDate with end correctly', async () => {
    const { getByTestId, getMonth, user } = await setup({
      pickerProps: {
        defaultValue: calendarDateRange,
        fixedDate: 'end',
      },
    })

    const heading = getByTestId('heading')
    expect(text(heading)).toBe('1980')

    await user.click(page.elementLocator(getMonth(5)))

    expect(getByTestId('month-4')).toHaveAttribute('data-selected')
    expect(getByTestId('month-1')).toHaveAttribute('data-selection-start')
    expect(getByTestId('month-5')).toHaveAttribute('data-selection-end')

    await user.click(page.elementLocator(getMonth(2)))
    expect(getByTestId('month-2')).toHaveAttribute('data-selection-start')
    expect(getByTestId('month-5')).toHaveAttribute('data-selection-end')
  })

  it('allows non-contiguous ranges', async () => {
    const { getMonth, picker, user } = await setup({
      pickerProps: {
        placeholder: calendarDateRange.start,
        allowNonContiguousRanges: true,
        isMonthUnavailable: (date: DateValue) => {
          return date.month === 3
        },
      },
    })

    await user.click(page.elementLocator(getMonth(1)))
    await user.click(page.elementLocator(getMonth(5)))
    expect(monthLabels(getSelectedMonths(picker))).toStrictEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May'])
  })
})

describe('month range picker - maximumMonths', () => {
  it('limits the maximum number of months that can be selected', async () => {
    const { getByTestId, getMonth, user } = await setup({
      pickerProps: {
        placeholder: new CalendarDate(1980, 3, 15),
        maximumMonths: 3,
      },
    })

    const marchMonth = getMonth(3)
    await user.click(page.elementLocator(marchMonth))
    expect(marchMonth).toHaveAttribute('data-selection-start')

    const juneMonth = getMonth(6)
    await user.click(page.elementLocator(juneMonth), { force: true })

    expect(juneMonth).toHaveAttribute('data-disabled')
    expect(juneMonth).not.toHaveAttribute('data-selected')

    const mayMonth = getMonth(5)
    expect(mayMonth).not.toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(mayMonth))
    expect(getByTestId('month-3')).toHaveAttribute('data-selected')
    expect(getByTestId('month-4')).toHaveAttribute('data-selected')
    expect(getByTestId('month-5')).toHaveAttribute('data-selected')
  })

  it('highlights backwards within maximumMonths without inverting', async () => {
    const { getByTestId, getMonth, user } = await setup({
      pickerProps: {
        placeholder: new CalendarDate(1980, 3, 15),
        maximumMonths: 3,
      },
    })

    const marchMonth = getMonth(3)
    await user.click(page.elementLocator(marchMonth))
    expect(marchMonth).toHaveAttribute('data-selection-start')

    const janMonth = getMonth(1)
    await user.hover(page.elementLocator(janMonth))

    expect(janMonth).toHaveAttribute('data-highlighted-start')
    expect(getByTestId('month-2')).toHaveAttribute('data-highlighted')
    expect(marchMonth).toHaveAttribute('data-highlighted-end')
    expect(getByTestId('month-4')).not.toHaveAttribute('data-highlighted')
  })

  it('enforces maximumMonths for out-of-bounds controlled ranges with fixedDate="start"', async () => {
    const outOfBoundsRange = {
      start: new CalendarDate(1980, 1, 1),
      end: new CalendarDate(1980, 6, 1),
    }

    let rerender!: Awaited<ReturnType<typeof render<typeof MonthRangePicker>>>['rerender']
    const { getByTestId, getMonth, user, rerender: screenRerender } = await setup({
      pickerProps: {
        modelValue: outOfBoundsRange,
        fixedDate: 'start',
        maximumMonths: 3,
      },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data, fixedDate: 'start', maximumMonths: 3 } }) },
    })
    rerender = screenRerender

    expect(getByTestId('month-5')).toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(getMonth(5)), { force: true })
    expect(getByTestId('month-6')).toHaveAttribute('data-selection-end')

    await user.click(page.elementLocator(getMonth(3)))
    expect(getByTestId('month-1')).toHaveAttribute('data-selection-start')
    expect(getByTestId('month-2')).toHaveAttribute('data-selected')
    expect(getByTestId('month-3')).toHaveAttribute('data-selection-end')
    expect(getByTestId('month-4')).not.toHaveAttribute('data-selected')
  })

  it('enforces maximumMonths for out-of-bounds controlled ranges with fixedDate="end"', async () => {
    const outOfBoundsRange = {
      start: new CalendarDate(1980, 1, 1),
      end: new CalendarDate(1980, 6, 1),
    }

    let rerender!: Awaited<ReturnType<typeof render<typeof MonthRangePicker>>>['rerender']
    const { getByTestId, getMonth, user, rerender: screenRerender } = await setup({
      pickerProps: {
        modelValue: outOfBoundsRange,
        fixedDate: 'end',
        maximumMonths: 3,
      },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data, fixedDate: 'end', maximumMonths: 3 } }) },
    })
    rerender = screenRerender

    expect(getByTestId('month-2')).toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(getMonth(2)), { force: true })
    expect(getByTestId('month-1')).toHaveAttribute('data-selection-start')

    await user.click(page.elementLocator(getMonth(4)))
    expect(getByTestId('month-4')).toHaveAttribute('data-selection-start')
    expect(getByTestId('month-5')).toHaveAttribute('data-selected')
    expect(getByTestId('month-6')).toHaveAttribute('data-selection-end')
    expect(getByTestId('month-3')).not.toHaveAttribute('data-selected')
  })
})

describe('month range picker - keyboard navigation', () => {
  it('navigates with arrow keys within the grid', async () => {
    const { getMonth, user } = await setup({
      pickerProps: { placeholder: calendarDateRange.start },
    })

    const janMonth = getMonth(1)
    janMonth.focus()
    expect(janMonth).toHaveFocus()

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(getMonth(2)).toHaveFocus()

    await user.keyboard(kbd.ARROW_DOWN)
    expect(getMonth(6)).toHaveFocus()

    await user.keyboard(kbd.ARROW_LEFT)
    expect(getMonth(5)).toHaveFocus()

    await user.keyboard(kbd.ARROW_UP)
    expect(getMonth(1)).toHaveFocus()
  })

  it('navigates to next/prev year with PageDown/PageUp', async () => {
    const { getByTestId, getMonth, user } = await setup({
      pickerProps: { placeholder: calendarDateRange.start },
    })

    const janMonth = getMonth(1)
    janMonth.focus()
    expect(janMonth).toHaveFocus()
    expect(text(getByTestId('heading'))).toBe('1980')

    await user.keyboard(kbd.PAGE_DOWN)
    expect(text(getByTestId('heading'))).toBe('1981')

    await user.keyboard(kbd.PAGE_UP)
    expect(text(getByTestId('heading'))).toBe('1980')
  })

  it('skips disabled candidate month when paging by year', async () => {
    const { getByTestId, getMonth, user } = await setup({
      pickerProps: {
        placeholder: calendarDateRange.start,
        isMonthDisabled: (date: DateValue) => date.year === 1981 && date.month === 1,
      },
    })

    const janMonth = getMonth(1)
    janMonth.focus()
    expect(janMonth).toHaveFocus()

    await user.keyboard(kbd.PAGE_DOWN)
    expect(text(getByTestId('heading'))).toBe('1981')
    expect(getByTestId('month-1')).toHaveAttribute('data-disabled')
    expect(getMonth(2, 1981)).toHaveFocus()
  })
})
