import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import DropdownMenuWithFilter from './story/_DropdownMenuWithFilter.vue'

describe('given DropdownMenu with Filter', () => {
  let screen: Awaited<ReturnType<typeof render>>
  const input = () => page.getByRole('searchbox')
  const inputElement = () => input().element() as HTMLInputElement
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]

  beforeEach(async () => { screen = await render(DropdownMenuWithFilter) })

  it('should render trigger button', async () => {
    await expect.element(screen.getByRole('button')).toBeInTheDocument()
  })

  describe('after opening the dropdown', () => {
    beforeEach(async () => { await screen.getByRole('button').click() })

    it('should render filter input', async () => { await expect.element(input()).toBeInTheDocument() })

    it('should have correct type and role attributes', () => {
      expect(inputElement().getAttribute('type')).toBe('text')
      expect(inputElement().getAttribute('role')).toBe('searchbox')
    })

    it('should update modelValue when typing', async () => {
      await userEvent.fill(input(), 'New')
      expect(inputElement().value).toBe('New')
    })

    it('should filter menu items based on input', async () => {
      expect(items().length).toBe(4)
      await userEvent.fill(input(), 'New')
      await expect.poll(() => items().length).toBe(2)
      expect(items()[0]?.textContent).toContain('New Tab')
      expect(items()[1]?.textContent).toContain('New Window')
    })

    it('should handle ArrowDown key to navigate to items', async () => {
      await input().click()
      await userEvent.keyboard('{ArrowDown}')
      await expect.element(items()[0]).toHaveAttribute('data-highlighted')
    })

    it('should handle ArrowUp key to navigate to last item', async () => {
      await input().click()
      await userEvent.keyboard('{ArrowUp}')
      await expect.element(items().at(-1)!).toHaveAttribute('data-highlighted')
    })

    it('should handle Escape key to clear filter when not empty', async () => {
      await userEvent.fill(input(), 'test')
      expect(inputElement().value).toBe('test')
      await userEvent.keyboard('{Escape}')
      await expect.element(input()).toHaveValue('')
    })

    it('should sync aria-activedescendant with highlighted item', async () => {
      await input().click()
      await userEvent.keyboard('{ArrowDown}')
      await expect.element(items()[0]).toHaveAttribute('data-highlighted')
      const activeDescendant = inputElement().getAttribute('aria-activedescendant')
      expect(activeDescendant).toBe(items()[0].id)
    })
  })

  describe('with disabled filter', () => {
    beforeEach(async () => {
      await screen.rerender({ disabledFilter: true })
      await screen.getByRole('button').click()
    })

    it('should render disabled filter input', () => {
      expect(inputElement().hasAttribute('disabled')).toBe(true)
      expect(inputElement().getAttribute('data-disabled')).toBe('')
    })
  })

  describe('handle IME composition', () => {
    beforeEach(async () => { await screen.getByRole('button').click() })

    // Composition data, isComposing and Android preedit updates are the event
    // payloads under test. Vitest Browser Mode 4.1.10 has no composition
    // operation, so this block retains narrow synthetic events; ordinary
    // focus, typing and post-composition navigation still use browser APIs.

    it('should not update search during IME composition', async () => {
      await expect.element(input()).toBeInTheDocument()
      const baseline = items().length
      inputElement().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      inputElement().value = 'xiang'
      inputElement().dispatchEvent(new Event('input', { bubbles: true }))
      await expect.poll(() => items().length).toBe(baseline)
    })

    it('should update search after composition ends', async () => {
      await expect.element(input()).toBeInTheDocument()
      inputElement().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      inputElement().value = 'zzzzz'
      inputElement().dispatchEvent(new Event('input', { bubbles: true }))
      inputElement().dispatchEvent(new CompositionEvent('compositionend', { data: 'zzzzz', bubbles: true }))
      await expect.poll(() => items().length).toBe(0)
    })

    it('should not update search during plain-text composition off Android (desktop Pinyin preedit)', async () => {
      const baseline = items().length
      inputElement().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      inputElement().dispatchEvent(new CompositionEvent('compositionupdate', { data: 'xiang', bubbles: true }))
      inputElement().value = 'xiang'
      inputElement().dispatchEvent(new Event('input', { bubbles: true }))
      await expect.poll(() => items().length).toBe(baseline)
      expect(items().length).toBe(baseline)
    })

    describe('on Android soft keyboard', () => {
      beforeEach(() => {
        Object.defineProperty(window.navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', configurable: true })
      })
      afterEach(() => { delete (window.navigator as { userAgent?: string }).userAgent })

      it('should update search live during plain-text (autocorrect) composition', async () => {
        inputElement().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        inputElement().dispatchEvent(new CompositionEvent('compositionupdate', { data: 'New', bubbles: true }))
        inputElement().value = 'New'
        inputElement().dispatchEvent(new Event('input', { bubbles: true }))
        await expect.poll(() => items().length).toBe(2)
        expect(items().length).toBe(2)
      })

      it('should not update search during CJK IME composition until compositionend', async () => {
        const baseline = items().length
        inputElement().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        inputElement().dispatchEvent(new CompositionEvent('compositionupdate', { data: 'かんじ', bubbles: true }))
        inputElement().value = 'かんじ'
        inputElement().dispatchEvent(new Event('input', { bubbles: true }))
        expect(items().length).toBe(baseline)
        expect(items().length).toBe(baseline)
        inputElement().dispatchEvent(new CompositionEvent('compositionend', { data: 'かんじ', bubbles: true }))
        await expect.poll(() => items().length).toBe(0)
        expect(items().length).toBe(0)
      })
    })

    it('should not navigate items during IME composition (arrow keys are IME candidate navigation)', async () => {
      await input().click()
      inputElement().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      Object.defineProperty(event, 'isComposing', { value: true })
      inputElement().dispatchEvent(event)
      expect(document.querySelector('[role="menuitem"][data-highlighted]')).toBeNull()
      await expect.element(input()).toHaveFocus()
      inputElement().dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }))
      await nextTick()
      await nextTick()
      await userEvent.keyboard('{ArrowDown}')
      await expect.poll(() => document.querySelector('[role="menuitem"][data-highlighted]')).not.toBeNull()
    })
  })
})
