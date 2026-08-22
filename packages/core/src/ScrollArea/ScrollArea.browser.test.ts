import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { commands, page, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { sleep } from '@/test'
import ScrollAreaCorner from './ScrollAreaCorner.vue'
import ScrollAreaRoot from './ScrollAreaRoot.vue'
import ScrollAreaScrollbar from './ScrollAreaScrollbar.vue'
import ScrollAreaThumb from './ScrollAreaThumb.vue'
import ScrollAreaViewport from './ScrollAreaViewport.vue'
import ScrollArea from './story/_ScrollArea.vue'

// Browser-mode port of `ScrollArea.test.ts` — the snapshot-frontier file, and
// the first port where scrolling is real. Everything the original stubbed is
// deleted:
//
//  - The prototype-wide `offsetWidth/Height` / `scrollWidth/Height` /
//    `scrollTop` overrides: the fixtures declare fixed pixel sizes (200×200
//    root, overflowing content), so Chromium computes real overflow and the
//    scrollbar/thumb geometry in the snapshots below is measured, not invented.
//    Note what the stubs did to jsdom's snapshots: with EVERY element reporting
//    500/2000, the thumb ratio was the same fiction everywhere.
//  - The corner describe's ResizeObserver mock, whose own comment says it
//    exists to "match a browser's initial dispatch" — the definition of a
//    compensating stub. The real RO dispatches for real here.
//  - `trigger('pointerenter')` / `('pointerleave')` become real mouse travel:
//    hover the component, then park the mouse outside it. Scrolling is driven
//    by a trusted wheel gesture rather than a property write plus a
//    hand-dispatched Event.
//
// Snapshots: `.browser.test.ts` gets its own `.snap` file, so the jsdom
// baselines stay untouched for diffing. The browser snapshots carry the real
// computed thumb sizes (`--reka-scroll-area-thumb-height` etc.), which the
// jsdom ones structurally could not.

describe('given default ScrollArea', () => {
  let screen: Awaited<ReturnType<typeof render<typeof ScrollArea>>>

  beforeEach(async () => {
    // Park the pointer away from where the component renders, so a cursor
    // left over the component by a previous test cannot pre-trigger the
    // hover-reveal that these tests are about.
    await commands.mouseMove(390, 5)
    screen = await render(ScrollArea)
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should render content, but not scrollbar', () => {
    expect(screen.container.firstElementChild!.outerHTML).toMatchSnapshot()
    expect(screen.container.innerHTML).not.toContain('data-orientation="vertical"')
  })

  describe('on hover', () => {
    beforeEach(async () => {
      await page.elementLocator(screen.container.firstElementChild as HTMLElement).hover()
      await sleep(100)
    })

    it('should render scrollbar', () => {
      expect(screen.container.firstElementChild!.outerHTML).toMatchSnapshot()
    })
  })
})

describe('given prop:type="always" ScrollArea', () => {
  let screen: Awaited<ReturnType<typeof render<typeof ScrollArea>>>

  beforeEach(async () => {
    await commands.mouseMove(390, 5)
    screen = await render(ScrollArea, { props: { type: 'always' } })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should render content and scrollbar', () => {
    expect(screen.container.firstElementChild!.outerHTML).toMatchSnapshot()
    expect(screen.container.innerHTML).toContain('data-orientation="vertical"')
  })
})

describe('given prop:type="scroll" ScrollArea', () => {
  let screen: Awaited<ReturnType<typeof render<typeof ScrollArea>>>

  beforeEach(async () => {
    await commands.mouseMove(390, 5)
    screen = await render(ScrollArea, { props: { type: 'scroll' } })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should render content and scrollbar', () => {
    expect(screen.container.firstElementChild!.outerHTML).toMatchSnapshot()
    expect(screen.container.innerHTML).not.toContain('data-orientation="vertical"')
  })

  describe('on scroll', () => {
    beforeEach(async () => {
      const viewport = screen.container.querySelector('[data-reka-scroll-area-viewport]') as HTMLElement
      await userEvent.wheel(page.elementLocator(viewport), { delta: { y: 40 } })
      await expect.poll(() => viewport.scrollTop).toBeGreaterThan(0)
      await expect.poll(() =>
        (screen.container.querySelector('[data-scrollbarimpl] > [data-state]') as HTMLElement | null)?.style.transform ?? '',
      ).toContain('translate3d')
    })

    it('should render scrollbar', async () => {
      await expect.poll(() => screen.container.innerHTML).toContain('data-orientation="vertical"')
      expect(screen.container.firstElementChild!.outerHTML).toMatchSnapshot()
    })
  })
})

describe('given prop:type="hover" ScrollArea with both scrollbars and a corner', () => {
  const BothScrollArea = defineComponent({
    props: ['type'],
    setup(props) {
      return () =>
        h(ScrollAreaRoot, { type: props.type, style: 'width: 200px; height: 200px; overflow: hidden;' }, () => [
          h(ScrollAreaViewport, { style: 'width: 100%; height: 100%;' }, () =>
            h('div', { style: 'width: 1000px; height: 1000px;' })),
          // A headless scrollbar has no intrinsic thickness — consumers style
          // it, and unstyled it measures 0×200 / 200×0 (probed), so the
          // corner (which sizes itself from the scrollbars) can never render.
          // The jsdom original fabricated the thickness with its
          // `offsetWidth/Height = 10` prototype stub; the port declares the
          // same 10px as real CSS. See
          // `ScrollArea/ScrollArea.test.ts#scrollbar-thickness-was-stubbed`.
          h(ScrollAreaScrollbar, { orientation: 'vertical', style: 'width: 10px;' }, () => h(ScrollAreaThumb)),
          h(ScrollAreaScrollbar, { orientation: 'horizontal', style: 'height: 10px;' }, () => h(ScrollAreaThumb)),
          h(ScrollAreaCorner, null, () => h('span', { 'data-testid': 'corner-content' })),
        ])
    },
  })

  let screen: Awaited<ReturnType<typeof render<typeof BothScrollArea>>>

  beforeEach(async () => {
    await commands.mouseMove(390, 5)
    screen = await render(BothScrollArea, { props: { type: 'hover' } })
  })

  it('keeps the corner in sync with the scrollbars across repeated hover cycles', async () => {
    const root = screen.container.firstElementChild as HTMLElement

    // 1st cycle: enter -> corner appears
    await page.elementLocator(root).hover()
    await sleep(100)
    expect(screen.container.querySelector('[data-testid="corner-content"]')).toBeTruthy()

    // leave -> scrollbars hide and the corner is removed alongside them.
    // A real leave: park the mouse outside the 200×200 component.
    await commands.mouseMove(390, 5)
    await sleep(700)
    expect(screen.container.querySelector('[data-testid="corner-content"]')).toBeFalsy()

    // 2nd cycle: enter again -> corner must re-appear (regression #2669)
    await page.elementLocator(root).hover()
    await sleep(100)
    expect(screen.container.querySelector('[data-testid="corner-content"]')).toBeTruthy()
  })
})
