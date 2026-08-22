import type { DateValue } from '@internationalized/date'

import type { DateRangePickerRootProps } from './DateRangePickerRoot.vue'
import { CalendarDate, CalendarDateTime, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { ConfigProvider } from '@/ConfigProvider'
import { useTestKbd } from '@/shared'
import DateRangePicker from './story/_DateRangePicker.vue'

const calendarDate = {
  start: new CalendarDate(2022, 1, 1),
  end: new CalendarDate(2022, 3, 1),
}

const calendarDateTime = {
  start: new CalendarDateTime(2022, 1, 1, 12, 30),
  end: new CalendarDateTime(2022, 3, 1, 12, 30),
}
const zonedDateTime = {
  start: toZoned(calendarDateTime.start, 'America/New_York'),
  end: toZoned(calendarDateTime.end, 'America/New_York'),
}

const kbd = useTestKbd()

async function setup(props: { dateFieldProps?: DateRangePickerRootProps, emits?: { 'onUpdate:modelValue'?: (data: DateValue) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(DateRangePicker, { props })
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement
  const getButton = (name: string) => returned.getByRole('button', { name, exact: true }).element() as HTMLElement
  const start = {
    month: getByTestId('start-month'),
    day: getByTestId('start-day'),
    year: getByTestId('start-year'),
  }

  const end = {
    month: getByTestId('end-month'),
    day: getByTestId('end-day'),
    year: getByTestId('end-year'),
  }

  const input = getByTestId('input')
  const label = getByTestId('label')
  const trigger = getButton('Open')

  return { ...returned, getByTestId, getButton, user, start, end, input, label, trigger }
}

function text(element: Element | null) {
  return element?.textContent?.trim()
}

it('should pass axe accessibility tests', async () => {
  const { container, getByTestId, trigger, user } = await setup()
  expect(await axe(container)).toHaveNoViolations()
  await user.click(page.elementLocator(trigger))
  expect(getByTestId('calendar')).toBeVisible()
  expect(await axe(document.body)).toHaveNoViolations()
})

describe('dateRangePicker', async () => {
  it('populates segment with value - `CalendarDate`', async () => {
    const { start, end } = await setup({
      dateFieldProps: { modelValue: calendarDate },
    })

    expect(text(start.month)).toBe(String(calendarDate.start.month))
    expect(text(start.day)).toBe(String(calendarDate.start.day))
    expect(text(start.year)).toBe(String(calendarDate.start.year))

    expect(text(end.month)).toBe(String(calendarDate.end.month))
    expect(text(end.day)).toBe(String(calendarDate.end.day))
    expect(text(end.year)).toBe(String(calendarDate.end.year))
  })

  it('populates segment with value - `CalendarDateTime`', async () => {
    const { start, end, getByTestId } = await setup({
      dateFieldProps: {
        modelValue: calendarDateTime,
        granularity: 'second',
      },
    })

    expect(text(start.month)).toBe(String(calendarDateTime.start.month))
    expect(text(start.day)).toBe(String(calendarDateTime.start.day))
    expect(text(start.year)).toBe(String(calendarDateTime.start.year))
    expect(text(getByTestId('start-hour'))).toBe(String(calendarDateTime.start.hour))
    expect(text(getByTestId('start-minute'))).toBe(String(calendarDateTime.start.minute))
    expect(text(getByTestId('start-second'))).toBe('00')

    expect(text(end.month)).toBe(String(calendarDateTime.end.month))
    expect(text(end.day)).toBe(String(calendarDateTime.end.day))
    expect(text(end.year)).toBe(String(calendarDateTime.end.year))
    expect(text(getByTestId('end-hour'))).toBe(String(calendarDateTime.end.hour))
    expect(text(getByTestId('end-minute'))).toBe(String(calendarDateTime.end.minute))
    expect(text(getByTestId('end-second'))).toBe('00')
  })

  it('populates segment with value - `ZonedDateTime`', async () => {
    const { start, end, getByTestId } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })

    expect(text(start.month)).toBe(String(calendarDateTime.start.month))
    expect(text(start.day)).toBe(String(calendarDateTime.start.day))
    expect(text(start.year)).toBe(String(calendarDateTime.start.year))
    expect(text(getByTestId('start-hour'))).toBe(String(calendarDateTime.start.hour))
    expect(text(getByTestId('start-minute'))).toBe(String(calendarDateTime.start.minute))
    expect(text(getByTestId('start-second'))).toBe('00')

    expect(text(end.month)).toBe(String(calendarDateTime.end.month))
    expect(text(end.day)).toBe(String(calendarDateTime.end.day))
    expect(text(end.year)).toBe(String(calendarDateTime.end.year))
    expect(text(getByTestId('end-hour'))).toBe(String(calendarDateTime.end.hour))
    expect(text(getByTestId('end-minute'))).toBe(String(calendarDateTime.end.minute))
    expect(text(getByTestId('end-second'))).toBe('00')
  })

  it('focuses first segment on label click', async () => {
    const { user, input, label } = await setup()
    await user.click(page.elementLocator(label))
    expect(input.firstElementChild).toHaveFocus()
  })

  it('navigates between the fields', async () => {
    const { getByTestId, user } = await setup({
      dateFieldProps: { modelValue: calendarDate },
    })

    const fields = ['start', 'end'] as const
    const segments = ['month', 'day', 'year'] as const

    await user.click(page.elementLocator(getByTestId('start-month')))

    for (const field of fields) {
      for (const segment of segments) {
        if (field === 'start' && segment === 'month')
          continue
        const seg = getByTestId(`${field}-${segment}`)
        await user.keyboard(kbd.ARROW_RIGHT)
        expect(seg).toHaveFocus()
      }
    }

    await user.click(page.elementLocator(getByTestId('start-month')))

    for (const field of fields) {
      for (const segment of segments) {
        if (field === 'start' && segment === 'month')
          continue
        const seg = getByTestId(`${field}-${segment}`)
        await user.keyboard(kbd.TAB)
        expect(seg).toHaveFocus()
      }
    }
  })

  it('navigates between the fields - right to left', async () => {
    const { getByTestId, user } = await setup({
      dateFieldProps: { modelValue: calendarDate },
    })

    const fields = ['end', 'start'] as const
    const segments = ['year', 'day', 'month'] as const

    await user.click(page.elementLocator(getByTestId('end-year')))

    for (const field of fields) {
      for (const segment of segments) {
        if (field === 'end' && segment === 'year')
          continue
        const seg = getByTestId(`${field}-${segment}`)
        await user.keyboard(kbd.ARROW_LEFT)
        expect(seg).toHaveFocus()
      }
    }

    await user.click(page.elementLocator(getByTestId('end-year')))

    for (const field of fields) {
      for (const segment of segments) {
        if (field === 'end' && segment === 'year')
          continue
        const seg = getByTestId(`${field}-${segment}`)
        await user.keyboard(`${kbd.SHIFT_TAB}{/Shift}`)
        expect(seg).toHaveFocus()
      }
    }
  })

  it('prevents interaction and picker to be opened when `disabled` is `true`', async () => {
    const { getByTestId, trigger, user } = await setup({
      dateFieldProps: {
        disabled: true,
      },
    })
    expect(trigger).toBeDisabled()

    await user.click(page.elementLocator(trigger), { force: true })
    expect(document.querySelector('[data-testid="popover-content"]')).toBe(null)

    const fields = ['end', 'start'] as const
    const segments = ['year', 'day', 'month'] as const

    for (const field of fields) {
      for (const segment of segments) {
        const seg = getByTestId(`${field}-${segment}`)
        expect(seg).not.toHaveAttribute('tabindex')
      }
    }
  })

  it('should close the picker on select when `closeOnSelect` is true', async () => {
    const { user, trigger, getByTestId, getButton } = await setup({
      dateFieldProps: {
        defaultValue: calendarDate,
        closeOnSelect: true,
      },
    })

    await user.click(page.elementLocator(trigger))

    const popoverContent = getByTestId('popover-content')
    expect(popoverContent).toBeVisible()

    const startDay = getButton('Saturday, January 1, 2022')
    const endDay = getButton('Monday, January 10, 2022')
    await user.click(page.elementLocator(startDay))
    await user.click(page.elementLocator(endDay))
    expect(popoverContent).not.toBeVisible()
  })

  it('should not close the picker on select when `closeOnSelect` is true', async () => {
    const { user, trigger, getByTestId, getButton } = await setup({
      dateFieldProps: {
        defaultValue: calendarDate,
        closeOnSelect: false,
      },
    })

    await user.click(page.elementLocator(trigger))

    const popoverContent = getByTestId('popover-content')
    expect(popoverContent).toBeVisible()

    const startDay = getButton('Saturday, January 1, 2022')
    const endDay = getButton('Monday, January 10, 2022')
    await user.click(page.elementLocator(startDay))
    await user.click(page.elementLocator(endDay))
    expect(startDay).toHaveAttribute('data-selection-start')
    expect(endDay).toHaveAttribute('data-selection-end')
    expect(popoverContent).toBeVisible()
  })

  describe('locale integration with ConfigProvider', () => {
    it('uses locale from ConfigProvider when no locale prop is provided', async () => {
      const user = userEvent.setup()
      const screen = await render({
        components: { ConfigProvider, DateRangePicker },
        template: `
          <ConfigProvider locale="de">
            <DateRangePicker :dateFieldProps="{
              modelValue: {
                start: new CalendarDate(2024, 1, 15),
                end: new CalendarDate(2024, 1, 20)
              }
            }" />
          </ConfigProvider>
        `,
        setup() {
          return { CalendarDate }
        },
      })
      const getByTestId = (id: string) => screen.getByTestId(id).element() as HTMLElement

      const trigger = screen.getByRole('button', { name: 'Open', exact: true }).element() as HTMLElement
      await user.click(page.elementLocator(trigger))

      const heading = getByTestId('heading')
      expect(text(heading)).toBe('Januar 2024')
    })

    it('locale prop overrides ConfigProvider locale', async () => {
      const user = userEvent.setup()
      const screen = await render({
        components: { ConfigProvider, DateRangePicker },
        template: `
          <ConfigProvider locale="de">
            <DateRangePicker :dateFieldProps="{
              modelValue: {
                start: new CalendarDate(2024, 1, 15),
                end: new CalendarDate(2024, 1, 20)
              },
              locale: 'en-US'
            }" />
          </ConfigProvider>
        `,
        setup() {
          return { CalendarDate }
        },
      })
      const getByTestId = (id: string) => screen.getByTestId(id).element() as HTMLElement

      const trigger = screen.getByRole('button', { name: 'Open', exact: true }).element() as HTMLElement
      await user.click(page.elementLocator(trigger))

      const heading = getByTestId('heading')
      expect(text(heading)).toBe('January 2024')
    })

    it('uses default locale when no ConfigProvider and no locale prop', async () => {
      const { user, trigger, getByTestId } = await setup({
        dateFieldProps: { modelValue: calendarDate },
      })

      await user.click(page.elementLocator(trigger))

      const heading = getByTestId('heading')
      expect(text(heading)).toBe('January 2022')
      expect(text(heading)).toContain('2022')
    })
  })
})
