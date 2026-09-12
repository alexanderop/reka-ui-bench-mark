import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { commands, page, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { PARK } from '@/test'
import ScrollAreaRoot from './ScrollAreaRoot.vue'
import ScrollAreaScrollbar from './ScrollAreaScrollbar.vue'
import ScrollAreaThumb from './ScrollAreaThumb.vue'
import ScrollAreaViewport from './ScrollAreaViewport.vue'

const ScrollAreaInteractionFixture = defineComponent({
  props: {
    type: {
      type: String as () => 'always' | 'glimpse',
      default: 'always',
    },
  },
  setup(props) {
    return () => h(ScrollAreaRoot, {
      'type': props.type,
      // Coverage instrumentation can make one assertion turn exceed 60ms;
      // keep the glimpse visible long enough to observe without changing the
      // state-machine contract, then poll its delayed hide below.
      'scrollHideDelay': 300,
      'data-testid': 'root',
      'style': 'width: 200px; height: 200px; overflow: hidden;',
    }, () => [
      h(ScrollAreaViewport, {
        'data-testid': 'viewport',
        'style': 'width: 100%; height: 100%;',
      }, () => h('div', { style: 'height: 1000px; width: 100%;' }, 'Scrollable content')),
      h(ScrollAreaScrollbar, {
        'orientation': 'vertical',
        'data-testid': 'scrollbar',
        'style': 'width: 12px;',
      }, () => h(ScrollAreaThumb, {
        'data-testid': 'thumb',
        'style': 'background: black;',
      })),
    ])
  },
})

describe('scrollArea browser interactions', () => {
  beforeEach(async () => {
    await commands.mouseMove(PARK.x, PARK.y)
  })

  it('scrolls with a native wheel gesture over the custom scrollbar', async () => {
    await render(ScrollAreaInteractionFixture)
    const viewport = page.getByTestId('viewport').element() as HTMLElement
    const thumb = page.getByTestId('thumb').element() as HTMLElement
    const initialTransform = thumb.style.transform

    await userEvent.wheel(page.getByTestId('scrollbar'), { delta: { y: 120 } })

    await expect.poll(() => viewport.scrollTop).toBeGreaterThan(0)
    await expect.poll(() => thumb.style.transform).not.toBe(initialTransform)
  })

  it('drags the thumb with real held pointer input and owns pointer capture', async () => {
    await render(ScrollAreaInteractionFixture)
    const viewport = page.getByTestId('viewport').element() as HTMLElement
    const thumb = page.getByTestId('thumb').element() as HTMLElement
    await expect.poll(() => thumb.getBoundingClientRect().height).toBeGreaterThan(0)

    const rect = thumb.getBoundingClientRect()
    let pointerId = -1
    thumb.addEventListener('pointerdown', event => pointerId = event.pointerId, { once: true })

    await commands.mouseDown(rect.left + rect.width / 2, rect.top + rect.height / 2)
    try {
      expect(pointerId).toBeGreaterThanOrEqual(0)
      expect(thumb.hasPointerCapture(pointerId)).toBe(true)
      expect(document.body.style.webkitUserSelect).toBe('none')
      expect(viewport.style.scrollBehavior).toBe('auto')

      await commands.mouseMove(rect.left + rect.width / 2, rect.top + rect.height / 2 + 80)
      await expect.poll(() => viewport.scrollTop).toBeGreaterThan(0)
      await expect.poll(() => thumb.style.transform).toContain('translate3d')
    }
    finally {
      await commands.mouseUp()
    }

    expect(thumb.hasPointerCapture(pointerId)).toBe(false)
    expect(document.body.style.webkitUserSelect).toBe('')
    expect(viewport.style.scrollBehavior).toBe('')
  })

  it('shows and hides the glimpse scrollbar for pointer and scroll state', async () => {
    await render(ScrollAreaInteractionFixture, { props: { type: 'glimpse' } })
    const root = page.getByTestId('root')
    const viewport = page.getByTestId('viewport')

    await expect.poll(() => page.getByTestId('scrollbar').elements().length).toBe(0)

    await root.hover()
    await expect.element(page.getByTestId('scrollbar')).toHaveAttribute('data-state', 'visible')

    await commands.mouseMove(PARK.x, PARK.y)
    await expect.poll(() => page.getByTestId('scrollbar').elements().length).toBe(0)

    await userEvent.wheel(viewport, { delta: { y: 80 } })
    await expect.element(page.getByTestId('scrollbar')).toHaveAttribute('data-state', 'visible')
    await expect.poll(() => page.getByTestId('scrollbar').elements().length).toBe(0)
  })
})
