import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import DateField from './story/_DateField.vue'

// Not a port — no jsdom original, so `port:parity` reports this file as
// unpaired and skips it. Found by the a11y census: the fixture's
// `<Label for="date-field">` reaches only the VisuallyHidden `<input
// tabindex="-1">` that DateFieldRoot gives the `id` to (DateFieldRoot.vue:322),
// so the `role="group"` a user tabs into is unnamed and every segment is named
// only by its hardcoded `aria-label` — `'month, '`, `'day,'`, `'year, '`
// (shared/date/useDateField.ts:70,92,113; note the inconsistent spacing) —
// with no `aria-labelledby` back to the field. What an AT is handed:
// "month, spinbutton, Empty", with no field name anywhere. Clicking the label
// *does* focus the first segment (the hidden input forwards focus), which is
// why the broken naming never shows up in a click test.

describe('given the DateField story fixture', () => {
  it('exposes the label as loose text beside an unnamed group of segments', async () => {
    await render(DateField)
    // Recorded as-is so the shape an AT receives today is in the repo; when the
    // two quarantined tests below go red, this snapshot changes with them.
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - text: Label
      - group:
        - spinbutton "month,": mm
        - spinbutton "day,": dd
        - spinbutton "year,": yyyy
    `)
    const labelled = document.getElementById('date-field')!
    expect(labelled.tagName).toBe('INPUT')
    expect(labelled.getAttribute('tabindex')).toBe('-1')
  })

  // @finding DateField/DateField.aria.browser.test.ts#label-reaches-only-hidden-input
  it.fails('names the segment group after the label', async () => {
    await render(DateField)
    expect(page.getByRole('group', { name: 'Label', exact: true }).elements()).toHaveLength(1)
  })

  // @finding DateField/DateField.aria.browser.test.ts#label-reaches-only-hidden-input
  it.fails('names every segment with the field label', async () => {
    await render(DateField)
    expect(page.getByRole('spinbutton', { name: /Label/ }).elements()).toHaveLength(3)
  })
})
