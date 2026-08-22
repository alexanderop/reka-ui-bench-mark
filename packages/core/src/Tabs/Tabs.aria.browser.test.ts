import type { Locator } from 'vitest/browser'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import Tabs from './story/_Tabs.vue'

// Not a port — this file complements the retained parity test with the
// accessibility-tree and IDREF contracts that attribute-by-attribute checks
// cannot express. In particular, axe can validate each attribute without
// knowing which tab the application intends to expose as selected.

async function expectTabPanelRelation(tab: Locator, panel: Locator) {
  const tabElement = tab.element()
  const panelElement = panel.element()

  await expect.element(tab).toHaveAttribute('aria-controls', panelElement.id)
  expect(document.getElementById(tabElement.getAttribute('aria-controls')!)).toBe(panelElement)

  await expect.element(panel).toHaveAttribute('aria-labelledby', tabElement.id)
  expect(document.getElementById(panelElement.getAttribute('aria-labelledby')!)).toBe(tabElement)
}

describe('given the Tabs story fixture', () => {
  it('keeps selection, the accessibility tree, and IDREF relations in sync', async () => {
    const screen = await render(Tabs)
    const account = screen.getByRole('tab', { name: 'Account', exact: true })
    const password = screen.getByRole('tab', { name: 'Password', exact: true })
    const accountPanel = screen.getByRole('tabpanel', { name: 'Account', exact: true })

    await expectTabPanelRelation(account, accountPanel)
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - tablist "Manage your account":
        - tab "Account" [selected]
        - tab "Password"
      - tabpanel "Account":
        - paragraph: Make changes to your account here. Click save when you're done.
    `)
    expect(page.getByRole('tab', { selected: true }).elements()).toHaveLength(1)
    expect(page.getByRole('tab', { selected: false }).elements()).toHaveLength(1)

    await account.click()
    await userEvent.keyboard('{ArrowRight}')

    const passwordPanel = screen.getByRole('tabpanel', { name: 'Password', exact: true })
    expect(password.element()).toBe(document.activeElement)
    await expectTabPanelRelation(password, passwordPanel)
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - tablist "Manage your account":
        - tab "Account"
        - tab "Password" [selected]
      - tabpanel "Password":
        - paragraph: Change your password here. After saving, you'll be logged out.
    `)
    expect(page.getByRole('tab', { selected: true }).elements()).toHaveLength(1)
    expect(page.getByRole('tab', { selected: false }).elements()).toHaveLength(1)
  })
})
