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
    // `<html>` (role `document`) + `/children: deep-equal`: the only shape in
    // which an extra node anywhere in the tree fails the snapshot (a directive
    // at the root of a `<body>` snapshot is ignored — see AGENTS.md).
    await expect.element(document.documentElement).toMatchAriaInlineSnapshot(`
      - document:
        - /children: deep-equal
        - text: Test
        - checkbox "Test"
    `)
    await expect.element(page.getByRole('checkbox', { checked: false })).toHaveLength(1)
    await expect.element(page.getByRole('checkbox', { checked: true })).toHaveLength(0)

    await checkbox.click()

    await expect.element(document.documentElement).toMatchAriaInlineSnapshot(`
      - document:
        - /children: deep-equal
        - text: Test
        - checkbox "Test" [checked]
    `)
    await expect.element(page.getByRole('checkbox', { checked: true })).toHaveLength(1)
    await expect.element(page.getByRole('checkbox', { checked: false })).toHaveLength(0)
  })

  it('exposes indeterminate as the mixed checked state', async () => {
    const screen = await render(Checkbox, {
      props: { modelValue: 'indeterminate' },
    })
    const checkbox = screen.getByRole('checkbox', { name: 'Test', exact: true })

    await expect.element(checkbox).toHaveAttribute('aria-checked', 'mixed')
    await expect.element(document.documentElement).toMatchAriaInlineSnapshot(`
      - document:
        - /children: deep-equal
        - text: Test
        - checkbox "Test" [checked=mixed]
    `)
    await expect.element(page.getByRole('checkbox', { checked: true })).toHaveLength(0)
    await expect.element(page.getByRole('checkbox', { checked: false })).toHaveLength(0)
  })
})
