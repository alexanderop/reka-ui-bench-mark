import type { Locator } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import { handleSubmit } from '@/test'
import Autocomplete from './story/_Autocomplete.vue'

// IME composition is the event payload under test in this block. The installed
// Vitest Browser Mode 4.1.10 `UserEvent` interface has no composition operation,
// so these otherwise-unreachable events stay synthetic and are kept in this
// narrow helper. All ordinary entry, clicks and keys below use browser locators.
const ime = {
  async composition(
    input: HTMLInputElement,
    type: 'compositionstart' | 'compositionupdate' | 'compositionend',
    { data = '', value }: { data?: string, value?: string } = {},
  ) {
    if (value !== undefined)
      input.value = value
    input.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }))
    await nextTick()
  },
  async input(input: HTMLInputElement, value: string) {
    input.value = value
    input.dispatchEvent(new InputEvent('input', { data: value, bubbles: true }))
    await nextTick()
  },
}

describe('given default Autocomplete', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Autocomplete>>>
  let input: Locator

  const inputElement = () => input.element() as HTMLInputElement
  const listbox = () => screen.getByRole('listbox')

  beforeEach(async () => {
    screen = await render(Autocomplete, { })
    input = screen.getByRole('combobox')
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should show placeholder', () => {
    expect(screen.container.innerHTML).toContain('Placeholder...')
  })

  it('should have empty modelValue initially', async () => {
    await expect.element(input).toHaveValue('')
  })

  describe('opening the popup', () => {
    beforeEach(async () => {
      await screen.getByRole('button').click()
      await nextTick()
    })

    // @finding Autocomplete/Autocomplete.test.ts#open-color-contrast
    it.fails('should pass axe accessibility tests', async () => {
      expect(await axe(screen.container.firstElementChild!, {
        rules: {
          'aria-required-children': { enabled: false },
        },
      })).toHaveNoViolations()
    })

    it('should show the popup content', () => {
      expect(screen.container.innerHTML).toContain('Apple')
    })

    it('should keep input text on close (resetSearchTermOnBlur defaults to false)', async () => {
      await input.fill('Testing')
      await userEvent.keyboard('{Escape}')
      await expect.element(input).toHaveValue('Testing')
    })

    it('should keep typed text as modelValue even when resetSearchTermOnBlur is true', async () => {
      // In Autocomplete, typing immediately sets the modelValue, so reset only clears
      // the internal filter state — the input still reflects the modelValue.
      const w = await render(Autocomplete, { props: { resetSearchTermOnBlur: true } })
      const newInput = page.elementLocator(w.container.querySelector('input')!)
      await page.elementLocator(w.container.querySelector('button')!).click()
      await newInput.fill('Testing')
      await userEvent.keyboard('{Escape}')
      // Complete the blur contract with a native Tab. The reset hook runs from
      // the close watcher on a short timer; Escape alone leaves the input focused.
      await userEvent.tab()
      await expect.element(newInput).not.toHaveFocus()
      // Input should still show the modelValue (typed text IS the value)
      await expect.element(newInput).toHaveValue('Testing')
    })

    describe('after selecting a value', () => {
      beforeEach(async () => {
        await screen.getByRole('option').nth(1).click()
        await nextTick()
      })

      it('should fill the input with the selected item text', async () => {
        await expect.element(input).toHaveValue('Banana')
      })

      it('should close the popup', () => {
        const group = screen.container.querySelector('[role=group]')
        expect(group).toBeFalsy()
      })

      it('should emit `update:modelValue` with the text value', () => {
        expect(screen.emitted('update:modelValue')?.[0]?.[0]).toBe('Banana')
      })

      describe('after opening the popup again', () => {
        beforeEach(async () => {
          await screen.getByRole('button').click()
          await nextTick()
        })

        it('should still show the selected text in the input', async () => {
          await expect.element(input).toHaveValue('Banana')
        })
      })
    })

    describe('typing free-form text', () => {
      beforeEach(async () => {
        await input.fill('Custom text')
      })

      it('should emit `update:modelValue` with the typed text', () => {
        const emitted = screen.emitted('update:modelValue')
        const lastEmit = emitted.at(-1)?.[0]
        expect(lastEmit).toBe('Custom text')
      })

      it('should keep the typed text after closing', async () => {
        await userEvent.keyboard('{Escape}')
        await expect.element(input).toHaveValue('Custom text')
      })
    })

    describe('handle IME composition', () => {
      it('should not filter during composition', async () => {
        await ime.composition(inputElement(), 'compositionstart')
        await ime.input(inputElement(), 'x')
        const content = listbox()
        await expect.element(content).not.toHaveAttribute('data-empty')
        const visibleItems = screen.getByRole('option').elements()
        expect(visibleItems.length).toBeGreaterThan(0)
      })

      it('should filter after composition ends', async () => {
        await ime.composition(inputElement(), 'compositionstart')
        await ime.input(inputElement(), 'xiang')
        await ime.composition(inputElement(), 'compositionend', { value: 'zzzzz' })
        const content = listbox()
        await expect.element(content).toHaveAttribute('data-empty')
      })

      it('should not update modelValue during composition', async () => {
        const emittedBefore = screen.emitted('update:modelValue')?.length ?? 0
        await ime.composition(inputElement(), 'compositionstart')
        await ime.input(inputElement(), 'x')
        const emittedAfter = screen.emitted('update:modelValue')?.length ?? 0
        expect(emittedAfter).toBe(emittedBefore)
      })

      it('should update modelValue after composition ends', async () => {
        await ime.composition(inputElement(), 'compositionstart')
        await ime.composition(inputElement(), 'compositionend', { value: '香' })
        const emitted = screen.emitted('update:modelValue')
        const lastEmit = emitted.at(-1)?.[0]
        expect(lastEmit).toBe('香')
      })

      it('should not filter during plain-text composition off Android (desktop Pinyin preedit)', async () => {
        await ime.composition(inputElement(), 'compositionstart')
        await ime.composition(inputElement(), 'compositionupdate', { data: 'xiang' })
        await ime.input(inputElement(), 'xiang')
        const content = listbox()
        await expect.element(content).not.toHaveAttribute('data-empty')
      })

      describe('on Android soft keyboard', () => {
        beforeEach(() => {
          Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
            configurable: true,
          })
        })

        afterEach(() => {
          delete (window.navigator as { userAgent?: string }).userAgent
        })

        it('should filter and update modelValue live during plain-text (autocorrect) composition', async () => {
          await ime.composition(inputElement(), 'compositionstart')
          await ime.composition(inputElement(), 'compositionupdate', { data: 'zzzzz' })
          await ime.input(inputElement(), 'zzzzz')

          const content = listbox()
          await expect.element(content).toHaveAttribute('data-empty')
          expect(screen.emitted('update:modelValue')?.at(-1)?.[0]).toBe('zzzzz')
        })

        it('should not filter during CJK IME composition until compositionend', async () => {
          const emittedBefore = screen.emitted('update:modelValue')?.length ?? 0
          await ime.composition(inputElement(), 'compositionstart')
          await ime.composition(inputElement(), 'compositionupdate', { data: 'かんじ' })
          await ime.input(inputElement(), 'かんじ')

          await expect.element(listbox()).not.toHaveAttribute('data-empty')
          expect(screen.emitted('update:modelValue')?.length ?? 0).toBe(emittedBefore)

          await ime.composition(inputElement(), 'compositionend')
          await nextTick()

          await expect.element(listbox()).toHaveAttribute('data-empty')
          expect(screen.emitted('update:modelValue')?.at(-1)?.[0]).toBe('かんじ')
        })
      })
    })

    describe('data-empty attribute on content', () => {
      it('should not have data-empty when items match', async () => {
        await expect.element(listbox()).not.toHaveAttribute('data-empty')
      })

      it('should have data-empty when no items match the filter', async () => {
        await input.fill('zzzzz')
        await expect.element(listbox()).toHaveAttribute('data-empty')
      })

      it('should remove data-empty when items match again', async () => {
        await input.fill('zzzzz')
        const content = listbox()
        await expect.element(content).toHaveAttribute('data-empty')

        await input.fill('App')
        await expect.element(content).not.toHaveAttribute('data-empty')
      })
    })
  })
})

describe('given autocomplete in a form', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render({
      props: ['handleSubmit'],
      components: { Autocomplete },
      template: '<form @submit="handleSubmit"><Autocomplete /><button type="submit">Submit</button></form>',
    }, {
      props: { handleSubmit },
    })
  })

  it('should have hidden input field', () => {
    expect(screen.container.querySelector('input[data-hidden]')).toBeTruthy()
  })

  describe('after selecting option and clicking submit button', () => {
    beforeEach(async () => {
      await screen.getByRole('button').first().click()
      await screen.getByRole('option').nth(1).click()
      await screen.getByRole('button', { name: 'Submit', exact: true }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: 'Banana' })
    })
  })
})
