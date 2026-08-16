import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useSize } from './useSize'

function createSizeComponent(options: { height?: number, renderElement?: boolean, width?: number } = {}) {
  const {
    height: initialHeight = 40,
    renderElement = true,
    width: initialWidth = 80,
  } = options

  return defineComponent({
    setup() {
      const elRef = ref<HTMLElement | null>(null)
      const { width, height } = useSize(elRef)
      const boxWidth = ref(initialWidth)
      const boxHeight = ref(initialHeight)

      return () => h('div', [
        renderElement
          ? h('div', {
              'ref': elRef,
              'data-testid': 'observed',
              'style': {
                boxSizing: 'border-box',
                height: `${boxHeight.value}px`,
                width: `${boxWidth.value}px`,
              },
            })
          : h('span', { 'data-testid': 'unobserved' }),
        renderElement
          ? h('button', {
              'data-testid': 'resize',
              'onClick': () => {
                boxWidth.value = 120
                boxHeight.value = 60
              },
              'type': 'button',
            }, 'Resize')
          : null,
        h('output', {
          'data-height': height.value,
          'data-testid': 'size',
          'data-width': width.value,
        }, `${width.value}×${height.value}`),
      ])
    },
  })
}

describe('useSize', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('disconnects the observer on unmount', async () => {
    const screen = await render(createSizeComponent())
    const observed = screen.getByTestId('observed')
    const size = screen.getByTestId('size')
    const disconnectSpy = vi.spyOn(ResizeObserver.prototype, 'disconnect')

    await expect.element(size).toHaveAttribute('data-width', '80')
    await expect.element(size).toHaveAttribute('data-height', '40')
    expect(disconnectSpy).toHaveBeenCalledTimes(0)

    // A real layout change proves the native observer is live before its
    // lifecycle is inspected. The retry is owned by the observable resize,
    // rather than by an arbitrary delay.
    await screen.getByTestId('resize').click()
    await expect.element(observed).toHaveStyle({ height: '60px', width: '120px' })
    await expect.element(size).toHaveAttribute('data-width', '120')
    await expect.element(size).toHaveAttribute('data-height', '60')

    await screen.unmount()

    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })

  it('sets initial size from offsetWidth/offsetHeight on mount', async () => {
    // render() mounts synchronously. Do not await its trace-mark thenable here:
    // one Vue microtask exposes onMounted's offset read before native observer
    // delivery. A temporary removal of that assignment makes this test fail.
    const screen = render(createSizeComponent({ height: 63, width: 137 }))

    // onMounted reads offsetWidth/offsetHeight synchronously and queues one Vue
    // update. Settling exactly that update keeps this assertion on the initial
    // read, before relying on a later ResizeObserver delivery.
    await nextTick()
    const size = screen.getByTestId('size').element()
    const width = Number(size.dataset.width)
    const height = Number(size.dataset.height)

    expect(typeof width).toBe('number')
    expect(typeof height).toBe('number')
    expect(width).toBe(137)
    expect(height).toBe(63)
  })

  it('does not create an observer when element is null', async () => {
    const observeSpy = vi.spyOn(ResizeObserver.prototype, 'observe')
    const disconnectSpy = vi.spyOn(ResizeObserver.prototype, 'disconnect')
    const screen = await render(createSizeComponent({ renderElement: false }))

    await expect.element(screen.getByTestId('unobserved')).toBeInTheDocument()
    expect(screen.getByTestId('size').element().textContent).toBe('0×0')
    expect(observeSpy).not.toHaveBeenCalled()

    // unmount should not throw even though no observer was created
    await expect(screen.unmount()).resolves.toBeUndefined()
    expect(disconnectSpy).not.toHaveBeenCalled()
  })
})
