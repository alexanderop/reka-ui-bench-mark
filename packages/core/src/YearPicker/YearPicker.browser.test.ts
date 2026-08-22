import type { DateValue } from '@internationalized/date'
import type { YearPickerRootProps } from './YearPickerRoot.vue'
import { CalendarDate, CalendarDateTime, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { useTestKbd } from '@/shared'
import YearPicker from './story/_YearPicker.vue'

const calendarDate = new CalendarDate(1980, 1, 20)
const calendarDateTime = new CalendarDateTime(1980, 1, 20, 12, 30, 0, 0)
const zonedDateTime = toZoned(calendarDateTime, 'America/New_York')

const kbd = useTestKbd()

async function setup(props: { pickerProps?: YearPickerRootProps, emits?: { 'onUpdate:modelValue'?: (data: DateValue) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(YearPicker, { props })
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement
  const getButton = (name: string) => returned.getByRole('button', { name, exact: true }).element() as HTMLElement
  const picker = getByTestId('year-picker')
  expect(picker).toBeVisible()
  return { ...returned, getByTestId, getButton, user, picker }
}

function getSelectedYear(picker: HTMLElement) {
  return picker.querySelector<HTMLElement>('[data-selected]')
}

function getSelectedYears(picker: HTMLElement) {
  return Array.from(picker.querySelectorAll<HTMLElement>('[data-selected]'))
}

it('should pass axe accessibility tests', async () => {
  const { picker } = await setup()
  // Censused in Chromium: 21 node-bearing passes, including
  // aria-command-name(12), button-name(2), color-contrast(15), and the
  // table/grid relationships; aria-prohibited-attr has one incomplete node.
  expect(await axe(picker)).toHaveNoViolations()
})

describe('year picker', async () => {
  it('respects a default value if provided - `CalendarDate`', async () => {
    const { getByTestId, picker } = await setup({ pickerProps: { modelValue: calendarDate } })
    expect(getSelectedYear(picker)).toHaveTextContent('1980')
    expect(getByTestId('heading')).toHaveTextContent('1980 - 1991')
  })

  it('respects a default value if provided - `CalendarDateTime`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: calendarDateTime } })
    expect(getSelectedYear(picker)).toHaveTextContent('1980')
    expect(getByTestId('heading')).toHaveTextContent('1980 - 1991')
  })

  it('respects a default value if provided - `ZonedDateTime`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: zonedDateTime } })
    expect(getSelectedYear(picker)).toHaveTextContent('1980')
    expect(getByTestId('heading')).toHaveTextContent('1980 - 1991')
  })

  it('does not crash when modelValue is null', async () => {
    const { picker, rerender } = await setup({ pickerProps: { modelValue: null } })

    expect(getSelectedYears(picker)).toHaveLength(0)

    await rerender({
      pickerProps: {
        modelValue: calendarDate,
      },
    })

    expect(getSelectedYear(picker)).toHaveTextContent('1980')
  })

  it('navigates to next decade using next button', async () => {
    const { getByTestId, getButton, user } = await setup({ pickerProps: { modelValue: calendarDate } })

    const heading = getByTestId('heading')
    const nextBtn = getButton('Next page')

    expect(heading).toHaveTextContent('1980 - 1991')
    await user.click(page.elementLocator(nextBtn))
    expect(heading).toHaveTextContent('1992 - 2003')
    await user.click(page.elementLocator(nextBtn))
    expect(heading).toHaveTextContent('2004 - 2015')
  })

  it('navigates to prev decade using prev button', async () => {
    const { getByTestId, getButton, user } = await setup({ pickerProps: { modelValue: calendarDate } })

    const heading = getByTestId('heading')
    const prevBtn = getButton('Previous page')

    expect(heading).toHaveTextContent('1980 - 1991')
    await user.click(page.elementLocator(prevBtn))
    expect(heading).toHaveTextContent('1968 - 1979')
    await user.click(page.elementLocator(prevBtn))
    expect(heading).toHaveTextContent('1956 - 1967')
  })

  it('allows years to be deselected by clicking the selected year', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof YearPicker>>>['rerender']
    const { user, picker, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDate },
      emits: { 'onUpdate:modelValue': (data: DateValue) => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    const selectedYear = getSelectedYear(picker)!
    expect(selectedYear).toHaveTextContent('1980')
    await user.click(page.elementLocator(selectedYear))
    expect(getSelectedYear(picker)).toBe(null)
  })

  it.each([kbd.ENTER, kbd.SPACE])('allows deselection with %s key', async (key) => {
    let rerender!: Awaited<ReturnType<typeof render<typeof YearPicker>>>['rerender']
    const { user, picker, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDate },
      emits: { 'onUpdate:modelValue': (data: DateValue) => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    const selectedYear = getSelectedYear(picker)!
    expect(selectedYear).toHaveTextContent('1980')
    selectedYear.focus()
    await user.keyboard(key)
    expect(getSelectedYear(picker)).toBe(null)
  })

  it('allows selection with mouse', async () => {
    const { getButton, user, picker } = await setup({
      pickerProps: { placeholder: zonedDateTime },
    })

    const year1985 = getButton('1985')
    expect(year1985).toHaveTextContent('1985')
    await user.click(page.elementLocator(year1985))

    const selectedYear = getSelectedYear(picker)
    expect(selectedYear).toHaveTextContent('1985')
  })

  it.each([kbd.ENTER, kbd.SPACE])('allows selection with %s key', async (key) => {
    const { getButton, user, picker } = await setup({
      pickerProps: { placeholder: zonedDateTime },
    })

    const year1985 = getButton('1985')
    year1985.focus()
    await user.keyboard(key)

    const selectedYear = getSelectedYear(picker)
    expect(selectedYear).toHaveTextContent('1985')
  })

  it('should not allow navigation before the `minValue` (prev button)', async () => {
    const { getByTestId, getButton, user } = await setup({
      pickerProps: {
        modelValue: calendarDate,
        minValue: new CalendarDate(1980, 1, 1),
      },
    })

    const prevBtn = getButton('Previous page')
    const heading = getByTestId('heading')
    expect(heading).toHaveTextContent('1980 - 1991')
    expect(prevBtn).toHaveAttribute('aria-disabled', 'true')
    expect(prevBtn).toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(prevBtn), { force: true })
    expect(heading).toHaveTextContent('1980 - 1991')
  })

  it('should not allow navigation after the `maxValue` (next button)', async () => {
    const { getByTestId, getButton, user } = await setup({
      pickerProps: {
        modelValue: calendarDate,
        maxValue: new CalendarDate(1991, 12, 31),
      },
    })

    const nextBtn = getButton('Next page')
    const heading = getByTestId('heading')
    expect(heading).toHaveTextContent('1980 - 1991')
    expect(nextBtn).toHaveAttribute('aria-disabled', 'true')
    expect(nextBtn).toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(nextBtn), { force: true })
    expect(heading).toHaveTextContent('1980 - 1991')
  })

  it('handles unavailable years appropriately', async () => {
    const { getButton, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        isYearUnavailable: (date: DateValue) => {
          return date.year === 1985
        },
      },
    })

    const year1985 = getButton('1985')
    expect(year1985).toHaveTextContent('1985')
    expect(year1985).toHaveAttribute('data-unavailable')
    expect(year1985).toHaveAttribute('aria-disabled', 'true')
    await user.click(page.elementLocator(year1985), { force: true })
    expect(year1985).not.toHaveAttribute('data-selected')
  })

  it('handles disabled years appropriately', async () => {
    const { getButton, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        isYearDisabled: (date: DateValue) => {
          return date.year === 1985
        },
      },
    })

    const year1985 = getButton('1985')
    expect(year1985).toHaveTextContent('1985')
    expect(year1985).toHaveAttribute('data-disabled')
    expect(year1985).toHaveAttribute('aria-disabled', 'true')
    await user.click(page.elementLocator(year1985), { force: true })
    expect(year1985).not.toHaveAttribute('data-selected')
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

    const year1980 = getButton('1980')
    expect(year1980).toHaveAttribute('aria-disabled', 'true')
    expect(year1980).toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(year1980), { force: true })
    expect(year1980).not.toHaveAttribute('data-selected')
    year1980.focus()
    expect(year1980).not.toHaveFocus()

    const prevButton = getButton('Previous page')
    const nextButton = getButton('Next page')
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

    const year1980 = getButton('1980')
    await user.click(page.elementLocator(year1980))
    expect(year1980).not.toHaveAttribute('data-selected')
    year1980.focus()
    expect(year1980).toHaveFocus()
  })
})

describe('year picker - keyboard navigation', () => {
  it('navigates with arrow keys within the grid', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: { placeholder: calendarDate },
    })

    const year1980 = getByTestId('year-1980')
    year1980.focus()
    expect(year1980).toHaveFocus()

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(getByTestId('year-1981')).toHaveFocus()

    await user.keyboard(kbd.ARROW_DOWN)
    expect(getByTestId('year-1985')).toHaveFocus()

    await user.keyboard(kbd.ARROW_LEFT)
    expect(getByTestId('year-1984')).toHaveFocus()

    await user.keyboard(kbd.ARROW_UP)
    expect(getByTestId('year-1980')).toHaveFocus()
  })

  it('navigates to next/prev page with PageDown/PageUp', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: { placeholder: calendarDate },
    })

    const year1980 = getByTestId('year-1980')
    year1980.focus()
    expect(year1980).toHaveFocus()
    expect(getByTestId('heading')).toHaveTextContent('1980 - 1991')

    await user.keyboard(kbd.PAGE_DOWN)
    expect(getByTestId('heading')).toHaveTextContent('1992 - 2003')

    await user.keyboard(kbd.PAGE_UP)
    expect(getByTestId('heading')).toHaveTextContent('1980 - 1991')
  })

  it('skips disabled candidate year when navigating to next page', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        isYearDisabled: (date: DateValue) => date.year === 1992,
      },
    })

    const year1980 = getByTestId('year-1980')
    year1980.focus()
    expect(year1980).toHaveFocus()

    await user.keyboard(kbd.PAGE_DOWN)
    expect(getByTestId('heading')).toHaveTextContent('1992 - 2003')
    expect(getByTestId('year-1992')).toHaveAttribute('data-disabled')
    expect(getByTestId('year-1993')).toHaveFocus()
  })

  it('falls back to the nearest enabled year when paged candidate is missing on PageDown', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        nextPage: date => date.add({ years: 13 }),
      },
    })

    const year1980 = getByTestId('year-1980')
    year1980.focus()
    expect(year1980).toHaveFocus()

    await user.keyboard(kbd.PAGE_DOWN)

    expect(getByTestId('heading')).toHaveTextContent('1993 - 2004')
    expect(getByTestId('year-1993')).toHaveFocus()
  })

  it('falls back to the nearest enabled year when paged candidate is missing on PageUp', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        prevPage: date => date.subtract({ years: 24 }),
      },
    })

    const year1980 = getByTestId('year-1980')
    year1980.focus()
    expect(year1980).toHaveFocus()

    await user.keyboard(kbd.PAGE_UP)

    expect(getByTestId('heading')).toHaveTextContent('1956 - 1967')
    expect(getByTestId('year-1967')).toHaveFocus()
  })

  it('wraps around years when navigating past boundaries', async () => {
    const { getByTestId, user } = await setup({
      pickerProps: { placeholder: calendarDate },
    })

    const year1991 = getByTestId('year-1991')
    year1991.focus()
    expect(year1991).toHaveFocus()

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(getByTestId('heading')).toHaveTextContent('1992 - 2003')
    expect(getByTestId('year-1992')).toHaveFocus()
  })
})

describe('year picker - multiple', () => {
  it('handles multiple selection', async () => {
    const d1 = new CalendarDate(1980, 1, 1)
    const d2 = new CalendarDate(1985, 1, 1)
    let rerender!: Awaited<ReturnType<typeof render<typeof YearPicker>>>['rerender']

    const { picker, getButton, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: [d1, d2], multiple: true },
      emits: { 'onUpdate:modelValue': (data: DateValue) => rerender({ pickerProps: { modelValue: data as any, multiple: true } }) },
    } as any)
    rerender = screenRerender

    const selectedYears = getSelectedYears(picker)
    expect(selectedYears.length).toBe(2)

    const year1988 = getButton('1988')
    await user.click(page.elementLocator(year1988))

    expect(getSelectedYears(picker).length).toBe(3)
  })

  it('allows deselection in multiple mode', async () => {
    const d1 = new CalendarDate(1980, 1, 1)
    const d2 = new CalendarDate(1985, 1, 1)
    let rerender!: Awaited<ReturnType<typeof render<typeof YearPicker>>>['rerender']

    const { picker, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: [d1, d2], multiple: true },
      emits: { 'onUpdate:modelValue': (data: DateValue) => rerender({ pickerProps: { modelValue: data as any, multiple: true } }) },
    } as any)
    rerender = screenRerender

    const selectedYears = getSelectedYears(picker)
    expect(selectedYears.length).toBe(2)

    await user.click(page.elementLocator(selectedYears[0]))
    expect(getSelectedYears(picker).length).toBe(1)
  })
})

describe('year picker - yearsPerPage', () => {
  it('respects custom yearsPerPage prop', async () => {
    const { getByTestId } = await setup({
      pickerProps: {
        placeholder: calendarDate,
        yearsPerPage: 16,
      },
    })

    const heading = getByTestId('heading')
    expect(heading).toHaveTextContent('1980 - 1995')
  })
})
