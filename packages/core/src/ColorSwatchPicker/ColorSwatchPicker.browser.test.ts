import type { Locator } from 'vitest/browser'
import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import ColorSwatchPicker from './story/_ColorSwatchPicker.vue'

type ColorSwatchPickerScreen = Awaited<ReturnType<typeof render<typeof ColorSwatchPicker>>>

const expectedLabels = ['red', 'red-magenta', 'violet', 'vibrant blue', 'green-cyan', 'vibrant orange', 'vibrant yellow']

describe('given default ColorSwatchPicker', () => {
  let screen: ColorSwatchPickerScreen
  let content: Locator
  let items: Locator

  beforeEach(async () => {
    screen = await render(ColorSwatchPicker)
    content = screen.getByRole('listbox')
    items = screen.getByRole('option')
  })

  it('should render the component', async () => {
    expect(screen.container.firstElementChild).toBeTruthy()
    await expect.element(content).toBeInTheDocument()
    expect(items.elements().length).toBeGreaterThan(0)
  })

  it('should have no accessibility violations', async () => {
    const results = await axe(screen.container.firstElementChild as Element)
    expect(results).toHaveNoViolations()
  })

  it('should render items with data-color attributes', async () => {
    await expect.element(items.nth(0)).toHaveAttribute('data-color', '#E5484D')
    await expect.element(items.nth(1)).toHaveAttribute('data-color', '#D6409F')
  })

  it('should set CSS variable on items', () => {
    expect(items.nth(0).element().getAttribute('style')).toContain('--reka-color-swatch-picker-item-color: #E5484D')
  })

  it('should have aria-label on items with color name', () => {
    const colorItems = screen.container.querySelectorAll('[data-color]')
    for (const [index, item] of colorItems.entries())
      expect(item.getAttribute('aria-label')).toBe(expectedLabels[index])
  })

  describe('selection', () => {
    it('should select an item on click', async () => {
      const firstItem = items.nth(0)
      const firstItemElement = firstItem.element()

      await firstItem.click()

      expect(firstItemElement.getAttribute('data-state')).toBe('checked')
    })

    it('should update selection when clicking a different item', async () => {
      const firstItem = items.nth(0)
      const thirdItem = items.nth(2)
      const firstItemElement = firstItem.element()
      const thirdItemElement = thirdItem.element()

      await firstItem.click()
      expect(firstItemElement.getAttribute('data-state')).toBe('checked')

      await thirdItem.click()
      expect(thirdItemElement.getAttribute('data-state')).toBe('checked')
      expect(firstItemElement.getAttribute('data-state')).toBe('unchecked')
    })
  })

  describe('keyboard navigation', () => {
    it('should have horizontal orientation for keyboard navigation', () => {
      expect(content.element().getAttribute('aria-orientation')).toBe('horizontal')
    })

    it('should have role=option on items', () => {
      for (const item of screen.container.querySelectorAll('[data-color]')) {
        expect(item.getAttribute('role')).toBe('option')
      }
    })
  })
})
