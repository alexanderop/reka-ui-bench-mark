import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import ContextMenu from './story/_ContextMenu.vue'

describe('given default ContextMenu', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(ContextMenu)
  })

  it('should render trigger area', () => {
    expect(screen.container.textContent).toContain('Right click here')
  })

  describe('when RightClick', () => {
    let openPoint: { x: number, y: number }

    beforeEach(async () => {
      const trigger = screen.getByText('Right click here.', { exact: true })
      const position = { x: 100, y: 30 }
      trigger.element().addEventListener('contextmenu', (event) => {
        openPoint = { x: event.clientX, y: event.clientY }
      }, { capture: true, once: true })

      await trigger.click({ button: 'right', position })
      await expect.element(trigger).toHaveAttribute('data-state', 'open')
    })

    it('should pass axe accessibility tests', async () => {
      await expect.element(screen.getByRole('menu')).toBeVisible()
      // Chromium exercises 19 node-bearing rules, including color-contrast on
      // 12 nodes. Two rules are incomplete with nodes: aria-valid-attr-value
      // on three nodes and color-contrast on one.
      expect(await axe(document.body)).toHaveNoViolations()
    })

    it('should render the menu', async () => {
      const menu = screen.getByRole('menu')
      await expect.element(menu).toBeVisible()
      await expect.element(menu).toHaveFocus()
      expect(getComputedStyle(document.body).pointerEvents).toBe('none')

      const popperWrapper = menu.element().parentElement as HTMLElement
      await expect.poll(() => popperWrapper.style.transform).not.toBe('translate(0px, -200%)')
      const menuRect = popperWrapper.getBoundingClientRect()
      expect(menuRect.left).toBeCloseTo(openPoint.x + 5, 0)
      expect(menuRect.top).toBeCloseTo(openPoint.y, 0)

      const hitTarget = document.elementFromPoint(
        menuRect.left + menuRect.width / 2,
        menuRect.top + menuRect.height / 2,
      )
      expect(menu.element().contains(hitTarget)).toBe(true)
    })
  })
})
