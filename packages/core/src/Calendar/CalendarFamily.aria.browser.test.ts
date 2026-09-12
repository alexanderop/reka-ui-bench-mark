import { CalendarDate } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import MonthPicker from '../MonthPicker/story/_MonthPicker.vue'
import MonthRangePicker from '../MonthRangePicker/story/_MonthRangePicker.vue'
import RangeCalendar from '../RangeCalendar/story/_RangeCalendar.vue'
import YearPicker from '../YearPicker/story/_YearPicker.vue'
import YearRangePicker from '../YearRangePicker/story/_YearRangePicker.vue'
import Calendar from './story/_Calendar.vue'

// Not a port: this suite contracts the shared accessibility shape of all six
// calendar-family primitives. The existing component ports remain the detailed
// behavioral and jsdom-parity oracles.

const february20 = new CalendarDate(2024, 2, 20)

function expectResolvedLabelledBy(application: HTMLElement, text: string) {
  const labelledBy = application.getAttribute('aria-labelledby')
  expect(labelledBy).toBeTruthy()

  const labels = labelledBy!
    .split(/\s+/)
    .map(id => document.getElementById(id))

  expect(labels).not.toContain(null)
  expect(labels.map(label => label!.textContent?.trim())).toContain(text)
}

describe('calendar-family semantic accessibility', () => {
  it('exposes Calendar selection and keyboard movement in the application tree', async () => {
    await render(Calendar, {
      props: {
        calendarProps: {
          defaultValue: february20,
          placeholder: february20,
        },
      },
    })

    const selected = page.getByRole('gridcell', {
      name: 'Tuesday, February 20, 2024',
      selected: true,
      exact: true,
    })
    await expect.element(selected).toHaveLength(1)

    const day = page.getByRole('button', {
      name: 'Tuesday, February 20, 2024',
      exact: true,
    })
    await day.click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(page.getByRole('button', {
      name: 'Wednesday, February 21, 2024',
      exact: true,
    })).toHaveFocus()
    await userEvent.keyboard(' ')

    const nextSelected = page.getByRole('gridcell', {
      name: 'Wednesday, February 21, 2024',
      selected: true,
      exact: true,
    })
    await expect.element(nextSelected).toHaveLength(1)
    await expect.element(nextSelected).toMatchAriaInlineSnapshot(`
      - gridcell "Wednesday, February 21, 2024" [selected]:
        - button "Wednesday, February 21, 2024": "21"
    `)
  })

  it('exposes RangeCalendar range states and keyboard range selection', async () => {
    await render(RangeCalendar, {
      props: {
        calendarProps: {
          defaultValue: {
            start: february20,
            end: february20.add({ days: 2 }),
          },
          placeholder: february20,
        },
      },
    })

    await expect.element(page.getByRole('gridcell', { selected: true })).toHaveLength(3)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(3)

    const newStart = page.getByRole('button', {
      name: 'Saturday, February 24, 2024',
      exact: true,
    })
    await newStart.click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(page.getByRole('button', {
      name: 'Sunday, February 25, 2024',
      exact: true,
    })).toHaveFocus()
    await userEvent.keyboard(' ')

    const rangeEnd = page.getByRole('gridcell', {
      name: 'Sunday, February 25, 2024',
      selected: true,
      exact: true,
    })
    await expect.element(page.getByRole('gridcell', { selected: true })).toHaveLength(2)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(2)
    await expect.element(rangeEnd).toMatchAriaInlineSnapshot(`
      - gridcell "Sunday, February 25, 2024" [selected]:
        - button "Sunday, February 25, 2024" [pressed]: "25"
    `)
  })

  // @finding Calendar/CalendarFamily.aria.browser.test.ts#range-application-unnamed
  it.fails('names the RangeCalendar application grid after the calendar label', async () => {
    await render(RangeCalendar, {
      props: {
        calendarProps: {
          calendarLabel: 'Travel dates',
          placeholder: february20,
        },
      },
    })

    expect(page.getByRole('application', {
      name: /Travel dates/,
    }).elements()).toHaveLength(1)
  })

  it('names MonthPicker by a resolving heading IDREF and exposes keyboard selection', async () => {
    await render(MonthPicker, {
      props: {
        pickerProps: {
          defaultValue: february20,
          placeholder: february20,
        },
      },
    })

    const application = page.getByRole('application', { name: '2024', exact: true })
    await expect.element(application).toHaveLength(1)
    expectResolvedLabelledBy(application.element() as HTMLElement, '2024')

    const february = page.getByRole('button', { name: 'February 2024', exact: true })
    await february.click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(page.getByRole('button', {
      name: 'March 2024',
      exact: true,
    })).toHaveFocus()
    await userEvent.keyboard(' ')

    const selected = page.getByRole('gridcell', {
      name: 'March 2024',
      selected: true,
      exact: true,
    })
    await expect.element(selected).toHaveLength(1)
    await expect.element(selected).toMatchAriaInlineSnapshot(`
      - gridcell "March 2024" [selected]:
        - button "March 2024": Mar
    `)
  })

  it('names MonthRangePicker by a resolving heading IDREF and exposes keyboard range selection', async () => {
    await render(MonthRangePicker, {
      props: {
        pickerProps: {
          defaultValue: {
            start: february20,
            end: february20.add({ months: 2 }),
          },
          placeholder: february20,
        },
      },
    })

    const application = page.getByRole('application', { name: '2024', exact: true })
    await expect.element(application).toHaveLength(1)
    expectResolvedLabelledBy(application.element() as HTMLElement, '2024')
    await expect.element(page.getByRole('gridcell', { selected: true })).toHaveLength(3)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(3)

    const newStart = page.getByRole('button', { name: 'June 2024', exact: true })
    await newStart.click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(page.getByRole('button', {
      name: 'July 2024',
      exact: true,
    })).toHaveFocus()
    await userEvent.keyboard(' ')

    const selected = page.getByRole('gridcell', {
      name: 'July 2024',
      selected: true,
      exact: true,
    })
    await expect.element(page.getByRole('gridcell', { selected: true })).toHaveLength(2)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(2)
    await expect.element(selected).toMatchAriaInlineSnapshot(`
      - gridcell "July 2024" [selected]:
        - button "July 2024" [pressed]: Jul
    `)
  })

  it('names YearPicker by a resolving heading IDREF and exposes keyboard selection', async () => {
    await render(YearPicker, {
      props: {
        pickerProps: {
          defaultValue: february20,
          placeholder: february20,
        },
      },
    })

    const application = page.getByRole('application', { name: '2020 - 2031', exact: true })
    await expect.element(application).toHaveLength(1)
    expectResolvedLabelledBy(application.element() as HTMLElement, '2020 - 2031')

    const year = page.getByRole('button', { name: '2024', exact: true })
    await year.click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(page.getByRole('button', {
      name: '2025',
      exact: true,
    })).toHaveFocus()
    await userEvent.keyboard(' ')

    const selected = page.getByRole('gridcell', {
      name: '2025',
      selected: true,
      exact: true,
    })
    await expect.element(selected).toHaveLength(1)
    await expect.element(selected).toMatchAriaInlineSnapshot(`
      - gridcell "2025" [selected]:
        - button "2025"
    `)
  })

  it('names YearRangePicker by a resolving heading IDREF and exposes keyboard range selection', async () => {
    await render(YearRangePicker, {
      props: {
        pickerProps: {
          defaultValue: {
            start: february20,
            end: february20.add({ years: 2 }),
          },
          placeholder: february20,
        },
      },
    })

    const application = page.getByRole('application', { name: '2020 - 2031', exact: true })
    await expect.element(application).toHaveLength(1)
    expectResolvedLabelledBy(application.element() as HTMLElement, '2020 - 2031')
    await expect.element(page.getByRole('gridcell', { selected: true })).toHaveLength(3)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(3)

    const newStart = page.getByRole('button', { name: '2028', exact: true })
    await newStart.click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(page.getByRole('button', {
      name: '2029',
      exact: true,
    })).toHaveFocus()
    await userEvent.keyboard(' ')

    const selected = page.getByRole('gridcell', {
      name: '2029',
      selected: true,
      exact: true,
    })
    await expect.element(page.getByRole('gridcell', { selected: true })).toHaveLength(2)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(2)
    await expect.element(selected).toMatchAriaInlineSnapshot(`
      - gridcell "2029" [selected]:
        - button "2029" [pressed]
    `)
  })
})
