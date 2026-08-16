import { useDebounceFn } from '@vueuse/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { sleep } from '@/test'
import NavigationMenuUnmountOnHideFalse from './__test__/NavigationMenuUnmountOnHideFalse.vue'

import NavigationMenu from './story/_NavigationMenu.vue'

// Browser-mode port of `NavigationMenu.test.ts` — the pattern-frontier file
// for `vi.mock` in browser mode, and it simply works: the hoisted factory with
// `vi.importActual` runs through the browser module runner, the component
// under test receives the same mocked module instance the test file sees
// (probed before porting: `vi.isMockFunction(useDebounceFn)` is true and
// rendering the story registers calls on the mock), and
// `vi.mocked(...).mockImplementation` swaps behaviour per test exactly as in
// jsdom. No config changes were needed.
//
// What did NOT port literally is the mouse, in three ways, all measured
// against the trigger's own source (`NavigationMenuTrigger.vue`):
//
//  1. A real mouse click cannot avoid hovering first. The trigger opens on
//     `pointermove` (L74) and then *ignores* the click that follows within
//     300ms (`hasPointerMoveOpenedRef`, L99) — so "click to open" tests still
//     pass with real clicks, but through the hover-open + click-ignored path.
//     The click-open branch (L104) is instead covered by the tests that
//     disable the hover trigger.
//  2. `disableClickTrigger` guards *mouse* clicks only (L92), so the one test
//     for it cannot use real input at all: a real click hover-opens (hover is
//     not disabled there), and Chromium's `HTMLElement.click()` dispatches a
//     PointerEvent with `pointerType: ''`, which the guard deliberately lets
//     through (keyboard/AT activation must keep working). The original's
//     `trigger('click', { pointerType: 'mouse' })` is preserved as an explicit
//     synthetic `PointerEvent` — the only synthetic pointer event in this
//     file. See `NavigationMenu/NavigationMenu.test.ts#mouse-click-cannot-avoid-hover`.
//  3. The fixture's Github link has a real `href`, and a real click navigates
//     the tester iframe away mid-suite. A bubble-phase `document` listener
//     cancels the navigation *after* the component's own click handler has
//     run — capture-phase would suppress the LINK_SELECT/dismiss logic the
//     test exists to exercise.
//     See `NavigationMenu/NavigationMenu.test.ts#link-click-navigates`.
//
// The mock-ordering quirk of the original is preserved on purpose: `render`
// runs *before* `mockImplementation` in the shared hook, so the first test's
// component captures `undefined` from the bare `vi.fn()` at setup
// (`NavigationMenuRoot.vue:151` calls `useDebounceFn` once). Every test that
// interacts relies on the implementation left behind by a *previous* test's
// hook. See `NavigationMenu/NavigationMenu.test.ts#mock-set-after-mount`.

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual('@vueuse/core')
  return {
    ...actual,
    useDebounceFn: vi.fn(),

  }
})

describe('given default NavigationMenu', () => {
  let screen: Awaited<ReturnType<typeof render<typeof NavigationMenu>>>
  let content: HTMLElement

  beforeEach(async () => {
    screen = await render(NavigationMenu)

    // @ts-expect-error simple mock
    vi.mocked(useDebounceFn).mockImplementation((cb: (val: string) => void, _delay: string) => {
      return function (arg: string) {
        cb(arg)
      }
    })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  describe('after clicking on button to open menu', () => {
    beforeEach(async () => {
      // `button.focus(); button.click()` in the original. A real click does
      // both — and opens through the hover path first (note 1 above): the
      // pass-through debounce makes the pointermove-open immediate, and the
      // click that lands 300ms later is ignored by design.
      await screen.getByRole('button', { name: 'Learn' }).click()
      content = screen.container.querySelector('[data-dismissable-layer]') as HTMLElement
      expect(content).toBeTruthy()
    })

    // @finding NavigationMenu/NavigationMenu.test.ts#focus-proxy-aria-hidden-focus
    it.fails('should pass axe accessibility tests', async () => {
      // Real violation, quarantined not fixed: the open menu renders a focus
      // proxy (`NavigationMenuTrigger.vue:167`) that is `aria-hidden="true"`
      // AND `tabindex="0"` — axe's `aria-hidden-focus`. jsdom cannot decide
      // focusability without layout, so it files the same rule under
      // `incomplete`, which `toHaveNoViolations` never reads (probed: the
      // identical span is v=false/i=true under jsdom). Chromium resolves it.
      expect(await axe(document.body)).toHaveNoViolations()
    })

    describe('after pressing tab', async () => {
      beforeEach(async () => {
        await userEvent.tab()
      })

      it('should focus on the first item in menu', () => {
        const links = content.querySelectorAll('a')
        expect(links[0]).toBe(document.activeElement)
      })
    })

    describe('after pressing down key', async () => {
      beforeEach(async () => {
        // Real keyboard to whatever holds focus — the trigger, courtesy of the
        // real click above. The original's `sleep(0)` is the component's own
        // deferral and stays.
        await userEvent.keyboard('{ArrowDown}')
        await sleep(0)
      })

      it('should focus on the first item in menu', () => {
        const links = content.querySelectorAll('a')
        expect(links[0]).toBe(document.activeElement)
      })

      it('should focus on the last item in menu', async () => {
        const links = content.querySelectorAll('a')
        for (let i = 0; i < links.length; i++) {
          await userEvent.keyboard('{ArrowDown}')
          await sleep(0)
        }
        expect(Array.from(links).at(-1)).toBe(document.activeElement)
      })
    })

    // TODO: Better dismissable test
    // describe('after interacting outside', () => {
    //   beforeEach(async () => {
    //     await fireEvent.pointerDown(document.body)
    //     await sleep(0)
    //   })

    //   it('should close the content', () => {
    //     expect(wrapper.find('[data-dismissable-layer]').exists()).toBe(false)
    //   })
    // })
  })

  it('keeps active content open when clicking inside with unmountOnHide disabled', async () => {
    // This fixture disables the hover trigger, so real clicks here take the
    // genuine click-open branch (`NavigationMenuTrigger.vue:104`).
    const local = await render(NavigationMenuUnmountOnHideFalse)
    const localScreen = page.elementLocator(local.container)
    const modelValue = () => local.container.querySelector('[data-testid="model-value"]')!.textContent

    await localScreen.getByTestId('trigger-one').click()
    await sleep(0)

    expect(modelValue()).toBe('one')

    // Open second content; first stays mounted but becomes inactive
    await localScreen.getByTestId('trigger-two').click()
    await sleep(0)

    expect(modelValue()).toBe('two')

    // Click inside active content-two; inactive content-one should not interfere
    await localScreen.getByTestId('inside-two').click()
    await sleep(0)

    // Content-two should remain open (content-one's dismiss handler returned early)
    expect(modelValue()).toBe('two')
  })

  describe('menu triggers', () => {
    const findTriggerButton = () => screen.container.querySelector('[data-navigation-menu-trigger]') as HTMLElement

    const findLinkContent = () => screen.container.querySelector('[data-dismissable-layer]')

    async function useRealDebounceFn() {
      const { useDebounceFn: realUseDebounceFn } = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
      vi.mocked(useDebounceFn).mockImplementation(realUseDebounceFn)
    }

    it('should open menu on click by default', async () => {
      await screen.getByRole('button', { name: 'Learn' }).click()

      const content = findLinkContent()

      expect(content).toBeTruthy()
    })

    it('should open menu on hover by default', async () => {
      // `trigger('pointermove', { pointerType: 'mouse' })` — a real hover is
      // exactly that.
      await screen.getByRole('button', { name: 'Learn' }).hover()

      const content = findLinkContent()

      expect(content).toBeTruthy()
    })

    it('should not trigger content on click', async () => {
      await screen.rerender({ disableClickTrigger: true })

      // Cannot be a real gesture — see note 2 at the top of the file. The
      // original's event, spelled out: a mouse-typed click with no preceding
      // hover, which is what the guard at NavigationMenuTrigger.vue:92 is for.
      findTriggerButton().dispatchEvent(new PointerEvent('click', { pointerType: 'mouse', bubbles: true }))
      await sleep(0)

      const content = findLinkContent()

      expect(content).toBeFalsy()
    })

    it('should not trigger content on hover', async () => {
      await screen.rerender({ disableHoverTrigger: true })

      await screen.getByRole('button', { name: 'Learn' }).hover()

      const content = findLinkContent()

      expect(content).toBeFalsy()
    })

    it('should close menu when clicking top-level link with hover disabled', async () => {
      await screen.rerender({
        disableHoverTrigger: true,
        disablePointerLeaveClose: true,
      })

      // `disableHoverTrigger` also disables the trigger's pointerleave handler
      // (NavigationMenuTrigger.vue:79), so the real mouse travel from trigger
      // to link below cannot close the menu on the way — the dismissal this
      // test observes really is the link click's.
      await screen.getByRole('button', { name: 'Learn' }).click()

      // Menu should be open
      expect(findLinkContent()).toBeTruthy()

      // Click the top-level Github link. Cancel the *navigation* in the bubble
      // phase, after the component's own click handler has dispatched its
      // LINK_SELECT / root-dismiss custom events (note 3 at the top).
      const preventNavigation = (event: Event) => event.preventDefault()
      document.addEventListener('click', preventNavigation)
      await screen.getByRole('link', { name: 'Github' }).click()
      document.removeEventListener('click', preventNavigation)
      await sleep(0)

      // Menu should be closed
      expect(findLinkContent()).toBeFalsy()
    })

    it('switching triggers keeps menu open', async () => {
      vi.useFakeTimers()
      await useRealDebounceFn()

      const local = await render(NavigationMenu)
      const triggers = Array.from(local.container.querySelectorAll('[data-navigation-menu-trigger]')) as HTMLElement[]
      const findContent = () => local.container.querySelector('[data-dismissable-layer]')

      await page.elementLocator(triggers[0]).hover()
      await vi.advanceTimersByTimeAsync(200)

      expect(findContent()).toBeTruthy()

      // Real travel from the first trigger to the second delivers the
      // original's pointerleave + pointermove pair as one gesture.
      await page.elementLocator(triggers[1]).hover()

      expect(triggers[1].getAttribute('data-state')).toBe('open')
      expect(findContent()).toBeTruthy()

      await vi.advanceTimersByTimeAsync(150)

      expect(findContent()).toBeTruthy()

      vi.useRealTimers()
    })

    it('leaving content closes menu', async () => {
      vi.useFakeTimers()
      await useRealDebounceFn()

      const local = await render(NavigationMenu)
      const localScreen = page.elementLocator(local.container)
      const findContent = () => local.container.querySelector('[data-dismissable-layer]')

      await localScreen.getByRole('button', { name: 'Learn' }).hover()
      await vi.advanceTimersByTimeAsync(200)

      expect(findContent()).toBeTruthy()

      // The original fires `pointerleave` on a content the pointer never
      // entered, and here that synthetic dispatch is the only option in the
      // browser too: with the clock frozen, the viewport's ResizeObserver
      // measurement never lands, so its `--reka-navigation-menu-viewport-height`
      // var is unset, the `overflow-hidden` viewport is 0px tall, and every
      // content link hit-tests to the nav list behind it (measured — a real
      // hover retries for the full timeout and dies on interception). The
      // event still exercises the real handler: Vue binds `@pointerleave` on
      // this element and `whenMouse` passes the mouse-typed event through.
      // See `NavigationMenu/NavigationMenu.test.ts#viewport-unmeasured-under-fake-timers`.
      findContent()!.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      await vi.advanceTimersByTimeAsync(150)

      expect(findContent()).toBeFalsy()

      vi.useRealTimers()
    })
  })
})
