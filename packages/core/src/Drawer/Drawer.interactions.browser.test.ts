import type { Locator } from 'vitest/browser'
import type { SwipeDirection } from './utils'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { commands, server, userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'
import {
  DrawerContent,
  DrawerDescription,
  DrawerRoot,
  DrawerTitle,
} from '.'

const DrawerTouchHarness = defineComponent({
  components: {
    DrawerContent,
    DrawerDescription,
    DrawerRoot,
    DrawerTitle,
  },
  props: {
    direction: { type: String as () => SwipeDirection, required: true },
    onOpenChange: { type: Function, required: true },
  },
  template: `
    <DrawerRoot
      :default-open="true"
      :modal="false"
      :swipe-direction="direction"
      @update:open="onOpenChange"
    >
      <DrawerContent
        data-testid="drawer"
        style="position: fixed; top: 80px; left: 20px; width: 360px; height: 300px; background: white;"
      >
        <DrawerTitle>Touch drawer</DrawerTitle>
        <DrawerDescription>Scrollable touch arbitration fixture</DrawerDescription>
        <div
          data-testid="scrollable"
          style="height: 200px; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;"
        >
          <div data-testid="touch-target" style="height: 900px; background: linear-gradient(white, gray);" />
        </div>
      </DrawerContent>
    </DrawerRoot>
  `,
})

async function mount(direction: SwipeDirection) {
  const onOpenChange = vi.fn()
  const screen = await render(DrawerTouchHarness, { props: { direction, onOpenChange } })
  const drawer = screen.getByTestId('drawer')
  const scrollable = screen.getByTestId('scrollable')
  await expect.element(drawer).toBeInTheDocument()
  return {
    drawer,
    scrollable,
    drawerElement: await drawer.element() as HTMLElement,
    scrollElement: await scrollable.element() as HTMLElement,
    onOpenChange,
  }
}

function verticalSwipePoints(element: HTMLElement, direction: 'up' | 'down') {
  const rect = element.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const startY = direction === 'down' ? rect.top + 45 : rect.bottom - 45
  const sign = direction === 'down' ? 1 : -1
  return [10, 35, 75, 115].map(delta => ({ x, y: startY + delta * sign }))
}

async function wheelTo(scrollable: Locator, y: number) {
  await userEvent.wheel(scrollable, { delta: { y } })
}

// Vitest 4.1.10 has no native touch method. `touchSwipe` is the narrow CDP
// escape hatch documented in vitest.browser.commands.ts, and CDP touch input is
// Chromium-only. Keeping the whole suite explicitly skipped preserves the
// Firefox/WebKit comparison corpus instead of pretending their mouse input is touch.
describe.skipIf(server.browser !== 'chromium')('drawer native touch and scroll-edge arbitration', () => {
  it('dismisses downward from the top edge with trusted Chromium touch events', async () => {
    const { drawer, drawerElement, scrollElement, onOpenChange } = await mount('down')
    const touchEvents: Array<{ type: string, trusted: boolean }> = []
    const pointerEvents: Array<{ pointerType: string, trusted: boolean }> = []
    drawerElement.addEventListener('touchstart', event => touchEvents.push({ type: event.type, trusted: event.isTrusted }))
    drawerElement.addEventListener('touchend', event => touchEvents.push({ type: event.type, trusted: event.isTrusted }))
    drawerElement.addEventListener('pointerdown', event => pointerEvents.push({ pointerType: event.pointerType, trusted: event.isTrusted }))

    expect(scrollElement.scrollTop).toBe(0)
    await commands.touchSwipe(verticalSwipePoints(scrollElement, 'down'))

    await expect.poll(() => onOpenChange.mock.calls).toContainEqual([false, { reason: 'swipe' }])
    await expect.element(drawer).not.toBeInTheDocument()
    expect(touchEvents).toEqual([
      { type: 'touchstart', trusted: true },
      { type: 'touchend', trusted: true },
    ])
    expect(pointerEvents).toEqual([{ pointerType: 'touch', trusted: true }])
  })

  it('lets a downward touch scroll toward the top before allowing dismissal', async () => {
    const { drawer, scrollable, scrollElement, onOpenChange } = await mount('down')
    await wheelTo(scrollable, 240)
    await expect.poll(() => scrollElement.scrollTop).toBeGreaterThan(0)
    const before = scrollElement.scrollTop

    await commands.touchSwipe(verticalSwipePoints(scrollElement, 'down'))

    await expect.poll(() => scrollElement.scrollTop).toBeLessThan(before)
    await expect.element(drawer).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false, { reason: 'swipe' })
  })

  it('dismisses upward from the bottom edge of scrollable content', async () => {
    const { drawer, scrollable, scrollElement, onOpenChange } = await mount('up')
    await wheelTo(scrollable, 2_000)
    await expect.poll(() => scrollElement.scrollTop).toBe(scrollElement.scrollHeight - scrollElement.clientHeight)

    await commands.touchSwipe(verticalSwipePoints(scrollElement, 'up'))

    await expect.poll(() => onOpenChange.mock.calls).toContainEqual([false, { reason: 'swipe' }])
    await expect.element(drawer).not.toBeInTheDocument()
  })

  it('lets an upward touch scroll toward the bottom before allowing dismissal', async () => {
    const { drawer, scrollable, scrollElement, onOpenChange } = await mount('up')
    await wheelTo(scrollable, 240)
    await expect.poll(() => scrollElement.scrollTop).toBeGreaterThan(0)
    const before = scrollElement.scrollTop
    expect(before).toBeLessThan(scrollElement.scrollHeight - scrollElement.clientHeight)

    await commands.touchSwipe(verticalSwipePoints(scrollElement, 'up'))

    await expect.poll(() => scrollElement.scrollTop).toBeGreaterThan(before)
    await expect.element(drawer).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false, { reason: 'swipe' })
  })
})
