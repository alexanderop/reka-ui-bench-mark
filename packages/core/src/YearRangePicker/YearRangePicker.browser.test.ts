import type { DateValue } from '@internationalized/date'
import type { YearRangePickerRootProps } from './YearRangePickerRoot.vue'
import type { DateRange } from '@/shared/date'
import { CalendarDate, CalendarDateTime, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { useTestKbd } from '@/shared'
import YearRangePicker from './story/_YearRangePicker.vue'

const calendarDateRange = {
  start: new CalendarDate(1980, 1, 20),
  end: new CalendarDate(1983, 3, 25),
}

const calendarDateTimeRange = {
  start: new CalendarDateTime(1980, 1, 20, 12, 30, 0, 0),
  end: new CalendarDateTime(1983, 3, 25, 12, 30, 0, 0),
}

const zonedDateTimeRange = {
  start: toZoned(calendarDateTimeRange.start, 'America/New_York'),
  end: toZoned(calendarDateTimeRange.end, 'America/New_York'),
}

const kbd = useTestKbd()

async function setup(props: { pickerProps?: YearRangePickerRootProps, emits?: { 'onUpdate:modelValue'?: (data: DateRange) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(YearRangePicker, { props })
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement
  const getButton = (name: string) => returned.getByRole('button', { name, exact: true }).element() as HTMLElement
  const getYear = (year: number) => getButton(String(year))
  const picker = getByTestId('year-range-picker')
  expect(picker).toBeVisible()
  return { ...returned, getByTestId, getButton, getYear, user, picker }
}

function getSelectedYears(picker: HTMLElement) {
  return Array.from(picker.querySelectorAll<HTMLElement>('[data-selected]'))
}

function yearLabels(years: HTMLElement[]) {
  return years.map(year => year.textContent)
}

it('should pass axe accessibility tests', async () => {
  const { picker } = await setup()
  // Chromium produces 21 node-bearing passes, including aria-command-name
  // (12), button-name (2), color-contrast (15), and the table relationships.
  // aria-prohibited-attr has one incomplete node; there are no violations.
  const results = await axe(picker)
  expect(results).toHaveNoViolations()
})

describe('year range picker', () => {
  it('respects a default value if provided - `CalendarDate`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: calendarDateRange } })
    const selectedYears = getSelectedYears(picker)
    expect(yearLabels(selectedYears)).toStrictEqual(['1980', '1981', '1982', '1983'])
    expect(getByTestId('heading').textContent).toBe('1980 - 1991')
  })

  it('respects a default value if provided - `CalendarDateTime`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: calendarDateTimeRange } })
    const selectedYears = getSelectedYears(picker)
    expect(yearLabels(selectedYears)).toStrictEqual(['1980', '1981', '1982', '1983'])
    expect(getByTestId('heading').textContent).toBe('1980 - 1991')
  })

  it('respects a default value if provided - `ZonedDateTime`', async () => {
    const { picker, getByTestId } = await setup({ pickerProps: { modelValue: zonedDateTimeRange } })
    const selectedYears = getSelectedYears(picker)
    expect(yearLabels(selectedYears)).toStrictEqual(['1980', '1981', '1982', '1983'])
    expect(getByTestId('heading').textContent).toBe('1980 - 1991')
  })

  it('does not crash when modelValue is null', async () => {
    const { picker, rerender } = await setup({ pickerProps: { modelValue: null } })

    expect(getSelectedYears(picker)).toHaveLength(0)

    await rerender({
      pickerProps: {
        modelValue: calendarDateRange,
      },
    })

    expect(yearLabels(getSelectedYears(picker))).toStrictEqual(['1980', '1981', '1982', '1983'])
  })

  it('resets range on select when a range is already selected', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof YearRangePicker>>>['rerender']
    const { getYear, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDateRange },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    let startValue = picker.querySelector('[data-selection-start]')
    let endValue = picker.querySelector('[data-selection-end]')

    expect(startValue?.textContent).toBe('1980')
    expect(endValue?.textContent).toBe('1983')

    await user.click(page.elementLocator(getYear(1985)))

    expect(yearLabels(getSelectedYears(picker))).toStrictEqual(['1985'])

    startValue = picker.querySelector('[data-selection-start]')
    endValue = picker.querySelector('[data-selection-end]')

    expect(startValue).toBe(getYear(1985))
    expect(endValue).not.toBeInTheDocument()

    await user.click(page.elementLocator(getYear(1987)))
    expect(yearLabels(getSelectedYears(picker))).toStrictEqual(['1985', '1986', '1987'])
  })

  it('keeps controlled end when parent preserves it after start edit', async () => {
    const preservedEnd = new CalendarDate(1986, 1, 1)
    const controlledRange = {
      start: new CalendarDate(1980, 1, 1),
      end: preservedEnd,
    }

    let rerender!: Awaited<ReturnType<typeof render<typeof YearRangePicker>>>['rerender']
    const { getYear, picker, user, rerender: screenRerender } = await setup({
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

    await user.click(page.elementLocator(getYear(1983)))

    expect(getYear(1983)).toHaveAttribute('data-selection-start')
    expect(getYear(1986)).toHaveAttribute('data-selection-end')
    expect(getYear(1984)).toHaveAttribute('data-selected')
    expect(getYear(1985)).toHaveAttribute('data-selected')
    expect(getSelectedYears(picker)).toHaveLength(4)
  })

  it('allows same year selection', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof YearRangePicker>>>['rerender']
    const { getYear, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { placeholder: calendarDateRange.start },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    const year1980 = getYear(1980)
    await user.click(page.elementLocator(year1980))
    await user.click(page.elementLocator(year1980))

    expect(yearLabels(getSelectedYears(picker))).toStrictEqual(['1980'])
    expect(picker.querySelector('[data-selection-start]')).toBe(getYear(1980))
    expect(picker.querySelector('[data-selection-end]')).toBe(getYear(1980))
  })

  it('allows deselection', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof YearRangePicker>>>['rerender']
    const { getYear, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { placeholder: calendarDateRange.start },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    const year1980 = getYear(1980)
    await user.click(page.elementLocator(year1980))
    await user.click(page.elementLocator(year1980))

    expect(yearLabels(getSelectedYears(picker))).toStrictEqual(['1980'])

    await user.click(page.elementLocator(year1980))
    expect(getSelectedYears(picker)).toHaveLength(0)
  })

  it('resets range selection when pressing Escape', async () => {
    let rerender!: Awaited<ReturnType<typeof render<typeof YearRangePicker>>>['rerender']
    const { getYear, picker, user, rerender: screenRerender } = await setup({
      pickerProps: { modelValue: calendarDateRange },
      emits: { 'onUpdate:modelValue': data => rerender({ pickerProps: { modelValue: data } }) },
    })
    rerender = screenRerender

    let startValue = picker.querySelector('[data-selection-start]')
    let endValue = picker.querySelector('[data-selection-end]')

    expect(startValue?.textContent).toBe('1980')
    expect(endValue?.textContent).toBe('1983')

    await user.click(page.elementLocator(getYear(1985)))

    const selectedYears = getSelectedYears(picker)
    expect(selectedYears).toHaveLength(1)

    await user.keyboard(kbd.ESCAPE)

    startValue = picker.querySelector('[data-selection-start]')
    endValue = picker.querySelector('[data-selection-end]')

    expect(startValue?.textContent).toBe('1980')
    expect(endValue?.textContent).toBe('1983')
  })

  it('navigates pages forward using the next button', async () => {
    const { getByTestId, getButton, user } = await setup({ pickerProps: { modelValue: calendarDateRange } })

    const heading = getByTestId('heading')
    const nextBtn = getButton('Next page')

    expect(heading.textContent).toBe('1980 - 1991')
    await user.click(page.elementLocator(nextBtn))
    expect(heading.textContent).toBe('1992 - 2003')
  })

  it('navigates pages backwards using the prev button', async () => {
    const { getByTestId, getButton, user } = await setup({ pickerProps: { modelValue: calendarDateRange } })

    const heading = getByTestId('heading')
    const prevBtn = getButton('Previous page')

    expect(heading.textContent).toBe('1980 - 1991')
    await user.click(page.elementLocator(prevBtn))
    expect(heading.textContent).toBe('1968 - 1979')
  })

  it('handles fixedDate with start correctly', async () => {
    const { getByTestId, getYear, user } = await setup({
      pickerProps: {
        defaultValue: calendarDateRange,
        fixedDate: 'start',
      },
    })

    const heading = getByTestId('heading')
    expect(heading.textContent).toBe('1980 - 1991')

    await user.click(page.elementLocator(getYear(1985)))

    expect(getYear(1984)).toHaveAttribute('data-selected')
    expect(getYear(1980)).toHaveAttribute('data-selection-start')
    expect(getYear(1985)).toHaveAttribute('data-selection-end')
  })

  it('handles fixedDate with end correctly', async () => {
    const { getByTestId, getYear, user } = await setup({
      pickerProps: {
        defaultValue: calendarDateRange,
        fixedDate: 'end',
      },
    })

    const heading = getByTestId('heading')
    expect(heading.textContent).toBe('1980 - 1991')

    await user.click(page.elementLocator(getYear(1985)))

    expect(getYear(1984)).toHaveAttribute('data-selected')
    expect(getYear(1980)).toHaveAttribute('data-selection-start')
    expect(getYear(1985)).toHaveAttribute('data-selection-end')

    await user.click(page.elementLocator(getYear(1982)))
    expect(getYear(1982)).toHaveAttribute('data-selection-start')
    expect(getYear(1985)).toHaveAttribute('data-selection-end')
  })

  it('allows non-contiguous ranges', async () => {
    const { getYear, picker, user } = await setup({
      pickerProps: {
        placeholder: calendarDateRange.start,
        allowNonContiguousRanges: true,
        isYearUnavailable: (date: DateValue) => {
          return date.year === 1982
        },
      },
    })

    await user.click(page.elementLocator(getYear(1980)))
    await user.click(page.elementLocator(getYear(1984)))
    expect(yearLabels(getSelectedYears(picker))).toStrictEqual(['1980', '1981', '1982', '1983', '1984'])
  })
})

describe('year range picker - maximumYears', () => {
  it('limits the maximum number of years that can be selected', async () => {
    const { getYear, user } = await setup({
      pickerProps: {
        placeholder: new CalendarDate(1983, 3, 15),
        maximumYears: 3,
      },
    })

    const year1983 = getYear(1983)
    await user.click(page.elementLocator(year1983))
    expect(year1983).toHaveAttribute('data-selection-start')

    const year1986 = getYear(1986)
    // The range constraint marks this role-button aria-disabled before the
    // attempted interaction. Force skips Playwright's enabled wait while
    // preserving Chromium's real pointer sequence and the component guard.
    await user.click(page.elementLocator(year1986), { force: true })

    expect(year1986).toHaveAttribute('data-disabled')
    expect(year1986).not.toHaveAttribute('data-selected')

    const year1985 = getYear(1985)
    expect(year1985).not.toHaveAttribute('data-disabled')

    await user.click(page.elementLocator(year1985))
    expect(getYear(1983)).toHaveAttribute('data-selected')
    expect(getYear(1984)).toHaveAttribute('data-selected')
    expect(getYear(1985)).toHaveAttribute('data-selected')
  })

  it('highlights backwards within maximumYears without inverting', async () => {
    const { getYear, user } = await setup({
      pickerProps: {
        placeholder: new CalendarDate(1983, 3, 15),
        maximumYears: 3,
      },
    })

    const year1983 = getYear(1983)
    await user.click(page.elementLocator(year1983))
    expect(year1983).toHaveAttribute('data-selection-start')

    const year1981 = getYear(1981)
    await user.hover(page.elementLocator(year1981))

    expect(year1981).toHaveAttribute('data-highlighted-start')
    expect(getYear(1982)).toHaveAttribute('data-highlighted')
    expect(year1983).toHaveAttribute('data-highlighted-end')
    expect(getYear(1980)).not.toHaveAttribute('data-highlighted')
  })
})

describe('year range picker - keyboard navigation', () => {
  it('navigates with arrow keys within the grid', async () => {
    const { getYear, user } = await setup({
      pickerProps: { placeholder: calendarDateRange.start },
    })

    const year1980 = getYear(1980)
    year1980.focus()
    expect(document.activeElement).toBe(year1980)

    await user.keyboard(kbd.ARROW_RIGHT)
    expect(document.activeElement).toBe(getYear(1981))

    await user.keyboard(kbd.ARROW_DOWN)
    expect(document.activeElement).toBe(getYear(1985))

    await user.keyboard(kbd.ARROW_LEFT)
    expect(document.activeElement).toBe(getYear(1984))

    await user.keyboard(kbd.ARROW_UP)
    expect(document.activeElement).toBe(getYear(1980))
  })

  it('navigates to next/prev page with PageDown/PageUp', async () => {
    const { getByTestId, getYear, user } = await setup({
      pickerProps: { placeholder: calendarDateRange.start },
    })

    const year1980 = getYear(1980)
    year1980.focus()
    expect(document.activeElement).toBe(year1980)
    expect(getByTestId('heading').textContent).toBe('1980 - 1991')

    await user.keyboard(kbd.PAGE_DOWN)
    expect(getByTestId('heading').textContent).toBe('1992 - 2003')

    await user.keyboard(kbd.PAGE_UP)
    expect(getByTestId('heading').textContent).toBe('1980 - 1991')
  })

  it('skips disabled candidate year when navigating to next page', async () => {
    const { getByTestId, getYear, user } = await setup({
      pickerProps: {
        placeholder: calendarDateRange.start,
        isYearDisabled: (date: DateValue) => date.year === 1992,
      },
    })

    const year1980 = getYear(1980)
    year1980.focus()
    expect(document.activeElement).toBe(year1980)

    await user.keyboard(kbd.PAGE_DOWN)
    expect(getByTestId('heading').textContent).toBe('1992 - 2003')
    expect(getYear(1992)).toHaveAttribute('data-disabled')
    expect(document.activeElement).toBe(getYear(1993))
  })

  it('falls back to the nearest enabled year when paged candidate is missing', async () => {
    const { getByTestId, getYear, user } = await setup({
      pickerProps: {
        placeholder: calendarDateRange.start,
        nextPage: date => date.add({ years: 13 }),
      },
    })

    const year1980 = getYear(1980)
    year1980.focus()
    expect(document.activeElement).toBe(year1980)

    await user.keyboard(kbd.PAGE_DOWN)

    expect(getByTestId('heading').textContent).toBe('1993 - 2004')
    expect(document.activeElement).toBe(getYear(1993))
  })
})
