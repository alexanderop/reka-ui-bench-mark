import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import Checkbox from './story/_Checkbox.vue'

// Not a port — the parity file checks rendered indicators and data attributes;
// this file pins the named checkbox role and its checked/mixed accessibility
// states as Chromium exposes them.

describe('given the Checkbox story fixture', () => {
  it('exposes its checked state through the checkbox role', async () => {
    const screen = await render(Checkbox)
    const checkbox = screen.getByRole('checkbox', { name: 'Test', exact: true })

    await expect.element(checkbox).toHaveAccessibleName('Test')
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - text: Test
      - checkbox "Test"
    `)
    expect(page.getByRole('checkbox', { checked: false }).elements()).toHaveLength(1)
    expect(page.getByRole('checkbox', { checked: true }).elements()).toHaveLength(0)

    await checkbox.click()

    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - text: Test
      - checkbox "Test" [checked]
    `)
    expect(page.getByRole('checkbox', { checked: true }).elements()).toHaveLength(1)
    expect(page.getByRole('checkbox', { checked: false }).elements()).toHaveLength(0)
  })

  it('exposes indeterminate as the mixed checked state', async () => {
    const screen = await render(Checkbox, {
      props: { modelValue: 'indeterminate' },
    })
    const checkbox = screen.getByRole('checkbox', { name: 'Test', exact: true })

    await expect.element(checkbox).toHaveAttribute('aria-checked', 'mixed')
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - text: Test
      - checkbox "Test" [checked=mixed]
    `)
    expect(page.getByRole('checkbox', { checked: true }).elements()).toHaveLength(0)
    expect(page.getByRole('checkbox', { checked: false }).elements()).toHaveLength(0)
  })
})
