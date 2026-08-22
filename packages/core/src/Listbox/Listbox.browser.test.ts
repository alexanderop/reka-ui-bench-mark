import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, h, nextTick, ref } from 'vue'
import { handleSubmit } from '@/test'
import { ListboxContent, ListboxFilter, ListboxItem, ListboxRoot, ListboxVirtualizer } from '.'
import Listbox from './story/_Listbox.vue'

type Screen = Awaited<ReturnType<typeof render>>

function options(screen: Screen) {
  return screen.getByRole('option').elements() as HTMLElement[]
}

function optionText(option: Element) {
  return option.textContent ?? ''
}

async function tabIntoScreen(screen: Screen) {
  const sentinel = document.createElement('button')
  sentinel.textContent = 'Before listbox'
  screen.getByRole('listbox').element().before(sentinel)

  try {
    // Establish keyboard entry in this tester iframe with trusted input. Full
    // browser runs execute files in parallel, so BODY is not a stable shared
    // starting point for Tab even though it is in an isolated file run.
    await userEvent.click(sentinel)
    await userEvent.tab()
  }
  finally {
    sentinel.remove()
  }
}

/**
 * Composition payloads are the subject of these regressions. Vitest 4.1.10's
 * userEvent API cannot construct an in-progress IME transaction or choose its
 * `CompositionEvent.data`, so these tests dispatch only that unreachable
 * payload locally; ordinary text entry elsewhere uses Browser Mode APIs.
 */
async function dispatchImeEvent(input: HTMLInputElement, type: 'compositionstart' | 'compositionupdate' | 'compositionend' | 'input', data = '') {
  const event = type === 'input'
    ? new InputEvent(type, { bubbles: true, data })
    : new CompositionEvent(type, { bubbles: true, data })
  input.dispatchEvent(event)
  await nextTick()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('given default Listbox', () => {
  let screen: Screen
  let items: HTMLElement[]
  beforeEach(async () => {
    screen = await render(Listbox)
    items = options(screen)
  })

  // @finding Listbox/Listbox.test.ts#fixture-color-contrast
  it.fails('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })
  // TODO: add make sure to select first item when have ListboxFilter

  describe('when focus on content', () => {
    beforeEach(async () => {
      await tabIntoScreen(screen)
      await expect.element(items[0]).toHaveFocus()
    })

    it('should pass the focus to the first item', () => {
      expect(document.activeElement).toBe(items[0])
    })

    it('should have highlighted state on first item', () => {
      expect(items[0].getAttribute('data-highlighted')).toBe('')
    })

    it('should emit `highlight` event', () => {
      expect(screen.emitted('highlight')?.[0]?.[0]).toBeTruthy()
    })

    it('should highlight and select item when clicked', async () => {
      const item = items[2]
      await screen.getByRole('option').nth(2).click()
      expect(item.getAttribute('aria-selected')).toBe('true')
      expect(item.getAttribute('data-state')).toBe('checked')
    })

    describe('after pressing `Enter`', async () => {
      beforeEach(async () => {
        await userEvent.keyboard('{Enter}')
      })

      it('should select the highlighted item', () => {
        const item = items[0]
        expect(item.getAttribute('data-highlighted')).toBe('')
        expect(item.getAttribute('aria-selected')).toBe('true')
        expect(item.getAttribute('data-state')).toBe('checked')
      })

      it('should emit `update:modelValue` event', () => {
        expect(screen.emitted('update:modelValue')?.[0]?.[0]).toBe(optionText(items[0]))
      })

      it('should deselect after pressing `Enter`', async () => {
        await userEvent.keyboard('{Enter}')
        const item = items[0]
        expect(item.getAttribute('data-highlighted')).toBe('')
        expect(item.getAttribute('aria-selected')).toBe('false')
        expect(item.getAttribute('data-state')).toBe('unchecked')
      })

      describe('after selecting other item and press `Enter`', async () => {
        beforeEach(async () => {
          await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
        })

        it('should select the third item', () => {
          const item = items[0]
          const newItem = items[2]
          expect(item.getAttribute('aria-selected')).toBe('false')
          expect(item.getAttribute('data-state')).toBe('unchecked')
          expect(newItem.getAttribute('aria-selected')).toBe('true')
          expect(newItem.getAttribute('data-state')).toBe('checked')
        })
      })
    })
  })

  // Test: useTypeAhead
  describe('when typing letter', async () => {
    beforeEach(async () => {
      await tabIntoScreen(screen)
      await userEvent.keyboard('b')
    })

    it('should highlight text starting with B', () => {
      const item = items.find(i => optionText(i).startsWith('B'))
      expect(document.activeElement).toBe(item)
    })
  })

  describe('when selection behavior `replace`', () => {
    beforeEach(async () => {
      await screen.rerender({ selectionBehavior: 'replace' })
    })

    it('should not toggle off the selected value', async () => {
      const item = items[0]
      await screen.getByRole('option').first().click()
      await screen.getByRole('option').first().click()
      expect(document.activeElement).toBe(item)
    })

    it('should select and replace another item', async () => {
      const item = items[0]
      const newItem = items[1]
      await screen.getByRole('option').first().click()
      expect(document.activeElement).toBe(item)
      await screen.getByRole('option').nth(1).click()
      expect(document.activeElement).toBe(newItem)
    })
  })
})

describe('given a Listbox on initial mount', () => {
  let itemsReady = ref(true)
  const BelowFoldListbox = defineComponent(() => () =>
    h('div', { 'data-testid': 'scroll-host', 'tabindex': -1, 'style': 'height: 120px; overflow: auto' }, [
      h('div', { style: 'height: 360px' }),
      h(ListboxRoot, null, () =>
        h(ListboxContent, { 'aria-label': 'options', 'style': 'height: 288px' }, () =>
          itemsReady.value
            ? [h(ListboxItem, { value: 'Afghanistan' }, () => 'Afghanistan')]
            : [])),
      h('button', { type: 'button' }, 'After listbox'),
    ]))

  async function mountBelowFold(ready: boolean) {
    itemsReady = ref(ready)
    const screen = await render(BelowFoldListbox)
    // let the immediate watcher's highlight cycle resolve
    await nextTick()
    await nextTick()
    return { screen, scrollHost: screen.getByTestId('scroll-host').element() }
  }

  it('should highlight the first item without scrolling the page or stealing focus', async () => {
    const { screen, scrollHost } = await mountBelowFold(true)
    const items = options(screen)
    // the item is highlighted for keyboard entry...
    expect(items[0].getAttribute('data-highlighted')).toBe('')
    // ...but the mount highlight must not focus it or scroll it into view,
    // otherwise a Listbox below the fold scrolls the whole page on load.
    expect(scrollHost.scrollTop).toBe(0)
    expect(document.activeElement).not.toBe(items[0])
  })

  it('should focus and scroll once the user interacts', async () => {
    const { screen, scrollHost } = await mountBelowFold(false)
    // With no item mounted, Tab enters the ListboxContent itself. This is the
    // real-browser route to its entry-focus handler; after the item appears,
    // tabbing out and back lets that handler choose, focus and scroll it.
    await tabIntoScreen(screen)
    await expect.element(screen.getByRole('listbox')).toHaveFocus()
    itemsReady.value = true
    await nextTick()
    await userEvent.tab()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    const items = options(screen)
    await expect.element(items[0]).toHaveFocus()
    await expect.element(items[0]).toBeInViewport()
    expect(scrollHost.scrollTop).toBeGreaterThan(0)
  })
})

describe('given a virtualized Listbox on initial mount', () => {
  const VirtualListbox = defineComponent({
    props: { multiple: Boolean, modelValue: { type: null, default: undefined } },
    setup(props) {
      const options = Array.from({ length: 100 }, (_, i) => ({ label: `Item ${i}`, value: i }))
      return () => h(ListboxRoot, { multiple: props.multiple, modelValue: props.modelValue }, () =>
        h(ListboxContent, { style: 'height: 200px; overflow: auto' }, () =>
          h(ListboxVirtualizer, { options, textContent: (o: any) => o.label }, {
            default: ({ option }: any) => h(ListboxItem, { value: option }, () => option.label),
          })))
    },
  })

  const BelowFoldVirtualListbox = defineComponent({
    props: { multiple: Boolean, modelValue: { type: null, default: undefined } },
    setup(props) {
      return () => h('div', {
        'data-testid': 'scroll-host',
        // Chromium makes scroll containers sequentially focusable. This host
        // exists only to place the Listbox below the fold, so keep Tab entry on
        // the Listbox contract rather than adding an unrelated focus stop.
        'tabindex': -1,
        'style': 'height: 120px; overflow: auto',
      }, [
        h('div', { style: 'height: 360px' }),
        h(VirtualListbox, { multiple: props.multiple, modelValue: props.modelValue }),
      ])
    },
  })

  async function flush() {
    // watcher → nextTick → highlightSelected (await nextTick) → virtualFocusHook → rAF
    await nextTick()
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
    await nextTick()
  }

  it('should highlight the first item without scrolling the page or stealing focus', async () => {
    const screen = await render(BelowFoldVirtualListbox, { props: { multiple: true } })
    await flush()

    const items = options(screen)
    expect(items.length).toBeGreaterThan(0)
    // the first item is highlighted for keyboard entry...
    expect(items[0].getAttribute('data-highlighted')).toBe('')
    // ...but the mount highlight must not focus it or scroll, otherwise a
    // virtualized Listbox below the fold scrolls the whole page on load.
    expect(screen.getByTestId('scroll-host').element().scrollTop).toBe(0)
    expect(document.activeElement).not.toBe(items[0])
  })

  it('should highlight a pre-selected item on mount without scrolling the page or stealing focus', async () => {
    // A selected value below the fold must not pull the page to the listbox on
    // mount. The checked item is brought into the internal scroll container
    // (`scrollToIndex`) and made the roving-tabindex target, but it is neither
    // focused nor scrolled into view at the document level.
    // `modelValue` is the option object (items hold the whole option as value);
    // it matches option #3 structurally via the default `isEqual` comparison.
    const screen = await render(BelowFoldVirtualListbox, { props: { modelValue: { label: 'Item 3', value: 3 } } })
    await flush()

    const checked = screen.container.querySelector('[data-index="3"]') as HTMLElement
    expect(checked).toBeTruthy()
    // the checked item (not the first item) becomes the highlight target...
    expect(checked.getAttribute('data-highlighted')).toBe('')
    expect(screen.container.querySelector('[data-index="0"]')?.getAttribute('data-highlighted') ?? undefined).toBeUndefined()
    // ...without focusing it or scrolling the page.
    expect(screen.getByTestId('scroll-host').element().scrollTop).toBe(0)
    expect(document.activeElement).not.toBe(checked)
  })

  it('should focus and scroll the first item when the user enters the listbox', async () => {
    // Entry focus (`onEnter`) is user-driven, so focusing and scrolling the
    // first item into view is expected here — unlike the mount highlight above.
    const screen = await render(BelowFoldVirtualListbox, { props: { multiple: true } })
    await flush()
    const listbox = screen.getByRole('listbox').element()
    listbox.scrollTop = listbox.scrollHeight
    await expect.poll(() => listbox.scrollTop).toBeGreaterThan(0)
    await expect.poll(() => listbox.tabIndex).toBe(0)

    await tabIntoScreen(screen)
    await expect.element(screen.getByRole('option', { name: 'Item 0', exact: true })).toHaveFocus()
    await expect.element(screen.getByRole('option', { name: 'Item 0', exact: true })).toBeInViewport()
    await expect.poll(() => listbox.scrollTop).toBe(0)
  })
})

describe('given multiple `true` Listbox', () => {
  let screen: Screen
  let items: HTMLElement[]
  beforeEach(async () => {
    screen = await render(Listbox, { props: { multiple: true, selectionBehavior: 'toggle' } })
    await nextTick()
    items = options(screen)
    await tabIntoScreen(screen)
    await expect.element(items[0]).toHaveFocus()
  })

  it('should select multiple items', async () => {
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}{ArrowDown}{Enter}{ArrowDown}{ArrowDown}{Enter}')

    expect(items[0].getAttribute('aria-selected')).toBe('true')
    expect(items[1].getAttribute('aria-selected')).toBe('true')
    expect(items[2].getAttribute('aria-selected')).toBe('true')
    expect(items[3].getAttribute('aria-selected')).toBe('false')
    expect(items[4].getAttribute('aria-selected')).toBe('true')
  })

  it('should emit `update:modelValue` event', async () => {
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}{ArrowUp}{Enter}')
    expect(screen.emitted('update:modelValue')).toEqual([
      [[optionText(items[0])]],
      [[optionText(items[0]), optionText(items[1])]],
      [[optionText(items[1])]],
    ])
  })

  describe('when selection behavior `replace`', () => {
    beforeEach(async () => {
      await screen.rerender({ multiple: true, selectionBehavior: 'replace' })
      await screen.getByRole('option').first().click()
    })

    it('should not toggle off the selected value', async () => {
      const item = items[0]
      await screen.getByRole('option').first().click()
      expect(document.activeElement).toBe(item)
    })

    it('should select and replace another item', async () => {
      const item = items[0]
      const newItem = items[1]
      expect(document.activeElement).toBe(item)
      await screen.getByRole('option').nth(1).click()
      expect(document.activeElement).toBe(newItem)
    })

    it('should emit `update:modelValue` event', async () => {
      await userEvent.keyboard('{Enter}{ArrowDown}{Enter}')
      expect(screen.emitted('update:modelValue')).toEqual([
        [[optionText(items[0])]],
        [[optionText(items[0])]], // there's a bug here, it shouldn't emit the same value twice
        [[optionText(items[1])]],
      ])
    })

    describe('when keypress Shift + ArrowDown', () => {
      it('should select the next item', async () => {
        await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
        expect(items[0].getAttribute('aria-selected')).toBe('true')
        expect(items[1].getAttribute('aria-selected')).toBe('true')
        expect(items[2].getAttribute('aria-selected')).toBe('false')
      })

      it('should select more items', async () => {
        for (let i = 0; i <= 10; i++)
          await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
        for (let i = 0; i <= 10; i++)
          expect(items[i].getAttribute('aria-selected')).toBe('true')
      })
    })
  })
})

describe('given horizontal Listbox', () => {
  let screen: Screen
  let items: HTMLElement[]
  beforeEach(async () => {
    screen = await render(Listbox, { props: { orientation: 'horizontal' } })
    items = options(screen)
  })

  // @finding Listbox/Listbox.test.ts#fixture-color-contrast
  it.fails('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  describe('when focus on content', () => {
    beforeEach(async () => {
      await tabIntoScreen(screen)
      await expect.element(items[0]).toHaveFocus()
    })

    it('should pass the focus to the first item', () => {
      expect(document.activeElement).toBe(items[0])
    })

    it('should have highlighted state on first item', () => {
      expect(items[0].getAttribute('data-highlighted')).toBe('')
    })

    it('should emit `highlight` event', () => {
      expect(screen.emitted('highlight')?.[0]?.[0]).toBeTruthy()
    })

    it('should highlight and select item when clicked', async () => {
      const item = items[2]
      await screen.getByRole('option').nth(2).click()
      expect(item.getAttribute('aria-selected')).toBe('true')
      expect(item.getAttribute('data-state')).toBe('checked')
    })

    describe('after pressing `Enter`', async () => {
      beforeEach(async () => {
        await userEvent.keyboard('{Enter}')
      })

      it('should select the highlighted item', () => {
        const item = items[0]
        expect(item.getAttribute('data-highlighted')).toBe('')
        expect(item.getAttribute('aria-selected')).toBe('true')
        expect(item.getAttribute('data-state')).toBe('checked')
      })

      it('should emit `update:modelValue` event', () => {
        expect(screen.emitted('update:modelValue')?.[0]?.[0]).toBe(optionText(items[0]))
      })

      it('should deselect after pressing `Enter`', async () => {
        await userEvent.keyboard('{Enter}')
        const item = items[0]
        expect(item.getAttribute('data-highlighted')).toBe('')
        expect(item.getAttribute('aria-selected')).toBe('false')
        expect(item.getAttribute('data-state')).toBe('unchecked')
      })

      describe('after selecting other item and press `Enter`', async () => {
        beforeEach(async () => {
          await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}')
        })

        it('should select the third item', () => {
          const item = items[0]
          const newItem = items[2]
          expect(item.getAttribute('aria-selected')).toBe('false')
          expect(item.getAttribute('data-state')).toBe('unchecked')
          expect(newItem.getAttribute('aria-selected')).toBe('true')
          expect(newItem.getAttribute('data-state')).toBe('checked')
        })
      })
    })
  })
})

// Regression test for https://github.com/unovue/reka-ui/issues/2644
// `v-memo` on ListboxItem must invalidate when `disabled` (or
// `rootContext.focusable.value`) changes, otherwise `data-disabled` / `disabled`
// attributes go stale and the item still participates in keyboard navigation.
describe('given ListboxItem with reactive `disabled` prop', () => {
  it('should update DOM attributes when `disabled` toggles without highlight/selection change', async () => {
    const isDisabled = ref(false)
    const ReactiveDisabledListbox = defineComponent({
      setup() {
        return () =>
          h(ListboxRoot, null, {
            default: () => [
              h(ListboxItem, { value: { id: 1 }, disabled: isDisabled.value }, () => 'toggleable'),
              h(ListboxItem, { value: { id: 2 } }, () => 'other'),
            ],
          })
      },
    })

    const screen = await render(ReactiveDisabledListbox)
    const items = options(screen)

    expect(items[0].getAttribute('data-disabled') ?? undefined).toBeUndefined()
    expect(items[0].getAttribute('disabled') ?? undefined).toBeUndefined()

    isDisabled.value = true
    await nextTick()

    expect(items[0].getAttribute('data-disabled')).toBe('')
    expect(items[0].getAttribute('disabled')).toBe('')

    isDisabled.value = false
    await nextTick()

    expect(items[0].getAttribute('data-disabled') ?? undefined).toBeUndefined()
    expect(items[0].getAttribute('disabled') ?? undefined).toBeUndefined()
  })
})

describe('given Listbox in a form', async () => {
  let items: HTMLElement[]
  let screen: Screen

  beforeEach(async () => {
    handleSubmit.mockClear()
    screen = await render({
      props: ['handleSubmit'],
      components: { Listbox },
      template: '<form @submit="handleSubmit"><Listbox name="test" default-value="Afghanistan" /><button type="submit">Submit</button></form>',
    }, { props: { handleSubmit } })
    items = options(screen)
  })

  it('should have hidden input field', async () => {
    await expect.element(screen.container.querySelector('input[data-hidden]')).toBeInTheDocument()
  })

  describe('after selecting option and clicking submit button', () => {
    beforeEach(async () => {
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: optionText(items[0]) })
    })
  })

  describe('after selecting other option and click submit button again', () => {
    beforeEach(async () => {
      await screen.getByRole('option').nth(4).click()
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: optionText(items[4]) })
    })
  })
})

describe('given Listbox with ListboxFilter handling IME composition', () => {
  let input: HTMLInputElement
  let updates: string[]
  const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

  beforeEach(async () => {
    updates = []
    const search = ref('')
    const screen = await render(defineComponent({
      setup() {
        return () => h(ListboxRoot, {}, {
          default: () => [
            h(ListboxFilter, {
              'modelValue': search.value,
              'onUpdate:modelValue': (v: string) => {
                updates.push(v)
                search.value = v
              },
            }),
            h(ListboxContent, {}, {
              default: () => ['Apple', 'Banana'].map(i => h(ListboxItem, { value: i }, { default: () => i })),
            }),
          ],
        })
      },
    }))
    input = screen.container.querySelector('input')!
  })

  afterEach(() => {
    delete (window.navigator as { userAgent?: string }).userAgent
  })

  it('should not update modelValue during plain-text composition off Android (desktop Pinyin preedit)', async () => {
    await dispatchImeEvent(input, 'compositionstart')
    await dispatchImeEvent(input, 'compositionupdate', 'xiang')
    input.value = 'xiang'
    await dispatchImeEvent(input, 'input')

    expect(updates).toEqual([])
  })

  it('should update modelValue live during plain-text (autocorrect) composition on Android', async () => {
    Object.defineProperty(window.navigator, 'userAgent', { value: ANDROID_UA, configurable: true })

    await dispatchImeEvent(input, 'compositionstart')
    await dispatchImeEvent(input, 'compositionupdate', 'Br')
    input.value = 'Br'
    await dispatchImeEvent(input, 'input')

    expect(updates).toEqual(['Br'])
  })

  it('should not update modelValue during CJK IME composition on Android until compositionend', async () => {
    Object.defineProperty(window.navigator, 'userAgent', { value: ANDROID_UA, configurable: true })

    await dispatchImeEvent(input, 'compositionstart')
    await dispatchImeEvent(input, 'compositionupdate', 'かんじ')
    input.value = 'かんじ'
    await dispatchImeEvent(input, 'input')

    expect(updates).toEqual([])

    await dispatchImeEvent(input, 'compositionend')
    await nextTick()

    expect(updates).toEqual(['かんじ'])
  })
})
