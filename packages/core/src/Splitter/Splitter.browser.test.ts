import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from '.'
import Splitter from './story/_Splitter.vue'

function waitForObservedWidth(element: HTMLElement, expectedWidth: number) {
  return new Promise<void>((resolve) => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined && Math.abs(width - expectedWidth) < 0.1) {
        observer.disconnect()
        resolve()
      }
    })
    observer.observe(element)
  })
}

// Simple a11y test for now
describe('test splitter functionalities', () => {
  it('should pass axe accessibility tests', async () => {
    const screen = await render(Splitter)
    const fixture = screen.container.firstElementChild as HTMLElement
    expect(await axe(fixture, {
      rules: {
        'label': { enabled: false },
        'nested-interactive': { enabled: false },
      },
    })).toHaveNoViolations()
  })
})

// Regression test for https://github.com/unovue/reka-ui/issues/2509
// Bug 1: nested sizeUnit="px" group ignores defaultSize due to a ResizeObserver
// timing issue where the inner group is measured before the outer group's flex
// layout completes, producing a near-zero container size at initialization.
describe('nested px SplitterGroup layout re-initialization (issue #2509)', () => {
  it('should re-initialize layout when container grows from a tiny initial size', async () => {
    // Start with no panels and a genuinely tiny laid-out group. Panels mount
    // only after Chromium's ResizeObserver has delivered that first width,
    // recreating the production ordering without replacing the observer.
    const layouts: number[][] = []
    const TestComponent = defineComponent({
      setup() {
        const groupWidth = ref(3.45)
        const showPanels = ref(false)

        return () => h('div', [
          h('button', {
            onClick: () => showPanels.value = true,
            type: 'button',
          }, 'Show panels'),
          h('button', {
            onClick: () => groupWidth.value = 923,
            type: 'button',
          }, 'Grow group'),
          h(SplitterGroup, {
            'data-testid': 'group',
            'direction': 'horizontal',
            'onLayout': (layout: number[]) => layouts.push(layout),
            'style': { height: '600px', width: `${groupWidth.value}px` },
          }, () => showPanels.value
            ? [
                h(SplitterPanel, {
                  defaultSize: 200,
                  id: 'sidebar',
                  minSize: 100,
                  sizeUnit: 'px',
                }),
                h(SplitterResizeHandle),
                h(SplitterPanel, { id: 'content' }),
              ]
            : []),
        ])
      },
    })

    const screen = await render(TestComponent)
    const group = screen.getByTestId('group').element()
    await waitForObservedWidth(group, 3.45)

    await screen.getByRole('button', { name: 'Show panels', exact: true }).click()
    expect(screen.container.querySelector('#sidebar')).not.toBeNull()

    const observedGrowth = waitForObservedWidth(group, 923)
    await screen.getByRole('button', { name: 'Grow group', exact: true }).click()
    await observedGrowth

    // Wait on the externally visible layout emission caused by the native
    // observer, then retain the original exact synchronous assertions.
    await expect.poll(() => layouts.at(-1)?.[0]).toBeCloseTo(200, 0)
    expect(layouts.at(-1)).toHaveLength(2)
    expect(layouts.length).toBeGreaterThan(0)

    const lastLayout = layouts.at(-1)!
    expect(lastLayout[0]).toBeCloseTo(200, 0)
    expect(lastLayout[1]).toBeGreaterThan(50)
  })

  // Regression test: with sizeUnit="px" the panel is visually collapsed but
  // data-state stays "expanded". px constraints are converted px→% and the
  // layout renormalized to sum to 100, so panelSize drifts from collapsedSize
  // by a float epsilon and the old strict `===` comparison failed.
  it('should set data-state="collapsed" for a collapsed px panel', async () => {
    const layouts: number[][] = []
    const TestComponent = defineComponent({
      setup() {
        const showPanels = ref(false)
        const sidebar = ref<{ collapse: () => void } | null>(null)

        return () => h('div', [
          h('button', {
            onClick: () => showPanels.value = true,
            type: 'button',
          }, 'Show panels'),
          h('button', {
            onClick: () => sidebar.value?.collapse(),
            type: 'button',
          }, 'Collapse sidebar'),
          h(SplitterGroup, {
            'data-testid': 'group',
            'direction': 'horizontal',
            'onLayout': (layout: number[]) => layouts.push(layout),
            'style': { height: '600px', width: '923px' },
          }, () => showPanels.value
            ? [
                h(SplitterPanel, {
                  ref: sidebar,
                  collapsedSize: 80,
                  collapsible: true,
                  defaultSize: 300,
                  id: 'sidebar',
                  minSize: 150,
                  sizeUnit: 'px',
                }),
                h(SplitterResizeHandle),
                h(SplitterPanel, { id: 'content' }),
              ]
            : []),
        ])
      },
    })

    const screen = await render(TestComponent)
    const group = screen.getByTestId('group').element()
    await waitForObservedWidth(group, 923)
    await screen.getByRole('button', { name: 'Show panels', exact: true }).click()

    const sidebar = screen.container.querySelector('#sidebar') as HTMLElement
    expect(sidebar.getAttribute('data-state')).toBe('expanded')

    // The initialized pixel layout is the causal precondition: unlike waiting
    // one animation frame, this proves the group has processed its real size.
    await expect.poll(() => layouts.at(-1)?.[0]).toBeCloseTo(300, 0)
    await screen.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
    expect(sidebar.getAttribute('data-state')).toBe('collapsed')
  })
})
