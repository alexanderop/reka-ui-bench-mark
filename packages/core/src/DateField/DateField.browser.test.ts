import type { DateFields, DateValue, TimeFields } from '@internationalized/date'

import type { DateFieldRootProps } from './DateFieldRoot.vue'
import { CalendarDate, CalendarDateTime, now, parseAbsoluteToLocal, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import { useTestKbd } from '@/shared'
import DateField from './story/_DateField.vue'

const calendarDate = new CalendarDate(1980, 1, 20)
const calendarDateTime = new CalendarDateTime(1980, 1, 20, 12, 30, 0, 0)
const zonedDateTime = toZoned(calendarDateTime, 'America/New_York')

const kbd = useTestKbd()

function getTimeSegments(getByTestId: (...args: any[]) => HTMLElement) {
  return {
    hour: getByTestId('hour'),
    minute: getByTestId('minute'),
    second: getByTestId('second'),
    dayPeriod: getByTestId('dayPeriod'),
    timeZoneName: getByTestId('timeZoneName'),
  }
}

function isDaylightSavingsTime(): boolean {
  const now = new Date()
  const january = new Date(now.getFullYear(), 0, 1)
  const july = new Date(now.getFullYear(), 6, 1)
  const timezoneOffset = now.getTimezoneOffset()
  const isDaylightSavingsTime = timezoneOffset < Math.max(january.getTimezoneOffset(), july.getTimezoneOffset())
  return isDaylightSavingsTime
}

function thisTimeZone(date: string): string {
  const timezone = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date(date)).find(p => p.type === 'timeZoneName')?.value ?? ''
  return timezone
}

function dispatchKeydown(element: HTMLElement, init: KeyboardEventInit & { keyCode?: number }) {
  const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
  if (init.keyCode !== undefined)
    Object.defineProperty(event, 'keyCode', { value: init.keyCode })
  element.dispatchEvent(event)
}

function text(element: Element) {
  return element.textContent?.trim()
}

async function setup(props: { dateFieldProps?: DateFieldRootProps, emits?: { 'onUpdate:modelValue'?: (data: DateValue) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(DateField, { props })
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement
  const queryByTestId = (id: string) => returned.container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const value = getByTestId('value')
  const month = getByTestId('month')
  const day = getByTestId('day')
  const year = getByTestId('year')
  const input = getByTestId('input')
  const label = getByTestId('label')

  return { ...returned, getByTestId, queryByTestId, user, month, day, year, input, label, value }
}

it('should pass axe accessibility tests', async () => {
  const { container } = await setup()
  // Chromium reports 15 node-bearing passes, including five color-contrast
  // nodes, with no incomplete results. This audits the live field, not an
  // empty or detached fallback.
  expect(await axe(container)).toHaveNoViolations()
})

describe('dateField', async () => {
  it('populates segment with value - `CalendarDate`', async () => {
    const { month, day, year } = await setup({
      dateFieldProps: { modelValue: calendarDate },
    })

    expect(text(month)).toBe(String(calendarDate.month))
    expect(text(day)).toBe(String(calendarDate.day))
    expect(text(year)).toBe(String(calendarDate.year))
  })

  it('populates segment with value - `CalendarDateTime`', async () => {
    const { month, day, year, getByTestId } = await setup({
      dateFieldProps: { modelValue: calendarDateTime },
    })

    expect(text(month)).toBe(String(calendarDateTime.month))
    expect(text(day)).toBe(String(calendarDateTime.day))
    expect(text(year)).toBe(String(calendarDateTime.year))
    expect(text(getByTestId('hour'))).toBe(String(calendarDateTime.hour))
    expect(text(getByTestId('minute'))).toBe(String(calendarDateTime.minute))
  })

  it('populates segment with value - `ZonedDateTime`', async () => {
    const { month, day, year, getByTestId } = await setup({
      dateFieldProps: { modelValue: zonedDateTime },
    })

    expect(text(month)).toBe(String(zonedDateTime.month))
    expect(text(day)).toBe(String(zonedDateTime.day))
    expect(text(year)).toBe(String(zonedDateTime.year))
    expect(text(getByTestId('hour'))).toBe(String(zonedDateTime.hour))
    expect(text(getByTestId('minute'))).toBe(String(zonedDateTime.minute))
    expect(text(getByTestId('dayPeriod'))).toBe('PM')
    expect(text(getByTestId('timeZoneName'))).toBe('EST')
  })

  it('changes segment positioning based on `locale`', async () => {
    const { input } = await setup({
      dateFieldProps: { locale: 'en-UK' },
    })

    const firstSeg = input.children[0]
    // skipping the literal slashes here
    const secondSeg = input.children[2]
    const thirdSeg = input.children[4]

    expect(text(firstSeg)).toBe('dd')
    expect(text(secondSeg)).toBe('mm')
    expect(text(thirdSeg)).toBe('yyyy')
  })

  it('doesnt show the day period for locales that don\'t use them', async () => {
    const { queryByTestId } = await setup({
      dateFieldProps: {
        locale: 'en-UK',
        modelValue: calendarDateTime,
      },
    })
    expect(queryByTestId('dayPeriod')).not.toBeInTheDocument()
  })
  it('does show the day period for locales that do use them', async () => {
    const { queryByTestId } = await setup({
      dateFieldProps: { modelValue: calendarDateTime },
    })
    expect(queryByTestId('dayPeriod')).toBeInTheDocument()
  })

  it('focuses first segment on label click', async () => {
    const { user, input, label } = await setup()
    await user.click(label)
    expect(input.firstElementChild).toHaveFocus()
  })

  it('focuses segments on click', async () => {
    const { user, day, month, year, getByTestId } = await setup({
      dateFieldProps: { modelValue: zonedDateTime },
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
      dateFieldProps: {
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
      dateFieldProps: {
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
    expect(text(day)).toBe(cycle('day'))
    await user.click(month)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(text(month)).toBe(cycle('month'))
    await user.click(year)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(text(year)).toBe(cycle('year'))
    await user.click(hour)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(text(hour)).toBe(cycle('hour'))
    await user.click(minute)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(text(minute)).toBe(cycle('minute'))
    await user.click(second)
    await user.keyboard(kbd.ARROW_DOWN)
    expect(text(second)).toBe(cycle('second'))
  })

  it('allow the maximum day to be 31 when no month field', async () => {
    const { user, day } = await setup({
      dateFieldProps: {
        /**
         * Explicitly set the placeholder to avoid using current local time as placeholder.
         * And use a month (here is April, 30 days) with less than 31 days to ensure the day can be 31
         * when user input day segment first.
         */
        placeholder: new CalendarDate(2025, 4, 30),
      },
    })

    await user.click(day)
    await user.keyboard(kbd.ARROW_UP)
    await user.keyboard(kbd.ARROW_UP)
    expect(text(day)).toBe('31')
  })

  it('navigates segments using the arrow keys', async () => {
    const { getByTestId, user, day, month, year } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })
    const { hour, minute, second, dayPeriod, timeZoneName } = getTimeSegments(getByTestId)

    const segments = [month, day, year, hour, minute, second, dayPeriod, timeZoneName]

    await user.click(month)

    for (const seg of segments) {
      expect(seg).toHaveFocus()
      await user.keyboard(kbd.ARROW_RIGHT)
    }
    expect(timeZoneName).toHaveFocus()

    for (const seg of segments.reverse()) {
      expect(seg).toHaveFocus()
      await user.keyboard(kbd.ARROW_LEFT)
    }
    expect(month).toHaveFocus()
  })

  it('navigates the segments using tab', async () => {
    const { getByTestId, user, day, month, year } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })
    const { hour, minute, second, dayPeriod, timeZoneName } = getTimeSegments(getByTestId)

    const segments = [month, day, year, hour, minute, second, dayPeriod]

    await user.click(month)

    for (const seg of segments) {
      expect(seg).toHaveFocus()
      await user.keyboard(kbd.TAB)
    }
    expect(timeZoneName).toHaveFocus()

    for (const seg of segments.reverse()) {
      await user.keyboard(`${kbd.SHIFT_TAB}{/Shift}`)
      expect(seg).toHaveFocus()
    }
  })

  it('doesn\'t change focus prematurely with segment value of 0', async () => {
    const { getByTestId, user, day, month, year } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })
    const { hour, minute, second } = getTimeSegments(getByTestId)

    const segments = [month, day, year, hour, minute, second]

    for (const segment of segments) {
      await user.click(segment)
      await user.keyboard('0')
      await user.keyboard(kbd.TAB)
      expect(segment).not.toHaveFocus()
      await user.click(segment)
      await user.keyboard('1')
      expect(segment).toHaveFocus()
    }
  })

  it(`preserve other segment when one segment's value is deleted`, async () => {
    const { user, day, month, year } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
      },
    })

    const initialValues = {
      month: month.innerHTML,
      day: day.innerHTML,
      year: year.innerHTML,
    }

    await user.click(month)
    await user.keyboard(kbd.BACKSPACE)

    expect(text(month)).toBe('mm')
    expect(text(day)).toBe(initialValues.day)
    expect(text(year)).toBe(initialValues.year)

    await user.click(day)
    await user.keyboard(kbd.BACKSPACE)
    await user.keyboard(kbd.BACKSPACE)

    expect(text(month)).toBe('mm')
    expect(text(day)).toBe('dd')
    expect(text(year)).toBe(initialValues.year)
  })

  it('should clear all segment when `modelValue` is set to nullish', async () => {
    const { day, month, year, rerender } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime.copy(),
      },
    })

    expect(month).not.toHaveTextContent('mm')
    expect(day).not.toHaveTextContent('dd')
    expect(year).not.toHaveTextContent('yyyy')

    await rerender({
      dateFieldProps: {
        modelValue: undefined,
      },
    })

    expect(text(month)).toBe('mm')
    expect(text(day)).toBe('dd')
    expect(text(year)).toBe('yyyy')
  })

  it('prevents interaction when `disabled`', async () => {
    const { user, getByTestId, day, month, year } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
        disabled: true,
      },
    })

    const { hour, minute, second, dayPeriod, timeZoneName } = getTimeSegments(getByTestId)

    const segments = [month, day, year, hour, minute, second, dayPeriod, timeZoneName]
    const initialValues = segments.map(text)

    for (const seg of segments) {
      let mouseDown: MouseEvent | undefined
      seg.addEventListener('mousedown', event => mouseDown = event, { once: true })
      await user.click(seg, { force: true })
      expect(mouseDown?.defaultPrevented).toBe(true)
      expect(seg).not.toHaveFocus()
      expect(seg).not.toHaveAttribute('tabindex')
    }
    expect(segments.map(text)).toStrictEqual(initialValues)
  })

  it('prevents modification when `readonly`', async () => {
    const { user, getByTestId, day, month, year } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
        readonly: true,
      },
    })
    const { hour, minute, second } = getTimeSegments(getByTestId)
    const segments = [month, day, year, hour, minute, second]
    const initialValues = segments.map(text)

    for (const [index, segment] of segments.entries()) {
      await user.click(segment)
      expect(segment).toHaveFocus()
      await user.keyboard(kbd.ARROW_UP)
      expect(text(segment)).toBe(initialValues[index])
    }
  })

  it('correctly marks the field as invalid if the value is invalid', async () => {
    const { getByTestId, day, month, year, input, user, rerender } = await setup({
      dateFieldProps: {
        granularity: 'second',
        isDateUnavailable: date => date.day === 19,
        modelValue: zonedDateTime,
      },
      emits: {
        'onUpdate:modelValue': async (data: DateValue) => rerender({
          dateFieldProps: {
            modelValue: data,
            granularity: 'second',
            isDateUnavailable: (date: DateValue) => date.day === 19,
          },
        }),
      },
    })

    const { hour, minute, second, dayPeriod, timeZoneName } = getTimeSegments(getByTestId)
    const segments = [month, day, year, hour, minute, second, dayPeriod, timeZoneName]

    await user.click(month)
    await user.keyboard('2')
    expect(text(month)).toBe('2')
    expect(day).toHaveFocus()
    // Multi-character braced tokens such as `{19}` fall back to insertText in
    // the Playwright provider and fire no keydown. Two real digit keys exercise
    // accumulation and focus advancement; mutating that branch leaves the
    // jsdom original green and makes this browser test fail.
    await user.keyboard('19')
    expect(text(day)).toBe('19')
    expect(year).toHaveFocus()
    await user.keyboard('1111')
    expect(text(year)).toBe('1111')

    expect(input).toHaveAttribute('data-invalid')

    for (const seg of segments) {
      expect(seg).toHaveAttribute('aria-invalid', 'true')
      expect(seg).toHaveAttribute('data-invalid')
    }
  })

  it('advances focus through segments in DOM order when typing in RTL', async () => {
    const { user, month, day, year } = await setup({
      dateFieldProps: {
        dir: 'rtl',
      },
    })

    await user.click(month)
    expect(month).toHaveFocus()
    await user.keyboard('2')
    expect(day).toHaveFocus()
    // Real digits are required here too; `{19}` and `{1980}` are not physical
    // key names and silently bypass the component's keydown handlers.
    await user.keyboard('19')
    expect(year).toHaveFocus()
    await user.keyboard('1980')
    expect(text(year)).toBe('1980')
  })

  it('adjusts the hour cycle with the `hourCycle` prop', async () => {
    const { getByTestId, queryByTestId, user } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        hourCycle: 24,
      },
    })

    expect(queryByTestId('dayPeriod')).toBeNull()
    const hour = getByTestId('hour')
    expect(text(hour)).toBe('12')
    await user.click(hour)
    expect(hour).toHaveFocus()
    await user.keyboard(kbd.ARROW_UP)
    expect(text(hour)).toBe('13')
  })

  it('overrides the default displayed segments with the `granularity` prop - `day`', async () => {
    const { queryByTestId, month, day, year } = await setup({
      dateFieldProps: {
        modelValue: calendarDateTime,
        granularity: 'day',
      },
    })

    const nonDisplayedSegments = ['hour', 'minute', 'second', 'dayPeriod']
    const displayedSegments = [month, day, year]
    for (const seg of nonDisplayedSegments)
      expect(queryByTestId(seg)).toBeNull()

    for (const seg of displayedSegments)
      expect(seg).toBeVisible()
  })

  it('overrides the default displayed segments with the `granularity` prop - `minute`', async () => {
    const { queryByTestId, getByTestId, month, day, year } = await setup({
      dateFieldProps: {
        modelValue: calendarDateTime,
        granularity: 'minute',
      },
    })

    const displayedSegments = [
      month,
      day,
      year,
      getByTestId('hour'),
      getByTestId('minute'),
      getByTestId('dayPeriod'),
    ]

    expect(queryByTestId('second')).toBeNull()

    for (const seg of displayedSegments)
      expect(seg).toBeVisible()
  })

  it('takes you all the way through the segment with spamming 3', async () => {
    const { getByTestId, user, month, day, year } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })

    const { hour, minute, second, dayPeriod } = getTimeSegments(getByTestId)

    await user.click(month)
    await user.keyboard('3')
    expect(day).toHaveFocus()
    await user.keyboard('3')
    await user.keyboard('3')
    expect(year).toHaveFocus()
    await user.keyboard('3')
    await user.keyboard('3')
    await user.keyboard('3')
    await user.keyboard('3')
    expect(hour).toHaveFocus()
    await user.keyboard('3')
    expect(minute).toHaveFocus()
    await user.keyboard('3')
    await user.keyboard('3')
    expect(second).toHaveFocus()
    await user.keyboard('3')
    await user.keyboard('3')
    expect(dayPeriod).toHaveFocus()
  })

  it('updates the hour on the modelValue if the dayPeriod is updated', async () => {
    const { getByTestId, user, value, rerender } = await setup({
      dateFieldProps: {
        modelValue: calendarDateTime,
        granularity: 'second',
      },
      emits: {
        'onUpdate:modelValue': (data: DateValue) => {
          return rerender({
            dateFieldProps: {
              modelValue: data,
              granularity: 'second',
            },
          })
        },
      },
    })

    const dayPeriod = getByTestId('dayPeriod')
    expect(value.textContent).toBe(calendarDateTime.toString())
    await user.click(dayPeriod)
    await user.keyboard('{a}')
    expect(getByTestId('value').textContent).toBe(calendarDateTime.subtract({ hours: 12 }).toString())
    await user.keyboard('{p}')
    expect(getByTestId('value').textContent).toBe(calendarDateTime.toString())
    await user.keyboard('{A}')
    expect(getByTestId('value').textContent).toBe(calendarDateTime.subtract({ hours: 12 }).toString())
    await user.keyboard('{P}')
    expect(getByTestId('value').textContent).toBe(calendarDateTime.toString())
  })

  it('fully overwrites on first click and type - `month`', async () => {
    const { user, month } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })

    await user.click(month)
    expect(month).toHaveFocus()
    expect(text(month)).toBe(String(zonedDateTime.month))
    await user.keyboard('3')
    expect(text(month)).toBe('3')
  })

  it('fully overwrites on first click and type - `day`', async () => {
    const { user, day } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })

    await user.click(day)
    expect(day).toHaveFocus()
    expect(text(day)).toBe(String(zonedDateTime.day))
    await user.keyboard('1')
    expect(text(day)).toBe('1')
  })

  it('fully overwrites on first click and type - `year`', async () => {
    const { user, year } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })

    await user.click(year)
    expect(year).toHaveFocus()
    expect(text(year)).toBe(String(zonedDateTime.year))
    await user.keyboard('1')
    expect(text(year)).toBe('1')
  })

  it('fully overwrites on first click and type - `hour`', async () => {
    const { user, getByTestId } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })
    const hour = getByTestId('hour')

    await user.click(hour)
    expect(hour).toHaveFocus()
    expect(text(hour)).toBe(String(zonedDateTime.hour))
    await user.keyboard('1')
    expect(text(hour)).toBe('1')
  })

  it('fully overwrites on first click and type - `minute`', async () => {
    const { user, getByTestId } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })
    const minute = getByTestId('minute')

    await user.click(minute)
    expect(minute).toHaveFocus()
    expect(text(minute)).toBe(String(zonedDateTime.minute))
    await user.keyboard('1')
    expect(text(minute)).toBe('01')
  })

  it('fully overwrites on first click and type - `second`', async () => {
    const { user, getByTestId } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })
    const second = getByTestId('second')

    await user.click(second)
    expect(second).toHaveFocus()
    expect(text(second)).toBe('00')
    await user.keyboard('1')
    expect(text(second)).toBe('01')
  })

  it('displays correct timezone with ZonedDateTime value - `now`', async () => {
    const { getByTestId } = await setup({
      dateFieldProps: { modelValue: now('America/Los_Angeles') },
    })

    const timeZone = getByTestId('timeZoneName')
    if (isDaylightSavingsTime())
      expect(text(timeZone)).toBe('PDT')
    else
      expect(text(timeZone)).toBe('PST')
  })

  it('displays correct timezone with ZonedDateTime value - absolute -> local', async () => {
    const { getByTestId } = await setup({
      dateFieldProps: { modelValue: parseAbsoluteToLocal('2023-10-12T12:30:00Z') },
    })

    const timeZone = getByTestId('timeZoneName')
    expect(timeZone).toHaveTextContent(thisTimeZone('2023-10-12T12:30:00Z'))
  })

  describe('stepSnapping', () => {
    async function setupStepSnappingTest({
      step,
      stepSnapping,
      modelValue = new CalendarDateTime(1980, 1, 20, 12, 0, 0, 0),
      hourCycle,
    }: {
      step: DateFieldRootProps['step']
      stepSnapping: boolean
      modelValue?: DateValue
      hourCycle?: DateFieldRootProps['hourCycle']
    }) {
      let rerender: Awaited<ReturnType<typeof setup>>['rerender']
      const returned = await setup({
        dateFieldProps: {
          modelValue,
          granularity: 'second',
          hourCycle,
          step,
          stepSnapping,
        },
        emits: {
          'onUpdate:modelValue': (data: DateValue) => {
            return rerender({
              dateFieldProps: {
                modelValue: data,
                granularity: 'second',
                hourCycle,
                step,
                stepSnapping,
              },
            })
          },
        },
      })
      rerender = returned.rerender
      return returned
    }

    it('snaps typed minute value to nearest step', async () => {
      const { user, getByTestId } = await setupStepSnappingTest({
        step: { minute: 15 },
        stepSnapping: true,
      })

      const minute = getByTestId('minute')
      await user.click(minute)
      await user.keyboard('23')
      await user.click(getByTestId('second'))

      expect(text(minute)).toBe('30')
    })

    it('does not change typed minute value already on the step boundary', async () => {
      const { user, getByTestId } = await setupStepSnappingTest({
        step: { minute: 15 },
        stepSnapping: true,
      })

      const minute = getByTestId('minute')
      await user.click(minute)
      await user.keyboard('15')
      await user.click(getByTestId('second'))

      expect(text(minute)).toBe('15')
    })

    it('snaps typed minute value using custom step', async () => {
      const { user, getByTestId } = await setupStepSnappingTest({
        step: { minute: 10 },
        stepSnapping: true,
      })

      const minute = getByTestId('minute')
      await user.click(minute)
      await user.keyboard('26')
      await user.click(getByTestId('second'))

      expect(text(minute)).toBe('30')
    })

    it('snaps typed minute value down to the nearest step', async () => {
      const { user, getByTestId, rerender } = await setup({
        dateFieldProps: {
          modelValue: new CalendarDateTime(1980, 1, 20, 12, 0, 0, 0),
          granularity: 'second',
          step: { minute: 15 },
          stepSnapping: true,
        },
        emits: {
          'onUpdate:modelValue': (data: DateValue) => {
            return rerender({
              dateFieldProps: {
                modelValue: data,
                granularity: 'second',
                step: { minute: 15 },
                stepSnapping: true,
              },
            })
          },
        },
      })

      const minute = getByTestId('minute')
      await user.click(minute)
      await user.keyboard('07')
      await user.click(getByTestId('second'))

      expect(text(minute)).toBe('00')
    })

    it('does not snap typed minute value when step is 1', async () => {
      const { user, getByTestId } = await setupStepSnappingTest({
        step: { minute: 1 },
        stepSnapping: true,
      })

      const minute = getByTestId('minute')
      await user.click(minute)
      await user.keyboard('23')
      await user.click(getByTestId('second'))

      expect(text(minute)).toBe('23')
    })

    it('snaps typed minute value to nearest non-divisor step', async () => {
      const { user, getByTestId } = await setupStepSnappingTest({
        step: { minute: 7 },
        stepSnapping: true,
      })

      const minute = getByTestId('minute')
      await user.click(minute)
      await user.keyboard('23')
      await user.click(getByTestId('second'))

      expect(text(minute)).toBe('21')
    })

    it('snaps typed hour value to nearest step', async () => {
      const { user, getByTestId } = await setupStepSnappingTest({
        modelValue: new CalendarDateTime(1980, 1, 20, 0, 0, 0, 0),
        hourCycle: 24,
        step: { hour: 4 },
        stepSnapping: true,
      })

      const hour = getByTestId('hour')
      await user.click(hour)
      await user.keyboard('10')
      await user.click(getByTestId('minute'))

      expect(text(hour)).toBe('12')
    })

    it('snaps typed second value to nearest step', async () => {
      const { user, getByTestId } = await setupStepSnappingTest({
        step: { second: 7 },
        stepSnapping: true,
      })

      const second = getByTestId('second')
      await user.click(second)
      await user.keyboard('10')
      await user.click(getByTestId('minute'))

      expect(text(second)).toBe('07')
    })

    it('does not snap typed values when stepSnapping is false', async () => {
      const { user, getByTestId } = await setupStepSnappingTest({
        step: { minute: 15 },
        stepSnapping: false,
      })

      const minute = getByTestId('minute')
      await user.click(minute)
      await user.keyboard('23')
      await user.click(getByTestId('second'))

      expect(text(minute)).toBe('23')
    })
  })
})

describe('handle IME composition', () => {
  it('should block direct text insertion into the segment (Safari fires beforeinput before keydown with an IME active)', async () => {
    const { day, user } = await setup()

    await user.click(day)

    // Safari inserts the raw character at `input` (before `keydown`) while an IME
    // is active; blocking `beforeinput` is the only way to stop it leaking in.
    const event = new InputEvent('beforeinput', { data: '1', inputType: 'insertText', cancelable: true })
    Object.defineProperty(event, 'isComposing', { value: false })
    day.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('should let composition input through beforeinput', async () => {
    const { day, user } = await setup()

    await user.click(day)

    const event = new InputEvent('beforeinput', { data: 'n', inputType: 'insertCompositionText', cancelable: true })
    Object.defineProperty(event, 'isComposing', { value: true })
    day.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('should still apply a directly-typed digit when a CJK IME is active (keyCode 229, not composing)', async () => {
    const { day, user, getByTestId } = await setup()

    await user.click(day)
    expect(day).toHaveFocus()

    // Pinyin active but NOT composing: Safari flags the keydown with keyCode 229
    // while passing the real digit through (key === '1', isComposing false).
    dispatchKeydown(day, { key: '1', keyCode: 229 })
    await nextTick()

    expect(text(getByTestId('day'))).toBe('1')
  })

  it('should not update segment during IME keydown (keyCode 229)', async () => {
    const { day, user } = await setup()

    await user.click(day)
    expect(day).toHaveFocus()

    dispatchKeydown(day, { key: '1', keyCode: 229, isComposing: true })

    expect(text(day)).toBe('dd')
  })

  it('should process committed digit after compositionend', async () => {
    const { day, user, getByTestId } = await setup()

    await user.click(day)

    dispatchKeydown(day, { key: 'Process', keyCode: 229, isComposing: true })
    expect(text(day)).toBe('dd')

    day.dispatchEvent(new CompositionEvent('compositionend', { data: '5', bubbles: true, cancelable: true }))
    await nextTick()

    expect(text(getByTestId('day'))).toBe('5')
  })

  it('should ignore non-digit characters from compositionend', async () => {
    const { day, user, getByTestId } = await setup()

    await user.click(day)

    day.dispatchEvent(new CompositionEvent('compositionend', { data: 'あ', bubbles: true, cancelable: true }))
    await nextTick()

    expect(text(getByTestId('day'))).toBe('dd')
  })

  it('should restore the placeholder after composing non-numeric text into the segment', async () => {
    const { day, user, getByTestId } = await setup()

    await user.click(day)

    // The IME mutates the contenteditable directly: capture Vue's nodes on
    // compositionstart, then simulate the IME prepending text to the value node.
    day.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true, cancelable: true }))
    const valueNode = [...day.childNodes].find(n => n.nodeType === 3 && n.nodeValue) as Text
    valueNode.nodeValue = `你${valueNode.nodeValue}`
    expect(text(getByTestId('day'))).toBe('你dd')

    // On commit, the IME text must be reverted and Vue's node restored so it stays
    // patchable (Vue won't reconcile it since the segment value never changed).
    day.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true, cancelable: true }))
    await nextTick()

    expect(text(getByTestId('day'))).toBe('dd')
  })

  it('should still apply a digit typed right after a non-numeric composition', async () => {
    const { day, user, getByTestId } = await setup()

    await user.click(day)

    // Compose a non-numeric character and commit it.
    day.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true, cancelable: true }))
    const valueNode = [...day.childNodes].find(n => n.nodeType === 3 && n.nodeValue) as Text
    valueNode.nodeValue = `你${valueNode.nodeValue}`
    day.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true, cancelable: true }))
    await nextTick()
    expect(text(getByTestId('day'))).toBe('dd')

    // Typing a digit afterwards must still update the segment (regression: Vue's
    // text node was being detached, freezing the display).
    await user.keyboard('5')
    expect(text(getByTestId('day'))).toBe('5')
  })

  it('should not advance to next segment during composition', async () => {
    const { month, day, user } = await setup()

    await user.click(month)
    expect(month).toHaveFocus()

    dispatchKeydown(month, { key: 'Process', keyCode: 229, isComposing: true })

    expect(month).toHaveFocus()
    expect(day).not.toHaveFocus()
  })

  it('should route multi-digit commit to following segments after focus advances', async () => {
    const { month, day, user, getByTestId } = await setup()

    await user.click(month)

    // Committing "45": 4 fills month and auto-advances, 5 lands in the next segment
    month.dispatchEvent(new CompositionEvent('compositionend', { data: '45', bubbles: true, cancelable: true }))
    await nextTick()

    expect(text(getByTestId('month'))).toBe('4')
    expect(text(getByTestId('day'))).toBe('5')
  })

  it('should not navigate between segments during composition (arrow keys are IME candidate navigation)', async () => {
    const { month, day, user } = await setup()

    await user.click(month)
    expect(month).toHaveFocus()

    // Arrow keys mid-composition are used to navigate IME candidates, not segments
    dispatchKeydown(month, { key: 'ArrowRight', isComposing: true })
    expect(month).toHaveFocus()
    expect(day).not.toHaveFocus()

    // Once composition ends, arrow keys navigate segments again
    await user.keyboard('{ArrowRight}')
    expect(day).toHaveFocus()
  })
})

// Baseline coverage (2026-06-12): lines 89.18%, branches 87.26%, functions 97.43%
describe('useDateField – characterization tests (coverage gaps)', () => {
  describe('deleteValue – null prevValue path (line 317)', () => {
    it('pressing Backspace on an already-empty segment is a no-op (placeholder stays)', async () => {
      // Branch 40:0 — deleteValue(null) early-return path
      const { user, month } = await setup()
      // month is empty (no modelValue), backspace should be a no-op
      await user.click(month)
      expect(text(month)).toBe('mm')
      await user.keyboard(kbd.BACKSPACE)
      // NOTE: current behavior — backspace on null segment leaves it null (placeholder text stays)
      expect(text(month)).toBe('mm')
    })

    it('pressing Backspace on a two-digit year value truncates to one digit', async () => {
      // Covers the `str.length > 1` path of deleteValue returning Number.parseInt(str.slice(0,-1))
      const { user, year, rerender } = await setup({
        dateFieldProps: { modelValue: calendarDate },
        emits: {
          'onUpdate:modelValue': (data: DateValue) => {
            return rerender({ dateFieldProps: { modelValue: data } })
          },
        },
      })
      // Year is 1980 (4 digits). First backspace removes the last digit → 198
      await user.click(year)
      await user.keyboard(kbd.BACKSPACE)
      expect(text(year)).toBe('198')
    })
  })

  describe('updateYear – str.length > 4 path (line 618)', () => {
    it('typing a 5th digit in the year segment resets the year to that digit', async () => {
      // Branch 77:0 — updateYear when accumulated str would exceed 4 digits
      // Also covers branch 78:1 — num !== 0, so returns num directly
      const { user, year, rerender } = await setup({
        dateFieldProps: { modelValue: calendarDate },
        emits: {
          'onUpdate:modelValue': (data: DateValue) => {
            return rerender({ dateFieldProps: { modelValue: data } })
          },
        },
      })
      // Type 4 digits to fill the year segment (auto-advances after 4th digit)
      await user.click(year)
      await user.keyboard('2024')
      expect(text(year)).toBe('2024')
      // Click back on year and type more to get to a 5-digit accumulated string
      await user.click(year)
      await user.keyboard('20245')
      // NOTE: current behavior — 5th digit resets: returns { value: 5, moveToNext: false }
      expect(text(year)).toBe('5')
    })

    it('typing 0 as the 5th digit in the year segment resets to 1 (prevents year=0)', async () => {
      // Branch 78:0 — num === 0 in updateYear overflow path, returns 1 instead of 0
      const { user, year, rerender } = await setup({
        dateFieldProps: { modelValue: calendarDate },
        emits: {
          'onUpdate:modelValue': (data: DateValue) => {
            return rerender({ dateFieldProps: { modelValue: data } })
          },
        },
      })
      await user.click(year)
      await user.keyboard('2024')
      await user.click(year)
      await user.keyboard('20240')
      // NOTE: current behavior — 5th digit of 0 returns 1 (year 0 is invalid)
      expect(text(year)).toBe('1')
    })
  })

  describe('compositionend – no data early return (line 988)', () => {
    it('compositionend with empty string data does not crash or modify the segment', async () => {
      // Branch 171:0 — handleSegmentCompositionEnd early return when data is falsy
      const { day, user, getByTestId } = await setup()
      await user.click(day)
      // Fire compositionend with empty string data
      day.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true, cancelable: true }))
      await nextTick()
      // NOTE: current behavior — no change, segment stays at placeholder
      expect(text(getByTestId('day'))).toBe('dd')
    })

    it('compositionend with no data (undefined) does not crash or modify the segment', async () => {
      // Branch 171:0 — handleSegmentCompositionEnd early return when data is null/undefined
      const { day, user, getByTestId } = await setup()
      await user.click(day)
      day.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, cancelable: true }))
      await nextTick()
      expect(text(getByTestId('day'))).toBe('dd')
    })
  })

  describe('hourSegmentAttrs hourCycle=12 aria-value bounds (lines 129-130)', () => {
    it('hour segment has aria-valuemin=1 and aria-valuemax=12 when hourCycle is 12', async () => {
      // Covers the true branch of (hourCycle === 12 ? 1 : 0) and (hourCycle === 12 ? 12 : 23)
      const { getByTestId } = await setup({
        dateFieldProps: {
          modelValue: calendarDateTime,
          hourCycle: 12,
        },
      })
      const hour = getByTestId('hour')
      expect(hour).toHaveAttribute('aria-valuemin', '1')
      expect(hour).toHaveAttribute('aria-valuemax', '12')
    })

    it('hour segment has aria-valuemin=0 and aria-valuemax=23 when hourCycle is 24', async () => {
      const { getByTestId } = await setup({
        dateFieldProps: {
          modelValue: calendarDateTime,
          hourCycle: 24,
        },
      })
      const hour = getByTestId('hour')
      expect(hour).toHaveAttribute('aria-valuemin', '0')
      expect(hour).toHaveAttribute('aria-valuemax', '23')
    })
  })
})
