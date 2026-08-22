import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import Tooltip from './stories/_Tooltip.vue'

// Not a port — the parity file checks whether visible content mounts. This file
// checks the trigger's computed accessible description and resolves the
// `aria-describedby` IDREF to the actual tooltip node through its full
// keyboard-open → Escape lifecycle.

describe('given the Tooltip story fixture', () => {
  it('adds and removes a resolved accessible description with the tooltip', async () => {
    const screen = await render(Tooltip)
    const trigger = screen.getByRole('button', { name: 'some info', exact: true })

    await expect.element(trigger).not.toHaveAccessibleDescription()
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - button "some info"
    `)

    const entry = document.createElement('input')
    ;(await trigger.element()).before(entry)
    try {
      // Start keyboard navigation inside this tester iframe. Parallel browser
      // files make BODY an unstable Tab origin; macOS WebKit's intentional
      // button-skipping convention remains an engine expectation.
      await userEvent.click(entry)
      await userEvent.tab()
    }
    finally {
      entry.remove()
    }

    expect(await trigger.element()).toBe(document.activeElement)
    await expect.element(trigger).toHaveAccessibleDescription('Add to library')
    const triggerElement = await trigger.element()
    await expect.element(trigger).toHaveAttribute('aria-describedby')
    const descriptionId = triggerElement.getAttribute('aria-describedby')!
    const tooltipElement = document.getElementById(descriptionId)
    expect(tooltipElement).toBeInstanceOf(HTMLElement)
    await expect.element(tooltipElement!).toHaveAttribute('role', 'tooltip')
    await expect.element(tooltipElement!).toHaveTextContent('Add to library')
    expect(document.getElementById(descriptionId)).toBe(tooltipElement)
    // The descriptive source uses `aria-hidden`, so it contributes to the
    // button's computed description without becoming a second tree node.
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - button "some info"
    `)

    await userEvent.keyboard('{Escape}')

    await expect.element(trigger).not.toHaveAttribute('aria-describedby')
    await expect.element(trigger).not.toHaveAccessibleDescription()
    expect(document.getElementById(descriptionId)).toBeNull()
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - button "some info"
    `)
  })
})
