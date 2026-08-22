import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useSwipeDismiss } from './useSwipeDismiss'

/**
 * Unit tests for useSwipeDismiss pointer-event path. Covers the
 * dismiss-vs-cancel CSS variable clearing behavior — the close-animation
 * flicker fix. Before that fix, finishSwipe unconditionally cleared
 * `--drawer-swipe-movement-{x,y}` before invoking `onDismiss`, causing a
 * one-frame snap-back to the resting position just before the close
 * transition began. The fix preserves the drag transform on dismiss so
 * the closing animation continues smoothly from the released position,
 * and only clears on cancel (when the drawer should animate back to rest).
 */

interface HarnessOptions {
  onDismiss?: () => void
  onCancel?: () => void
  onRelease?: (velocity: { x: number, y: number }) => void
  directions?: Array<'up' | 'down' | 'left' | 'right'>
}

async function mountHarness(opts: HarnessOptions = {}) {
  const elementRef = ref<HTMLElement | null>(null)
  const onDismiss = opts.onDismiss ?? vi.fn()
  const onCancel = opts.onCancel ?? vi.fn()
  const onRelease = opts.onRelease ?? vi.fn()

  const Harness = defineComponent({
    setup() {
      useSwipeDismiss({
        enabled: true,
        elementRef,
        directions: opts.directions ?? ['down'],
        movementCssVars: {
          x: '--drawer-swipe-movement-x',
          y: '--drawer-swipe-movement-y',
        },
        onDismiss,
        onCancel,
        onRelease,
      })
      return { elementRef }
    },
    render() {
      return h('div', {
        ref: (el) => {
          elementRef.value = el as HTMLElement | null
        },
        style: 'width:400px;height:800px',
      })
    },
  })

  const wrapper = await render(Harness)
  return { wrapper, elementRef, onDismiss, onCancel, onRelease }
}

function dispatchPointer(
  el: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  time = 0,
  extra: Partial<PointerEventInit> = {},
) {
  // This composable-level suite constructs otherwise-unreachable guard inputs:
  // explicit timestamps for velocity classification, missing-button recovery,
  // document-only release, pointer-id replacement and window-blur cleanup.
  // Trusted end-to-end mouse and Chromium touch gestures live in
  // Drawer.snap and Drawer.interactions; these exact payload fields are the
  // reason this narrow helper remains synthetic.
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: 'mouse',
    pointerId: 1,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: x,
    clientY: y,
    ...extra,
  })
  // Synchronously constructed events receive a strictly-increasing real-clock
  // `timeStamp` landing within milliseconds of `performance.now()`.
  // That makes a synchronous below-threshold "slow drag" read as a fast flick
  // (release velocity stays fresh and large) and dismiss when it should cancel.
  // Default every event to timestamp 0 so gesture classification is decided
  // purely by displacement (release velocity reads as zero, as in a real slow
  // drag). Tests that need a measurable velocity pass explicit timestamps
  // anchored to `performance.now()` so the sample is still "fresh" at release.
  Object.defineProperty(event, 'timeStamp', { value: time, configurable: true })
  el.dispatchEvent(event)
}

describe('useSwipeDismiss — dismiss vs cancel CSS var clearing', () => {
  it('preserves movement CSS vars on dismiss so close animation runs from drag position', async () => {
    const onDismiss = vi.fn()
    const { wrapper, elementRef, onCancel } = await mountHarness({ onDismiss })
    await nextTick()

    const el = elementRef.value!
    expect(el).toBeTruthy()

    // Simulate a downward drag past the 40px default threshold, then release.
    dispatchPointer(el, 'pointerdown', 100, 100)
    dispatchPointer(el, 'pointermove', 100, 110)
    dispatchPointer(el, 'pointermove', 100, 160) // 60px, past threshold
    dispatchPointer(el, 'pointerup', 100, 160)
    await nextTick()

    // Release should dismiss.
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    // CRITICAL (flicker fix): movement CSS vars must NOT be cleared, so the
    // caller's close animation can transition smoothly from the dragged
    // position. Vars should still hold the release-time offset.
    const swipeY = el.style.getPropertyValue('--drawer-swipe-movement-y')
    expect(swipeY).not.toBe('0px')
    expect(swipeY).not.toBe('')

    // BaseUI parity: data-swipe-dismissed is set on the element so consumers
    // can style the swipe-dismissed close differently from click/escape.
    expect(el.hasAttribute('data-swipe-dismissed')).toBe(true)

    wrapper.unmount()
  })

  it('clears movement CSS vars on cancel so drawer animates back to rest', async () => {
    const onCancel = vi.fn()
    const { wrapper, elementRef, onDismiss } = await mountHarness({ onCancel })
    await nextTick()

    const el = elementRef.value!

    // Drag down just a tiny bit (below threshold), then release.
    dispatchPointer(el, 'pointerdown', 100, 100)
    dispatchPointer(el, 'pointermove', 100, 105)
    dispatchPointer(el, 'pointermove', 100, 115) // 15px, below threshold
    dispatchPointer(el, 'pointerup', 100, 115)
    await nextTick()

    expect(onDismiss).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)

    // Movement CSS vars ARE cleared so the drawer snaps back to resting
    // position (the consumer's CSS transition animates from there).
    expect(el.style.getPropertyValue('--drawer-swipe-movement-y')).toBe('0px')
    expect(el.style.getPropertyValue('--drawer-swipe-movement-x')).toBe('0px')

    // Not a dismiss, so the marker attribute is NOT set.
    expect(el.hasAttribute('data-swipe-dismissed')).toBe(false)

    wrapper.unmount()
  })

  it('fires onRelease with the measured velocity vector', async () => {
    const onRelease = vi.fn()
    const { wrapper, elementRef } = await mountHarness({ onRelease })
    await nextTick()

    const el = elementRef.value!

    // Drag past threshold with a timed sequence so velocity is measurable.
    // Anchor timestamps to performance.now() so the last sample is still within
    // MAX_RELEASE_VELOCITY_AGE_MS of release and the velocity isn't zeroed out.
    const t0 = performance.now()
    dispatchPointer(el, 'pointerdown', 100, 100, t0)
    dispatchPointer(el, 'pointermove', 100, 120, t0 + 16)
    dispatchPointer(el, 'pointermove', 100, 180, t0 + 32) // 80px, past threshold
    dispatchPointer(el, 'pointerup', 100, 180, t0 + 32)
    await nextTick()

    expect(onRelease).toHaveBeenCalledTimes(1)
    const velocity = onRelease.mock.calls[0][0]
    expect(typeof velocity.x).toBe('number')
    expect(typeof velocity.y).toBe('number')
    // A real downward flick must propagate a non-zero positive y velocity —
    // proving measured velocity reaches onRelease, not just numeric zeros.
    expect(velocity.y).toBeGreaterThan(0)

    wrapper.unmount()
  })
})

/**
 * The gesture must be tracked from the first pointer move regardless of its
 * direction (BaseUI `startSwipeAtPosition` sets `swiping` on press). A drag
 * away* from the dismiss direction is sqrt-damped by `applyDirectionalDamping`
 * and written to the movement vars — that damped offset is the elastic "pull"
 * feedback. Previously `processMove` returned early whenever the drag had no
 * allowed direction, so a bottom drawer pulled upward stayed completely frozen.
 */
describe('useSwipeDismiss — non-dismissable direction (elastic pull)', () => {
  it('damps and tracks a drag away from the dismiss direction', async () => {
    const { wrapper, elementRef, onDismiss, onCancel } = await mountHarness()
    await nextTick()

    const el = elementRef.value!

    // Pull UP on a `down`-dismiss drawer: 100px of travel.
    dispatchPointer(el, 'pointerdown', 100, 400)
    dispatchPointer(el, 'pointermove', 100, 380)
    dispatchPointer(el, 'pointermove', 100, 300)

    // sqrt-damped: -sqrt(100) = -10px, not the raw -100px.
    expect(el.style.getPropertyValue('--drawer-swipe-movement-y')).toBe('-10px')
    expect(el.style.getPropertyValue('--drawer-swipe-movement-x')).toBe('0px')

    dispatchPointer(el, 'pointerup', 100, 300)
    await nextTick()

    // A pull that never moves in a dismissable direction cancels: the drawer
    // springs back to rest and stays open.
    expect(onDismiss).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(el.style.getPropertyValue('--drawer-swipe-movement-y')).toBe('0px')
    expect(el.hasAttribute('data-swipe-dismissed')).toBe(false)

    wrapper.unmount()
  })

  it('still adopts the dismiss direction when the drag reverses into it', async () => {
    const { wrapper, elementRef, onDismiss, onCancel } = await mountHarness()
    await nextTick()

    const el = elementRef.value!

    // Pull up first (no dismissable direction yet), then push back down past
    // the 40px threshold. The gesture must dismiss rather than stay stuck
    // without an intended direction.
    dispatchPointer(el, 'pointerdown', 100, 400)
    dispatchPointer(el, 'pointermove', 100, 350)
    dispatchPointer(el, 'pointermove', 100, 420)
    dispatchPointer(el, 'pointermove', 100, 470) // +70px from origin
    dispatchPointer(el, 'pointerup', 100, 470)
    await nextTick()

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('leaves an allowed direction undamped when both axes directions are allowed', async () => {
    // Snap-point drawers pass both the dismiss direction and its opposite, so
    // neither vertical direction should be damped.
    const { wrapper, elementRef } = await mountHarness({ directions: ['down', 'up'] })
    await nextTick()

    const el = elementRef.value!

    dispatchPointer(el, 'pointerdown', 100, 400)
    dispatchPointer(el, 'pointermove', 100, 380)
    dispatchPointer(el, 'pointermove', 100, 300)

    expect(el.style.getPropertyValue('--drawer-swipe-movement-y')).toBe('-100px')

    dispatchPointer(el, 'pointerup', 100, 300)
    wrapper.unmount()
  })
})

/**
 * The listeners live on the popup, which the pointer leaves as soon as the drag
 * goes past the drawer's bounds (BaseUI instead hangs them off a full-screen
 * `Drawer.Viewport`). `setPointerCapture` covers an ordinary in-window drag, but
 * a release the popup never sees — outside the window, over another app, or
 * after capture is dropped — used to leave the gesture wedged: the drawer stayed
 * frozen mid-pull with `data-swiping` set (pinning the transition to 0ms) and
 * ignored every subsequent drag.
 */
describe('useSwipeDismiss — releases the popup never sees', () => {
  it('treats a move with no button held as the missing pointerup', async () => {
    const { wrapper, elementRef, onCancel } = await mountHarness()
    await nextTick()

    const el = elementRef.value!

    dispatchPointer(el, 'pointerdown', 100, 400)
    dispatchPointer(el, 'pointermove', 100, 390)
    dispatchPointer(el, 'pointermove', 100, 340)
    expect(el.hasAttribute('data-swiping')).toBe(false) // marker lives on the consumer
    expect(el.style.getPropertyValue('--drawer-swipe-movement-y')).not.toBe('0px')

    // The release happened somewhere we never saw; the pointer only comes back
    // over the page with the button already up.
    dispatchPointer(el, 'pointermove', 100, 300, 0, { buttons: 0 })
    await nextTick()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(el.style.getPropertyValue('--drawer-swipe-movement-y')).toBe('0px')

    wrapper.unmount()
  })

  it('finishes on a pointerup that only reaches the document', async () => {
    const { wrapper, elementRef, onCancel } = await mountHarness()
    await nextTick()

    const el = elementRef.value!

    dispatchPointer(el, 'pointerdown', 100, 400)
    dispatchPointer(el, 'pointermove', 100, 390)
    dispatchPointer(el, 'pointermove', 100, 340)

    // Released over some other element entirely — never retargeted to the popup.
    dispatchPointer(document.body, 'pointerup', 100, 340)
    await nextTick()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(el.style.getPropertyValue('--drawer-swipe-movement-y')).toBe('0px')

    wrapper.unmount()
  })

  it('finishes when the window loses focus mid-drag', async () => {
    const { wrapper, elementRef, onCancel } = await mountHarness()
    await nextTick()

    const el = elementRef.value!

    dispatchPointer(el, 'pointerdown', 100, 400)
    dispatchPointer(el, 'pointermove', 100, 390)
    dispatchPointer(el, 'pointermove', 100, 340)

    // Dragged out of the window and released over another application.
    window.dispatchEvent(new Event('blur'))
    await nextTick()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(el.style.getPropertyValue('--drawer-swipe-movement-y')).toBe('0px')

    wrapper.unmount()
  })

  it('does not leak state from an unfinished gesture into the next one', async () => {
    const onDismiss = vi.fn()
    const { wrapper, elementRef, onCancel } = await mountHarness({ onDismiss })
    await nextTick()

    const el = elementRef.value!

    // A change-of-mind drag that never ends: down past half the threshold, then
    // reversed far enough to latch `cancelledSwipe`, and no pointerup at all.
    dispatchPointer(el, 'pointerdown', 100, 400)
    dispatchPointer(el, 'pointermove', 100, 420)
    dispatchPointer(el, 'pointermove', 100, 460)
    dispatchPointer(el, 'pointermove', 100, 415)

    // A fresh press must start clean. If the latched cancel leaks into this
    // gesture, the drawer silently refuses to close no matter how far it is
    // dragged.
    dispatchPointer(el, 'pointerdown', 100, 400, 0, { pointerId: 2 })
    dispatchPointer(el, 'pointermove', 100, 410, 0, { pointerId: 2 })
    dispatchPointer(el, 'pointermove', 100, 470, 0, { pointerId: 2 })
    dispatchPointer(el, 'pointerup', 100, 470, 0, { pointerId: 2 })
    await nextTick()

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
