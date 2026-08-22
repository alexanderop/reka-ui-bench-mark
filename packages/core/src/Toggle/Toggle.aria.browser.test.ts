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
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - button "Italic"
    `)
    expect(page.getByRole('button', { pressed: false }).elements()).toHaveLength(1)
    expect(page.getByRole('button', { pressed: true }).elements()).toHaveLength(0)

    await toggle.click()

    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - button "Italic" [pressed]
    `)
    expect(page.getByRole('button', { pressed: true }).elements()).toHaveLength(1)
    expect(page.getByRole('button', { pressed: false }).elements()).toHaveLength(0)
  })
})
