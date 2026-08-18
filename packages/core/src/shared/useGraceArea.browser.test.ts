import type { Ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { nextTick, ref } from 'vue'
import { useGraceArea } from './useGraceArea'

function makeRect(rect: Partial<DOMRect>): DOMRect {
  return {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    ...rect,
    toJSON: () => ({}),
  } as DOMRect
}

function pointerEvent(type: string, init: { clientX?: number, clientY?: number, bubbles?: boolean }) {
  return new PointerEvent(type, { bubbles: true, ...init })
}

interface Harness {
  isPointerInTransit: Ref<boolean>
  onPointerExit: ReturnType<typeof useGraceArea>['onPointerExit']
}

async function mountGraceArea(trigger: HTMLElement, container: HTMLElement) {
  const result: { value: Harness | null } = { value: null }
  const wrapper = await render({
    template: '<p>grace</p>',
    setup() {
      const triggerRef = ref(trigger) as Ref<HTMLElement | undefined>
      const containerRef = ref(container) as Ref<HTMLElement | undefined>
      const api = useGraceArea(triggerRef, containerRef)
      result.value = api
      return api
    },
  })
  return { wrapper, api: result.value as Harness }
}

describe('useGraceArea', () => {
  let trigger: HTMLElement
  let container: HTMLElement
  let wrapper: Awaited<ReturnType<typeof mountGraceArea>>['wrapper'] | null

  async function setup() {
    trigger = document.createElement('div')
    container = document.createElement('div')
    document.body.appendChild(trigger)
    document.body.appendChild(container)
    trigger.getBoundingClientRect = () =>
      makeRect({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 })
    container.getBoundingClientRect = () =>
      makeRect({ top: 0, left: 200, right: 300, bottom: 100, width: 100, height: 100, x: 200, y: 0 })
    const mounted = await mountGraceArea(trigger, container)
    wrapper = mounted.wrapper
    return mounted.api
  }

  afterEach(async () => {
    vi.useRealTimers()
    await wrapper?.unmount()
    wrapper = null
    trigger?.remove()
    container?.remove()
  })

  it('sets isPointerInTransit to true on a trigger pointerleave', async () => {
    const api = await setup()
    expect(api.isPointerInTransit.value).toBe(false)
    trigger.dispatchEvent(pointerEvent('pointerleave', { clientX: 100, clientY: 50 }))
    expect(api.isPointerInTransit.value).toBe(true)
  })

  it('keeps isPointerInTransit true and does not fire exit for a pointermove inside the hull', async () => {
    const api = await setup()
    const exitSpy = vi.fn()
    api.onPointerExit(exitSpy)
    trigger.dispatchEvent(pointerEvent('pointerleave', { clientX: 100, clientY: 50 }))
    await nextTick()
    document.body.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 50 }))
    expect(api.isPointerInTransit.value).toBe(true)
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('fires onPointerExit and resets when a pointermove leaves the hull', async () => {
    const api = await setup()
    const exitSpy = vi.fn()
    api.onPointerExit(exitSpy)
    trigger.dispatchEvent(pointerEvent('pointerleave', { clientX: 100, clientY: 50 }))
    await nextTick()
    document.body.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 500 }))
    expect(exitSpy).toHaveBeenCalledTimes(1)
    expect(api.isPointerInTransit.value).toBe(false)
  })

  it('removes the grace area without firing exit when the pointer enters the container', async () => {
    const api = await setup()
    const exitSpy = vi.fn()
    api.onPointerExit(exitSpy)
    trigger.dispatchEvent(pointerEvent('pointerleave', { clientX: 100, clientY: 50 }))
    await nextTick()
    expect(api.isPointerInTransit.value).toBe(true)
    container.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 500 }))
    expect(exitSpy).not.toHaveBeenCalled()
    expect(api.isPointerInTransit.value).toBe(false)
  })

  it('auto-resets isPointerInTransit after 300ms', async () => {
    vi.useFakeTimers()
    const api = await setup()
    trigger.dispatchEvent(pointerEvent('pointerleave', { clientX: 100, clientY: 50 }))
    expect(api.isPointerInTransit.value).toBe(true)
    vi.advanceTimersByTime(300)
    expect(api.isPointerInTransit.value).toBe(false)
  })

  it('resets isPointerInTransit to false on unmount', async () => {
    const api = await setup()
    trigger.dispatchEvent(pointerEvent('pointerleave', { clientX: 100, clientY: 50 }))
    expect(api.isPointerInTransit.value).toBe(true)
    await wrapper?.unmount()
    wrapper = null
    expect(api.isPointerInTransit.value).toBe(false)
  })
})
