import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { commands, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from '.'

const handleStyle = {
  flex: '0 0 8px',
  width: '8px',
}

const TwoPanelSplitter = defineComponent({
  setup() {
    return () => [
      h('button', { type: 'button' }, 'Before splitter'),
      h(SplitterGroup, {
        'data-testid': 'group',
        'direction': 'horizontal',
        'keyboardResizeBy': 10,
        'style': { height: '120px', width: '400px' },
      }, () => [
        h(SplitterPanel, {
          'data-testid': 'primary',
          'defaultSize': 50,
          'id': 'primary',
          'maxSize': 80,
          'minSize': 20,
        }, () => 'Primary'),
        h(SplitterResizeHandle, {
          'aria-label': 'Resize primary panel',
          'data-testid': 'primary-handle',
          'id': 'primary-handle',
          'style': handleStyle,
        }),
        h(SplitterPanel, {
          'data-testid': 'secondary',
          'defaultSize': 50,
          'id': 'secondary',
          'maxSize': 80,
          'minSize': 20,
        }, () => 'Secondary'),
      ]),
    ]
  },
})

const CollapsibleSplitter = defineComponent({
  setup() {
    return () => [
      h('button', { type: 'button' }, 'Before splitter'),
      h(SplitterGroup, {
        direction: 'horizontal',
        style: { height: '120px', width: '400px' },
      }, () => [
        h(SplitterPanel, {
          'data-testid': 'primary',
          'collapsedSize': 0,
          'collapsible': true,
          'defaultSize': 50,
          'id': 'primary',
          'minSize': 20,
        }, () => 'Primary'),
        h(SplitterResizeHandle, {
          'aria-label': 'Resize primary panel',
          'data-testid': 'primary-handle',
          'id': 'primary-handle',
          'style': handleStyle,
        }),
        h(SplitterPanel, {
          defaultSize: 50,
          id: 'secondary',
        }, () => 'Secondary'),
      ]),
    ]
  },
})

const ThreePanelSplitter = defineComponent({
  setup() {
    return () => [
      h('button', { type: 'button' }, 'Before splitter'),
      h(SplitterGroup, {
        direction: 'horizontal',
        style: { height: '120px', width: '400px' },
      }, () => [
        h(SplitterPanel, { defaultSize: 30, id: 'panel-a' }, () => 'A'),
        h(SplitterResizeHandle, {
          'aria-label': 'Resize panel A',
          'data-testid': 'handle-a',
          'id': 'handle-a',
          'style': handleStyle,
        }),
        h(SplitterPanel, { defaultSize: 40, id: 'panel-b' }, () => 'B'),
        h(SplitterResizeHandle, {
          'aria-label': 'Resize panel B',
          'data-testid': 'handle-b',
          'id': 'handle-b',
          'style': handleStyle,
        }),
        h(SplitterPanel, { defaultSize: 30, id: 'panel-c' }, () => 'C'),
      ]),
    ]
  },
})

async function focusFirstHandle(screen: Awaited<ReturnType<typeof render>>) {
  const handle = screen.getByTestId('primary-handle')
  await screen.getByRole('button', { name: 'Before splitter', exact: true }).click()
  await userEvent.tab()
  await expect.element(handle).toHaveFocus()
  return handle
}

describe('splitter native interactions', () => {
  it('exposes separator values and resolves aria-controls to the primary panel', async () => {
    const screen = await render(TwoPanelSplitter)
    const handle = screen.getByRole('separator', { name: 'Resize primary panel', exact: true })
    const primary = screen.getByTestId('primary')

    await expect.element(handle).toHaveAttribute('aria-valuemin', '20')
    await expect.element(handle).toHaveAttribute('aria-valuemax', '80')
    await expect.element(handle).toHaveAttribute('aria-valuenow', '50')

    const controls = handle.element().getAttribute('aria-controls')
    expect(controls).toBe('primary')
    expect(document.getElementById(controls!)).toBe(primary.element())
  })

  it('resizes panels through a real held mouse drag', async () => {
    const screen = await render(TwoPanelSplitter)
    const handle = screen.getByTestId('primary-handle')
    const primary = screen.getByTestId('primary')

    await expect.element(handle).toHaveAttribute('aria-valuenow', '50')
    const handleRect = handle.element().getBoundingClientRect()
    const initialWidth = primary.element().getBoundingClientRect().width
    const x = handleRect.left + handleRect.width / 2
    const y = handleRect.top + handleRect.height / 2

    await commands.mouseDown(x, y)
    try {
      await expect.element(handle).toHaveAttribute('data-state', 'drag')
      await expect.element(handle).toHaveAttribute('data-resize-handle-active', 'pointer')

      await commands.mouseMove(x + 80, y)
      await expect.poll(() => Number(handle.element().getAttribute('aria-valuenow'))).toBeCloseTo(70, 0)
      await expect.poll(() => primary.element().getBoundingClientRect().width - initialWidth).toBeGreaterThan(70)
    }
    finally {
      await commands.mouseUp()
    }

    await expect.element(handle).toHaveAttribute('data-state', 'hover')
    await expect.element(handle).not.toHaveAttribute('data-resize-handle-active')
  })

  it('resizes with ArrowRight, Home, and End from native keyboard input', async () => {
    const screen = await render(TwoPanelSplitter)
    const handle = await focusFirstHandle(screen)

    await expect.element(handle).toHaveAttribute('data-resize-handle-active', 'keyboard')

    await userEvent.keyboard('{ArrowRight}')
    await expect.element(handle).toHaveAttribute('aria-valuenow', '60')

    await userEvent.keyboard('{Home}')
    await expect.element(handle).toHaveAttribute('aria-valuenow', '20')

    await userEvent.keyboard('{End}')
    await expect.element(handle).toHaveAttribute('aria-valuenow', '80')
  })

  it('collapses and reopens the primary panel with Enter', async () => {
    const screen = await render(CollapsibleSplitter)
    const handle = await focusFirstHandle(screen)
    const primary = screen.getByTestId('primary')

    await expect.element(primary).toHaveAttribute('data-state', 'expanded')
    await userEvent.keyboard('{Enter}')
    await expect.element(handle).toHaveAttribute('aria-valuenow', '0')
    await expect.element(primary).toHaveAttribute('data-state', 'collapsed')

    await userEvent.keyboard('{Enter}')
    await expect.element(handle).toHaveAttribute('aria-valuenow', '20')
    await expect.element(primary).toHaveAttribute('data-state', 'expanded')
  })

  it('cycles focus between resize handles with F6 and Shift+F6', async () => {
    const screen = await render(ThreePanelSplitter)
    const first = screen.getByTestId('handle-a')
    const second = screen.getByTestId('handle-b')

    await screen.getByRole('button', { name: 'Before splitter', exact: true }).click()
    await userEvent.tab()
    await expect.element(first).toHaveFocus()

    await userEvent.keyboard('{F6}')
    await expect.element(second).toHaveFocus()
    await expect.element(second).toHaveAttribute('data-resize-handle-active', 'keyboard')

    await userEvent.keyboard('{Shift>}{F6}{/Shift}')
    await expect.element(first).toHaveFocus()
    await expect.element(first).toHaveAttribute('data-resize-handle-active', 'keyboard')
  })
})
