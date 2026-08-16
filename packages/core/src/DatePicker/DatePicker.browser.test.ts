import type { DateFields, DateValue, TimeFields } from '@internationalized/date'

import type { DatePickerRootProps } from './DatePickerRoot.vue'
import { CalendarDate, CalendarDateTime, getLocalTimeZone, today, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { ConfigProvider } from '@/ConfigProvider'
import { useTestKbd } from '@/shared'
import DatePicker from './story/_DatePicker.vue'

const calendarDate = new CalendarDate(1980, 1, 20)
const calendarDateTime = new CalendarDateTime(1980, 1, 20, 12, 30, 0, 0)
const zonedDateTime = toZoned(calendarDateTime, 'America/New_York')

const kbd = useTestKbd()

function getTimeSegments(getByTestId: (id: string) => HTMLElement) {
  return {
    hour: getByTestId('hour'),
    minute: getByTestId('minute'),
    second: getByTestId('second'),
    dayPeriod: getByTestId('dayPeriod'),
    timeZoneName: getByTestId('timeZoneName'),
  }
}

function dateLabel(date: CalendarDate, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeZone: getLocalTimeZone(),
  }).format(date.toDate(getLocalTimeZone()))
}

async function setup(props: { datePickerProps?: DatePickerRootProps, emits?: { 'onUpdate:modelValue'?: (data: DateValue | undefined) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(DatePicker, { props })
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement
  const getButton = (name: string) => returned.getByRole('button', { name, exact: true }).element() as HTMLButtonElement
  const month = getByTestId('month')
  const day = getByTestId('day')
  const year = getByTestId('year')
  const input = getByTestId('input')
  const label = getByTestId('label')
  const trigger = getButton('Open')

  return { ...returned, getByTestId, getButton, user, month, day, year, input, label, trigger }
}

function text(element: Element | null) {
  return element?.textContent?.trim()
}

it('should pass axe accessibility tests', async () => {
  const { container, getByTestId, trigger, user } = await setup()
  expect(await axe(container)).toHaveNoViolations()

  await user.click(trigger)
  expect(getByTestId('calendar')).toBeVisible()
  expect(await axe(document.body)).toHaveNoViolations()
})

describe('datePicker', async () => {
  it('populates segment with value - `CalendarDate`', async () => {
    const { month, day, year } = await setup({
      datePickerProps: { modelValue: calendarDate },
    })

    expect(month).toHaveTextContent(String(calendarDate.month))
    expect(day).toHaveTextContent(String(calendarDate.day))
    expect(year).toHaveTextContent(String(calendarDate.year))
  })

  it('populates segment with value - `CalendarDateTime`', async () => {
    const { month, day, year, getByTestId } = await setup({
      datePickerProps: { modelValue: calendarDateTime },
    })

    expect(month).toHaveTextContent(String(calendarDateTime.month))
    expect(day).toHaveTextContent(String(calendarDateTime.day))
    expect(year).toHaveTextContent(String(calendarDateTime.year))
    expect(getByTestId('hour')).toHaveTextContent(String(calendarDateTime.hour))
    expect(getByTestId('minute')).toHaveTextContent(String(calendarDateTime.minute))
  })

  it('populates segment with value - `ZonedDateTime`', async () => {
    const { month, day, year, getByTestId } = await setup({
      datePickerProps: { modelValue: zonedDateTime },
    })

    expect(getLocalTimeZone()).toBe('America/New_York')
    expect(month).toHaveTextContent(String(zonedDateTime.month))
    expect(day).toHaveTextContent(String(zonedDateTime.day))
    expect(year).toHaveTextContent(String(zonedDateTime.year))
    expect(getByTestId('hour')).toHaveTextContent(String(zonedDateTime.hour))
    expect(getByTestId('minute')).toHaveTextContent(String(zonedDateTime.minute))
    expect(getByTestId('dayPeriod')).toHaveTextContent('PM')
    expect(getByTestId('timeZoneName')).toHaveTextContent('EST')
  })

  it('focuses first segment on label click', async () => {
    const { user, input, label } = await setup()
    await user.click(label)
    expect(input.firstElementChild).toHaveFocus()
  })

  it('focuses segments on click', async () => {
    const { user, day, month, year, getByTestId } = await setup({
      datePickerProps: { modelValue: zonedDateTime },
    })

    const hour = getByTestId('hour')
    const minute = getByTestId('minute')
    const dayPeriod = getByTestId('dayPeriod')
    const timeZoneName = getByTestId('timeZoneName')
    const segments = [day, month, year, hour, minute, dayPeriod, timeZoneName]

    for (const segment of segments) {
      await user.click(segment)
      expect(segment).toHaveFocus()
    }
  })

  it('increments segment on arrow up', async () => {
    const { user, day, month, year, getByTestId } = await setup({
      datePickerProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })

    const hour = getByTestId('hour')
    const minute = getByTestId('minute')
    const second = getByTestId('second')

    function cycle(segment: keyof TimeFields | keyof DateFields) {
      const value = String(zonedDateTime.cycle(segment, 1)[segment])
      return segment === 'minute' || segment === 'second' ? value.padStart(2, '0') : value
    }

    await user.click(day)
    await user.keyboard(kbd.ARROW_UP)
    expect(text(day)).toBe(cycle('day'))
    await user.click(month)
    await user.keyboard(kbd.ARROW_UP)
    expect(text(month)).toBe(cycle('month'))
    await user.click(year)
    await user.keyboard(kbd.ARROW_UP)
    expect(text(year)).toBe(cycle('year'))
    await user.click(hour)
    await user.keyboard(kbd.ARROW_UP)
    expect(text(hour)).toBe('1')
    await user.click(minute)
    await user.keyboard(kbd.ARROW_UP)
    expect(text(minute)).toBe(cycle('minute'))
    await user.click(second)
    await user.keyboard(kbd.ARROW_UP)
    expect(text(second)).toBe(cycle('second'))
  })

  it('decrements segment on arrow down', async () => {
    const { user, day, month, year, getByTestId } = await setup({
      datePickerProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })

    const hour = getByTestId('hour')
    const minute = getByTestId('minute')
    const second = getByTestId('second')

    function cycle(segment: keyof TimeFields | keyof DateFields) {
      return String(zonedDateTime.cycle(segment, -1)[segment])
    }

    await user.click(day)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(day).toHaveTextContent(cycle('day'))
    await user.click(month)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(month).toHaveTextContent(cycle('month'))
    await user.click(year)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(year).toHaveTextContent(cycle('year'))
    await user.click(hour)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(hour).toHaveTextContent(cycle('hour'))
    await user.click(minute)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(minute).toHaveTextContent(cycle('minute'))
    await user.click(second)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(second).toHaveTextContent(cycle('second'))
  })

  it('navigates segments using the arrow keys', async () => {
    const { getByTestId, user, day, month, year, trigger } = await setup({
      datePickerProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })
    const { hour, minute, second, dayPeriod, timeZoneName } = getTimeSegments(getByTestId)

    const segments = [month, day, year, hour, minute, second, dayPeriod, timeZoneName, trigger]

    await user.click(month)

    for (const seg of segments) {
      expect(seg).toHaveFocus()
      await user.keyboard(kbd.ARROW_RIGHT)
    }
    expect(trigger).toHaveFocus()

    for (const seg of segments.reverse()) {
      expect(seg).toHaveFocus()
      await user.keyboard(kbd.ARROW_LEFT)
    }
    expect(month).toHaveFocus()
  })

  it('navigates the segments using tab', async () => {
    const { getByTestId, user, day, month, year, trigger } = await setup({
      datePickerProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })
    const { hour, minute, second, dayPeriod, timeZoneName } = getTimeSegments(getByTestId)

    const segments = [month, day, year, hour, minute, second, dayPeriod, timeZoneName]

    await user.click(month)

    for (const seg of segments) {
      expect(seg).toHaveFocus()
      await user.keyboard(kbd.TAB)
    }
    expect(trigger).toHaveFocus()

    for (const seg of segments.reverse()) {
      await user.keyboard(`${kbd.SHIFT_TAB}{/Shift}`)
      expect(seg).toHaveFocus()
    }
  })

  it('prevents interaction and picker to be opened when `disabled` is `true`', async () => {
    const { trigger, day, month, year, user } = await setup({
      datePickerProps: {
        disabled: true,
      },
    })
    expect(trigger).toBeDisabled()

    await user.click(trigger, { force: true })
    expect(document.querySelector('[data-testid="popover-content"]')).toBe(null)

    const segments = [day, month, year]
    const initialValues = segments.map(text)
    for (const segment of segments) {
      expect(segment).not.toHaveAttribute('tabindex')
      let mouseDown: MouseEvent | undefined
      segment.addEventListener('mousedown', event => mouseDown = event, { once: true })
      await user.click(segment, { force: true })
      expect(mouseDown?.defaultPrevented).toBe(true)
    }
    expect(segments.map(text)).toStrictEqual(initialValues)
  })

  it('should select and deselect a date', async () => {
    const emittedValues: (DateValue | undefined)[] = []
    let rerender: Awaited<ReturnType<typeof setup>>['rerender']
    let pendingRerender: Promise<void> | undefined
    const handleUpdateModelValue = (value: DateValue | undefined) => {
      emittedValues.push(value)
      pendingRerender = rerender({
        datePickerProps: { modelValue: value },
        emits: { 'onUpdate:modelValue': handleUpdateModelValue },
      })
    }
    const view = await setup({
      emits: {
        'onUpdate:modelValue': handleUpdateModelValue,
      },
    })
    rerender = view.rerender

    await view.user.click(view.trigger)
    const placeholder = today(getLocalTimeZone())
    const firstOfMonth = new CalendarDate(placeholder.year, placeholder.month, 1)
    const targetDayName = dateLabel(firstOfMonth)

    await view.user.click(view.getButton(targetDayName))
    await pendingRerender
    const targetDay = view.getButton(targetDayName)
    expect(targetDay).toHaveAttribute('data-selected')
    expect(emittedValues.at(-1)?.compare(firstOfMonth)).toBe(0)
    await view.user.click(targetDay)
    await pendingRerender
    expect(view.getButton(targetDayName)).not.toHaveAttribute('data-selected')
    expect(emittedValues.at(-1)).toBeUndefined()
  })

  it('resets stale placeholder time when selecting a date after the model value is cleared', async () => {
    const emittedValues: (DateValue | undefined)[] = []
    const { user, trigger, getButton, rerender } = await setup({
      datePickerProps: {
        modelValue: calendarDateTime,
        granularity: 'minute',
      },
      emits: {
        'onUpdate:modelValue': value => emittedValues.push(value),
      },
    })

    await rerender({
      datePickerProps: {
        modelValue: undefined,
        granularity: 'minute',
      },
      emits: {
        'onUpdate:modelValue': value => emittedValues.push(value),
      },
    })

    await user.click(trigger)
    await user.click(getButton('Tuesday, January 1, 1980'))

    const selectedValue = emittedValues.at(-1)
    expect(selectedValue).toBeInstanceOf(CalendarDateTime)
    expect(selectedValue?.compare(new CalendarDateTime(1980, 1, 1, 0, 0, 0, 0))).toBe(0)
    expect((selectedValue as CalendarDateTime).hour).toBe(0)
    expect((selectedValue as CalendarDateTime).minute).toBe(0)
    expect((selectedValue as CalendarDateTime).second).toBe(0)
    expect((selectedValue as CalendarDateTime).millisecond).toBe(0)
  })

  it('resets stale ZonedDateTime placeholder time when selecting a date after the model value is cleared', async () => {
    const emittedValues: (DateValue | undefined)[] = []
    const zonedValue = toZoned(new CalendarDateTime(1980, 1, 20, 12, 30, 45, 123), 'America/New_York')
    const { user, trigger, getButton, rerender } = await setup({
      datePickerProps: {
        modelValue: zonedValue,
        granularity: 'second',
      },
      emits: {
        'onUpdate:modelValue': value => emittedValues.push(value),
      },
    })

    await rerender({
      datePickerProps: {
        modelValue: undefined,
        granularity: 'second',
      },
      emits: {
        'onUpdate:modelValue': value => emittedValues.push(value),
      },
    })

    await user.click(trigger)
    await user.click(getButton('Tuesday, January 1, 1980'))

    const selectedValue = emittedValues.at(-1)
    const expectedValue = toZoned(new CalendarDateTime(1980, 1, 1, 0, 0, 0, 0), 'America/New_York')
    expect(selectedValue?.compare(expectedValue)).toBe(0)
    expect(selectedValue).toHaveProperty('timeZone', 'America/New_York')
    expect(selectedValue?.hour).toBe(0)
    expect(selectedValue?.minute).toBe(0)
    expect(selectedValue?.second).toBe(0)
    expect(selectedValue?.millisecond).toBe(0)
  })

  it('preserves typed time when typing a date after the model value is cleared', async () => {
    const emittedValues: (DateValue | undefined)[] = []
    let rerender: Awaited<ReturnType<typeof setup>>['rerender']
    const handleUpdateModelValue = (value: DateValue | undefined) => {
      emittedValues.push(value)
      return rerender({
        datePickerProps: {
          modelValue: value,
          granularity: 'minute',
        },
        emits: {
          'onUpdate:modelValue': handleUpdateModelValue,
        },
      })
    }

    const view = await setup({
      datePickerProps: {
        modelValue: calendarDateTime,
        granularity: 'minute',
      },
      emits: {
        'onUpdate:modelValue': handleUpdateModelValue,
      },
    })
    rerender = view.rerender

    await rerender({
      datePickerProps: {
        modelValue: undefined,
        granularity: 'minute',
      },
      emits: {
        'onUpdate:modelValue': handleUpdateModelValue,
      },
    })

    await view.user.click(view.month)
    await view.user.keyboard('2')
    expect(view.day).toHaveFocus()
    await view.user.click(view.day)
    await view.user.keyboard('3')
    await view.user.click(view.year)
    await view.user.keyboard('2020')
    await view.user.click(view.getByTestId('hour'))
    await view.user.keyboard('9')
    await view.user.click(view.getByTestId('minute'))
    await view.user.keyboard('45')

    expect(view.month).toHaveTextContent('2')
    expect(view.day).toHaveTextContent('3')
    expect(view.year).toHaveTextContent('2020')
    expect(view.getByTestId('hour')).toHaveTextContent('9')
    expect(view.getByTestId('minute')).toHaveTextContent('45')
  })

  it('should close the picker on select when `closeOnSelect` is true', async () => {
    const { user, trigger, getByTestId, getButton } = await setup({
      datePickerProps: {
        defaultValue: calendarDate,
        closeOnSelect: true,
      },
    })

    await user.click(trigger)

    const popoverContent = getByTestId('popover-content')
    expect(popoverContent).toBeVisible()

    const day = getButton('Tuesday, January 1, 1980')
    await user.click(day)
    expect(popoverContent).not.toBeVisible()
  })

  it('should not close the picker on select when `closeOnSelect` is true', async () => {
    const emittedValues: (DateValue | undefined)[] = []
    const { user, trigger, getByTestId, getButton } = await setup({
      datePickerProps: {
        defaultValue: calendarDate,
        closeOnSelect: false,
      },
      emits: {
        'onUpdate:modelValue': value => emittedValues.push(value),
      },
    })

    await user.click(trigger)

    const popoverContent = getByTestId('popover-content')
    expect(popoverContent).toBeVisible()

    const day = getButton('Tuesday, January 1, 1980')
    await user.click(day)
    expect(emittedValues.at(-1)?.compare(new CalendarDate(1980, 1, 1))).toBe(0)
    expect(popoverContent).toBeVisible()
  })

  describe('locale integration with ConfigProvider', () => {
    it('uses locale from ConfigProvider when no locale prop is provided', async () => {
      const user = userEvent.setup()
      const screen = await render({
        components: { ConfigProvider, DatePicker },
        template: `
          <ConfigProvider locale="de">
            <DatePicker :datePickerProps="{ modelValue: new CalendarDate(2024, 1, 15) }" />
          </ConfigProvider>
        `,
        setup() {
          return { CalendarDate }
        },
      })

      const trigger = screen.getByRole('button', { name: 'Open', exact: true }).element() as HTMLButtonElement
      await user.click(trigger)

      const heading = screen.getByTestId('heading').element()
      expect(text(heading)).toBe('Januar 2024')
    })

    it('locale prop overrides ConfigProvider locale', async () => {
      const user = userEvent.setup()
      const screen = await render({
        components: { ConfigProvider, DatePicker },
        template: `
          <ConfigProvider locale="de">
            <DatePicker :datePickerProps="{ modelValue: new CalendarDate(2024, 1, 15), locale: 'en-US' }" />
          </ConfigProvider>
        `,
        setup() {
          return { CalendarDate }
        },
      })

      const trigger = screen.getByRole('button', { name: 'Open', exact: true }).element() as HTMLButtonElement
      await user.click(trigger)

      const heading = screen.getByTestId('heading').element()
      expect(text(heading)).toBe('January 2024')
    })

    it('uses default locale when no ConfigProvider and no locale prop', async () => {
      const { user, trigger, getByTestId } = await setup({
        datePickerProps: { modelValue: calendarDate },
      })

      await user.click(trigger)

      const heading = getByTestId('heading')
      expect(text(heading)).toBe('January 1980')
      expect(text(heading)).toContain('1980')
    })
  })
})
