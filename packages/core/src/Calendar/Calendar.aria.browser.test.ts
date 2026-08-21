import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { pinClock, PINNED_TODAY } from '@/test/visual'
import Calendar from './story/_Calendar.vue'

// Not a port — no jsdom original, so `port:parity` reports this file as
// unpaired and skips it. Found by the a11y census: the calendar's
// `role="application"` lives on the `<table>` (CalendarGrid.vue:23, deliberate
// — #2502, NVDA keyboard navigation) while `fullCalendarLabel` is bound as
// `aria-label` on the role-less root `<div>` (CalendarRoot.vue:350), where
// name computation ignores it. So the one landmark an AT user lands in is an
// unnamed `application`. MonthPickerGrid.vue:24 labels its application with
// `aria-labelledby=headingId`; Calendar does not.

pinClock(PINNED_TODAY)

describe('given the Calendar story fixture', () => {
  it('exposes exactly one application role, on the grid table, unnamed', async () => {
    const screen = await render(Calendar)
    const apps = page.getByRole('application').elements()
    expect(apps).toHaveLength(1)
    expect(apps[0].tagName).toBe('TABLE')
    expect(apps[0].getAttribute('aria-label')).toBeNull()
    expect(apps[0].getAttribute('aria-labelledby')).toBeNull()
    // …while the label it should carry sits on a div with no role.
    const root = screen.container.firstElementChild as HTMLElement
    expect(root.getAttribute('role')).toBeNull()
    expect(root.getAttribute('aria-label')).toBe('Event Date, February 2024')
  })

  // @finding Calendar/Calendar.aria.browser.test.ts#application-unnamed
  it.fails('names the application grid after the calendar label', async () => {
    await render(Calendar)
    expect(page.getByRole('application', { name: /Event Date/ }).elements()).toHaveLength(1)
  })
})
