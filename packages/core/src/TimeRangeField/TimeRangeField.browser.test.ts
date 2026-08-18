import type { TimeRangeFieldRootProps } from './TimeRangeFieldRoot.vue'
import type { TimeValue } from '@/shared/date'
import { CalendarDateTime, Time, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { useTestKbd } from '@/shared'
import TimeField from './story/_TimeRangeField.vue'

const time = { start: new Time(9, 15, 29), end: new Time(17, 45, 0) }
const calendarDateTime = {
  start: new CalendarDateTime(2022, 1, 1, 9, 15),
  end: new CalendarDateTime(2022, 1, 1, 17, 45),
}
const zonedDateTime = {
  start: toZoned(calendarDateTime.start, 'America/New_York'),
  end: toZoned(calendarDateTime.end, 'America/New_York'),
}

const kbd = useTestKbd()

async function setup(props: { timeRangeFieldProps?: TimeRangeFieldRootProps, emits?: { 'onUpdate:modelValue'?: (data: TimeValue) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(TimeField, { props })
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement
  const value = getByTestId('value')

  const start = {
    hour: getByTestId('start-hour'),
    minute: getByTestId('start-minute'),
  }

  const end = {
    hour: getByTestId('end-hour'),
    minute: getByTestId('end-minute'),
  }

  const input = getByTestId('input')
  const label = getByTestId('label')

  return { ...returned, getByTestId, user, input, start, end, label, value }
}

it('should pass axe accessibility tests', async () => {
  const { container } = await setup()
  expect(await axe(container)).toHaveNoViolations()
})

describe('timeField', () => {
  it('advances focus through segments in DOM order when typing in RTL', async () => {
    const { user, start, end } = await setup({
      timeRangeFieldProps: {
        dir: 'rtl',
        locale: 'en-GB',
      },
    })

    await user.click(start.hour)
    expect(start.hour).toHaveFocus()
    await user.keyboard('4')
    expect(start.minute).toHaveFocus()
    await user.keyboard('6')
    expect(end.hour).toHaveFocus()
  })

  it('populates segment with value - `Time`', async () => {
    const { start, end } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    expect(start.hour).toHaveTextContent(String(time.start.hour).padStart(2, '0'))
    expect(end.hour).toHaveTextContent(String(time.end.hour).padStart(2, '0'))
  })

  it('populates segment with value - `CalendarDateTime`', async () => {
    const { start, end } = await setup({
      timeRangeFieldProps: { modelValue: calendarDateTime, locale: 'en-GB' },
    })

    expect(start.hour).toHaveTextContent(String(calendarDateTime.start.hour).padStart(2, '0'))
    expect(start.minute).toHaveTextContent(String(calendarDateTime.start.minute))
    expect(end.hour).toHaveTextContent(String(calendarDateTime.end.hour).padStart(2, '0'))
    expect(end.minute).toHaveTextContent(String(calendarDateTime.end.minute))
  })

  it('populates segment with value - `ZonedDateTime`', async () => {
    const { start, end, getByTestId } = await setup({
      timeRangeFieldProps: { modelValue: zonedDateTime, locale: 'en-US', hourCycle: 12 },
    })

    expect(start.hour).toHaveTextContent(String(zonedDateTime.start.hour))
    expect(start.minute).toHaveTextContent(String(zonedDateTime.start.minute))
    expect(end.hour).toHaveTextContent(String(zonedDateTime.end.hour - 12))
    expect(end.minute).toHaveTextContent(String(zonedDateTime.end.minute))
    expect(getByTestId('start-dayPeriod')).toHaveTextContent('AM')
    expect(getByTestId('start-timeZoneName')).toHaveTextContent('EST')
    expect(getByTestId('end-dayPeriod')).toHaveTextContent('PM')
    expect(getByTestId('end-timeZoneName')).toHaveTextContent('EST')
  })

  it('navigates between the fields', async () => {
    const { getByTestId, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    const fields = ['start', 'end'] as const
    const segments = ['hour', 'minute'] as const

    await user.click(getByTestId('start-hour'))

    for (const field of fields) {
      for (const segment of segments) {
        if (field === 'start' && segment === 'hour')
          continue
        const seg = getByTestId(`${field}-${segment}`)
        await user.keyboard(kbd.ARROW_RIGHT)
        expect(seg).toHaveFocus()
      }
    }

    await user.click(getByTestId('start-hour'))

    for (const field of fields) {
      for (const segment of segments) {
        if (field === 'start' && segment === 'hour')
          continue
        const seg = getByTestId(`${field}-${segment}`)
        await user.keyboard(kbd.TAB)
        expect(seg).toHaveFocus()
      }
    }
  })

  it('navigates between the fields - right to left', async () => {
    const { getByTestId, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    const fields = ['end', 'start'] as const
    const segments = ['minute', 'hour'] as const

    await user.click(getByTestId('end-minute'))

    for (const field of fields) {
      for (const segment of segments) {
        if (field === 'end' && segment === 'minute')
          continue
        const seg = getByTestId(`${field}-${segment}`)
        await user.keyboard(kbd.ARROW_LEFT)
        expect(seg).toHaveFocus()
      }
    }

    await user.click(getByTestId('end-minute'))

    for (const field of fields) {
      for (const segment of segments) {
        if (field === 'end' && segment === 'minute')
          continue
        const seg = getByTestId(`${field}-${segment}`)
        await user.keyboard(`${kbd.SHIFT_TAB}{/Shift}`)
        expect(seg).toHaveFocus()
      }
    }
  })

  it('binds to the value', async () => {
    const { start, end, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })
    expect(start.hour).toHaveTextContent(String(time.start.hour).padStart(2, '0'))
    expect(end.hour).toHaveTextContent(String(time.end.hour))

    await user.click(start.minute)
    await user.keyboard('2')
    expect(start.minute).toHaveTextContent('02')
    expect(end.minute).toHaveTextContent(String(time.end.minute))
  })

  it('modifying end value does not affect start value', async () => {
    const { start, end, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    await user.click(end.hour)
    await user.keyboard(kbd.ARROW_UP)
    expect(start.hour).toHaveTextContent(String(time.start.hour).padStart(2, '0'))
    expect(start.minute).toHaveTextContent(String(time.start.minute))
  })

  it('increments start hour on arrow up', async () => {
    const { start, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    await user.click(start.hour)
    await user.keyboard(kbd.ARROW_UP)
    expect(start.hour).toHaveTextContent(String(time.start.hour + 1).padStart(2, '0'))
  })

  it('decrements end minute on arrow down', async () => {
    const { end, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    await user.click(end.minute)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(end.minute).toHaveTextContent(String(time.end.minute - 1))
  })

  it('types a digit into start segment', async () => {
    const { start, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    await user.click(start.hour)
    await user.keyboard('14')
    expect(start.hour).toHaveTextContent('14')
  })

  it('types a digit into end segment', async () => {
    const { end, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    await user.click(end.minute)
    await user.keyboard('30')
    expect(end.minute).toHaveTextContent('30')
  })

  it('prevents interaction when disabled', async () => {
    const { start, end, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB', disabled: true },
    })

    const segments = [start.hour, start.minute, end.hour, end.minute]
    for (const seg of segments) {
      await user.click(seg, { force: true })
      expect(seg).not.toHaveFocus()
    }
  })

  it('prevents modification when readonly', async () => {
    const { start, end, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB', readonly: true },
    })

    await user.click(start.hour)
    expect(start.hour).toHaveFocus()
    await user.keyboard(kbd.ARROW_UP)
    expect(start.hour).toHaveTextContent(String(time.start.hour).padStart(2, '0'))

    await user.click(end.hour)
    expect(end.hour).toHaveFocus()
    await user.keyboard(kbd.ARROW_UP)
    expect(end.hour).toHaveTextContent(String(time.end.hour).padStart(2, '0'))
  })

  it('displays data-invalid when start is after end', async () => {
    const invalidTime = {
      start: new Time(17, 0),
      end: new Time(9, 0),
    }
    const { input } = await setup({
      timeRangeFieldProps: { modelValue: invalidTime, locale: 'en-GB' },
    })

    expect(input).toHaveAttribute('data-invalid', '')
  })

  it('does not display data-invalid for valid range', async () => {
    const { input } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    expect(input).not.toHaveAttribute('data-invalid')
  })

  it('displays data-invalid when value is outside min/max', async () => {
    const { input } = await setup({
      timeRangeFieldProps: {
        modelValue: time,
        locale: 'en-GB',
        minValue: new Time(10, 0),
      },
    })

    expect(input).toHaveAttribute('data-invalid', '')
  })

  it('focuses first segment on label click', async () => {
    const { user, label, start } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    await user.click(label)
    expect(start.hour).toHaveFocus()
  })

  it('renders with second granularity', async () => {
    const { getByTestId } = await setup({
      timeRangeFieldProps: {
        modelValue: time,
        locale: 'en-GB',
        granularity: 'second',
      },
    })

    expect(getByTestId('start-second')).toHaveTextContent(String(time.start.second))
    expect(getByTestId('end-second')).toHaveTextContent(String(time.end.second).padStart(2, '0'))
  })

  it('renders with hour granularity', async () => {
    const returned = await render(TimeField, {
      props: {
        timeRangeFieldProps: {
          modelValue: time,
          locale: 'en-GB',
          granularity: 'hour',
        },
      },
    })

    await expect.element(returned.getByTestId('start-hour')).toBeVisible()
    await expect.element(returned.getByTestId('end-hour')).toBeVisible()
    expect(returned.container.querySelector('[data-testid="start-minute"]')).toBeNull()
    expect(returned.container.querySelector('[data-testid="end-minute"]')).toBeNull()
  })

  it('navigates from start to end with keyboard typing', async () => {
    const { start, end, user } = await setup({
      timeRangeFieldProps: { modelValue: time, locale: 'en-GB' },
    })

    await user.click(start.hour)
    await user.keyboard('09')
    expect(start.minute).toHaveFocus()
    await user.keyboard('15')
    expect(end.hour).toHaveFocus()
  })
})
