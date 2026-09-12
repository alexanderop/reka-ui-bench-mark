import type { DateValue } from '@internationalized/date'

import type { DateRangeFieldRootProps } from './DateRangeFieldRoot.vue'
import { CalendarDate, CalendarDateTime, toZoned } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { useTestKbd } from '@/shared'
import DateRangeField from './story/_DateRangeField.vue'

// Browser-mode port of `DateRangeField.test.ts`, and the template for the rest
// of the date/picker family. Four things that generalise, all measured:
//
//  1. **The runner's timezone reaches Chromium.** `vitest.global.ts` sets
//     `process.env.TZ = 'US/Eastern'` in the *node* process, and Playwright
//     launches the browser inheriting that env — measured
//     `Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York'`
//     inside the tester iframe on a machine whose system zone is
//     `Europe/Berlin`. `navigator.language` is `en-US` in both environments.
//     So `@internationalized/date` fixtures render identically here and under
//     jsdom, and nothing needs a `timezoneId` browser option.
//     See `DateRangeField/DateRangeField.test.ts#tz-reaches-chromium`.
//  2. **`useTestKbd` translates as-is — with exactly one exception.** vitest's
//     `userEvent.keyboard` parses with `@testing-library/user-event`'s own
//     `parseKeyDef` + `defaultKeyMap`, so `{ArrowRight}`, `{Tab}` and
//     `{Shift>}{Tab}` behave identically. What does *not* survive is a
//     multi-character synthetic key such as `{19}` — see the comment on the
//     RTL test below.
//  3. **No geometry workaround.** The segments are block-level and measure
//     414x24 in Chromium, so unlike `Switch`/`Toggle` this fixture needs no
//     `beforeAll` style block to be clickable.
//  4. **Neither `@testing-library` vacuity applies to this file.** There is
//     not one `getByText` in the entire date family (0 hits across
//     DateField / TimeField / Calendar / RangeCalendar / DatePicker /
//     DateRangePicker / DateRangeField), so the substring-match trap has
//     nothing to bite. The lazy-locator trap *does* apply to `setup()`, whose
//     eight `getByTestId` calls are existence assertions by virtue of
//     `@testing-library` throwing; `.element()` below is what preserves them.

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

async function setup(props: { dateFieldProps?: DateRangeFieldRootProps, emits?: { 'onUpdate:modelValue'?: (data: DateValue) => void } } = {}) {
  const user = userEvent.setup()
  const returned = await render(DateRangeField, { props })

  // `.element()` is what keeps the original's semantics: `@testing-library`'s
  // `getByTestId` throws when it misses, and a vitest locator is lazy and
  // throws nothing. Resolving each one here reproduces the throw *and* hands
  // the tests the same raw `HTMLElement` the original held, so every
  // assertion below stays the original's exact synchronous read.
  const getByTestId = (id: string) => returned.getByTestId(id).element() as HTMLElement

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

  return { ...returned, getByTestId, user, start, end, input, label }
}

it('should pass axe accessibility tests', async () => {
  const { container } = await setup()
  expect(await axe(container)).toHaveNoViolations()
})

describe('dateField', async () => {
  it('advances focus through segments in DOM order when typing in RTL', async () => {
    const { user, start, end } = await setup({
      dateFieldProps: {
        dir: 'rtl',
      },
    })

    await user.click(page.elementLocator(start.month))
    expect(start.month).toHaveFocus()
    await user.keyboard('{2}')
    expect(start.day).toHaveFocus()
    // The original types `{19}` — a *single* key event whose `key` is the
    // two-character string `"19"`. No keyboard can produce that, and vitest's
    // playwright provider says so structurally: `keyboardImplementation`
    // (`@vitest/browser-playwright/src/commands/keyboard.ts:86-91`) checks the
    // parsed key against a `VALID_KEYS` set of real Playwright key names and
    // falls back to `page.keyboard.insertText(key)` for anything else — which
    // fires **no** `keydown` at all. Measured: with `{19}` the day segment is
    // still `dd` / `aria-valuetext="Empty"` and focus never leaves it.
    // Typed as two real digits the component reaches the identical state
    // (`updateDayOrMonth`: `1` -> value 1, no advance; `9` -> total 19 <= 28,
    // advance), so this is the same contract asserted through a gesture a user
    // can actually perform. See `DateRangeField/DateRangeField.test.ts#synthetic-multichar-key`.
    await user.keyboard('19')
    expect(start.year).toHaveFocus()
    await user.keyboard('1980')
    expect(end.month).toHaveFocus()
  })

  it('populates segment with value - `CalendarDate`', async () => {
    const { start, end } = await setup({
      dateFieldProps: { modelValue: calendarDate },
    })

    expect(start.month).toHaveTextContent(String(calendarDate.start.month))
    expect(start.day).toHaveTextContent(String(calendarDate.start.day))
    expect(start.year).toHaveTextContent(String(calendarDate.start.year))

    expect(end.month).toHaveTextContent(String(calendarDate.end.month))
    expect(end.day).toHaveTextContent(String(calendarDate.end.day))
    expect(end.year).toHaveTextContent(String(calendarDate.end.year))
  })

  it('populates segment with value - `CalendarDateTime`', async () => {
    const { start, end, getByTestId } = await setup({
      dateFieldProps: {
        modelValue: calendarDateTime,
        granularity: 'second',
      },
    })

    expect(start.month).toHaveTextContent(String(calendarDateTime.start.month))
    expect(start.day).toHaveTextContent(String(calendarDateTime.start.day))
    expect(start.year).toHaveTextContent(String(calendarDateTime.start.year))
    expect(getByTestId('start-hour')).toHaveTextContent(String(calendarDateTime.start.hour))
    expect(getByTestId('start-minute')).toHaveTextContent(String(calendarDateTime.start.minute))
    expect(getByTestId('start-second')).toHaveTextContent(String(calendarDateTime.start.second).padStart(2, '0'))

    expect(end.month).toHaveTextContent(String(calendarDateTime.end.month))
    expect(end.day).toHaveTextContent(String(calendarDateTime.end.day))
    expect(end.year).toHaveTextContent(String(calendarDateTime.end.year))
    expect(getByTestId('end-hour')).toHaveTextContent(String(calendarDateTime.end.hour))
    expect(getByTestId('end-minute')).toHaveTextContent(String(calendarDateTime.end.minute))
    expect(getByTestId('end-second')).toHaveTextContent(String(calendarDateTime.end.second).padStart(2, '0'))
  })

  it('populates segment with value - `ZonedDateTime`', async () => {
    const { start, end, getByTestId } = await setup({
      dateFieldProps: {
        modelValue: zonedDateTime,
        granularity: 'second',
      },
    })

    expect(start.month).toHaveTextContent(String(calendarDateTime.start.month))
    expect(start.day).toHaveTextContent(String(calendarDateTime.start.day))
    expect(start.year).toHaveTextContent(String(calendarDateTime.start.year))
    expect(getByTestId('start-hour')).toHaveTextContent(String(calendarDateTime.start.hour))
    expect(getByTestId('start-minute')).toHaveTextContent(String(calendarDateTime.start.minute))
    expect(getByTestId('start-second')).toHaveTextContent(String(calendarDateTime.start.second).padStart(2, '0'))

    expect(end.month).toHaveTextContent(String(calendarDateTime.end.month))
    expect(end.day).toHaveTextContent(String(calendarDateTime.end.day))
    expect(end.year).toHaveTextContent(String(calendarDateTime.end.year))
    expect(getByTestId('end-hour')).toHaveTextContent(String(calendarDateTime.end.hour))
    expect(getByTestId('end-minute')).toHaveTextContent(String(calendarDateTime.end.minute))
    expect(getByTestId('end-second')).toHaveTextContent(String(calendarDateTime.end.second).padStart(2, '0'))
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
        // `SHIFT_TAB` is `{Shift>}{Tab}` with no release; release it in the
        // same chord so a failing assertion cannot leave Shift held.
        await user.keyboard(`${kbd.SHIFT_TAB}{/Shift}`)
        expect(seg).toHaveFocus()
      }
    }
  })

  it('binds to the value', async () => {
    const { start, end, user } = await setup({
      dateFieldProps: { modelValue: calendarDate },
    })
    expect(start.month).toHaveTextContent(String(calendarDate.start.month))
    expect(end.month).toHaveTextContent(String(calendarDate.end.month))

    await user.click(page.elementLocator(start.month))
    await user.keyboard('2')
    expect(start.month).toHaveTextContent('2')
    expect(end.month).toHaveTextContent(String(calendarDate.end.month))
  })
})
