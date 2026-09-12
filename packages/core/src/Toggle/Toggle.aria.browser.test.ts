import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { Toggle } from '.'

// Not a port — the parity file checks `data-state`; this file checks the role,
// accessible name, and platform `aria-pressed` state exposed to assistive
// technology before and after a real Chromium click.

describe('given a named Toggle', () => {
  it('exposes its pressed state through the button role', async () => {
    const screen = await render({
      components: { Toggle },
      template: '<Toggle aria-label="Italic">I</Toggle>',
    })
    const toggle = screen.getByRole('button', { name: 'Italic', exact: true })

    await expect.element(toggle).toHaveAccessibleName('Italic')
    // `<html>` (implicit role `document`) rather than `<body>`: a root-level
    // `/children` directive on a role-less root is silently dropped by the
    // matcher, so this is the only shape where `deep-equal` is enforced and an
    // extra node fails the test (see AGENTS.md, ARIA census).
    await expect.element(document.documentElement).toMatchAriaInlineSnapshot(`
      - document:
        - /children: deep-equal
        - button "Italic": I
    `)
    await expect.element(page.getByRole('button', { pressed: false })).toHaveLength(1)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(0)

    await toggle.click()

    await expect.element(document.documentElement).toMatchAriaInlineSnapshot(`
      - document:
        - /children: deep-equal
        - button "Italic" [pressed]: I
    `)
    await expect.element(page.getByRole('button', { pressed: true })).toHaveLength(1)
    await expect.element(page.getByRole('button', { pressed: false })).toHaveLength(0)
  })
})
