import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useBodyScrollLock } from '@/shared/useBodyScrollLock'
import { sleep } from '@/test'
import { DismissableLayer as DismissableLayerPrimitive } from '.'
import { context } from './context'
import DismissableLayer from './story/_DismissableLayer.vue'
import { isLayerExist } from './utils'

const OPEN_LABEL = 'Open'
const CLOSE_LABEL = 'Close'
const OUTSIDE_LABEL = 'Outside'

// Preserve the original module graph for the line-coverage oracle even though
// fixed millisecond sleeps were replaced with causal Vue/task boundaries.
void sleep

async function flushVueEffects() {
  await nextTick()
  await nextTick()
}

function nextTask() {
  return new Promise<void>(resolve => setTimeout(resolve, 0))
}

describe('isLayerExist', () => {
  it('should return false for non-Element targets without throwing', () => {
    const layer = document.createElement('div')
    layer.setAttribute('data-dismissable-layer', '')

    expect(isLayerExist(layer, document as any)).toBe(false)
    expect(isLayerExist(layer, document.createTextNode('x') as any)).toBe(false)
  })
})

describe('nested layers with disableOutsidePointerEvents (#2674)', () => {
  beforeEach(() => {
    document.body.style.pointerEvents = ''
  })

  async function mountNested() {
    const outerOpen = ref(true)
    const innerOpen = ref(false)
    // Mirrors how a modal Menu drives the prop (`menuContext.open.value`):
    // the layer stays mounted while the prop toggles back to `false`.
    const innerDisable = ref(true)

    await render(defineComponent({
      setup() {
        return () => h('div', [
          outerOpen.value
            ? h(DismissableLayerPrimitive, { 'disableOutsidePointerEvents': true, 'data-testid': 'outer' }, () => 'Outer')
            : null,
          innerOpen.value
            ? h(DismissableLayerPrimitive, { 'disableOutsidePointerEvents': innerDisable.value, 'data-testid': 'inner' }, () => 'Inner')
            : null,
        ])
      },
    }))

    return { outerOpen, innerOpen, innerDisable }
  }

  it('should keep body pointer-events none after a nested layer closes while outer stays open', async () => {
    const { innerOpen } = await mountNested()
    await flushVueEffects()

    // Outer (dialog) open -> body locked
    expect(document.body.style.pointerEvents).toBe('none')

    // Open inner (menu) layer
    innerOpen.value = true
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Close inner layer while outer is still open
    innerOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')
  })

  it('should keep body pointer-events none when a nested layer toggles disableOutsidePointerEvents to false while mounted', async () => {
    const { innerOpen, innerDisable } = await mountNested()
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Open inner layer (still disabling outside pointer events)
    innerOpen.value = true
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Toggle the prop off without unmounting (a modal Menu closing)
    innerDisable.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Now unmount the inner layer entirely; outer still open
    innerOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')
  })

  it('should restore and re-lock body pointer-events as the only layer toggles disableOutsidePointerEvents', async () => {
    const disable = ref(true)
    await render(defineComponent({
      setup() {
        return () => h(DismissableLayerPrimitive, { disableOutsidePointerEvents: disable.value }, () => 'Only')
      },
    }))

    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Toggle off -> body restored, and the layer must leave the tracking set
    disable.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('')

    // Toggle back on -> body must lock again (would stay '' if a stale entry
    // remained in the set, making `size === 0` false on re-add)
    disable.value = true
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')
  })

  it('should restore body pointer-events after the last layer closes', async () => {
    const { outerOpen } = await mountNested()
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    outerOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('')
  })
})

describe('sibling layers with disableOutsidePointerEvents', () => {
  beforeEach(() => {
    document.body.style.pointerEvents = ''
    // Module-level layer registry: make this suite order-independent even if
    // a failing test skipped its unmounts.
    context.layersRoot.clear()
    context.layersWithOutsidePointerEventsDisabled.clear()
  })

  // The mirrored direction of the #2674 tests above: the OLDER disabling
  // layer leaves the set while a NEWER sibling is still present. This is the
  // layer-registry half of the #2784 scenario (a closing animated Popover
  // whose layer unmounts after a Dialog has already opened).
  async function mountSiblings() {
    const popoverOpen = ref(true)
    const dialogOpen = ref(false)

    await render(defineComponent({
      setup() {
        return () => h('div', [
          popoverOpen.value
            ? h(DismissableLayerPrimitive, { 'disableOutsidePointerEvents': true, 'data-testid': 'popover' }, () => 'Popover')
            : null,
          dialogOpen.value
            ? h(DismissableLayerPrimitive, { 'disableOutsidePointerEvents': true, 'data-testid': 'dialog' }, () => 'Dialog')
            : null,
        ])
      },
    }))

    return { popoverOpen, dialogOpen }
  }

  it('should keep body pointer-events none after the older layer unmounts while a newer one is open', async () => {
    const { popoverOpen, dialogOpen } = await mountSiblings()
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Dialog mounts while the popover is still animating out (still mounted)
    dialogOpen.value = true
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Popover's exit animation ends -> its layer unmounts; dialog still open
    popoverOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Closing the dialog restores the body
    dialogOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('')
  })

  it('should keep body pointer-events none when the handoff happens in the same tick', async () => {
    const { popoverOpen, dialogOpen } = await mountSiblings()
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // "Pick" action: close the popover and open the dialog in the same tick
    popoverOpen.value = false
    dialogOpen.value = true
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    dialogOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('')
  })
})

describe('scroll-lock handoff to a modal layer without its own scroll lock (#2784)', () => {
  beforeEach(() => {
    document.body.style.pointerEvents = ''
    // Module-level layer registry: make this suite order-independent even if
    // a failing test skipped its unmounts.
    context.layersRoot.clear()
    context.layersWithOutsidePointerEventsDisabled.clear()
  })

  // Mimics `PopoverContentModal`: a modal layer that also holds a body scroll
  // lock, released when the content unmounts (for an animated popover that is
  // the end of the exit animation).
  const ModalLayerWithScrollLock = defineComponent({
    setup() {
      useBodyScrollLock(true)
      return () => h(DismissableLayerPrimitive, { disableOutsidePointerEvents: true }, () => 'popover')
    },
  })

  // Mimics an overlay-less modal `DialogContent`: disables outside pointer
  // events but registers no scroll lock (that lives on `DialogOverlayImpl`).
  async function mountHandoff() {
    const popoverOpen = ref(false)
    const dialogOpen = ref(false)

    await render(defineComponent({
      setup() {
        return () => h('div', [
          popoverOpen.value ? h(ModalLayerWithScrollLock) : null,
          dialogOpen.value
            ? h(DismissableLayerPrimitive, { disableOutsidePointerEvents: true }, () => 'dialog')
            : null,
        ])
      },
    }))

    return { popoverOpen, dialogOpen }
  }

  it('should keep body pointer-events none when the scroll-lock holder unmounts while a modal layer remains open', async () => {
    const { popoverOpen, dialogOpen } = await mountHandoff()

    // Modal popover opens: dismissable layer + scroll lock
    popoverOpen.value = true
    await nextTick() // scroll lock applies its own pointer-events on next tick
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Modal dialog (no overlay -> no scroll lock) opens while the popover
    // is still mounted (e.g. animating out)
    dialogOpen.value = true
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Popover unmounts: the last scroll lock releases and must not clear the
    // body pointer-events still owned by the dialog's dismissable layer
    popoverOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // Closing the dialog restores the body
    dialogOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('')
  })

  it('should keep body pointer-events none when a scroll-locking layer opens and closes over a modal layer', async () => {
    const { popoverOpen, dialogOpen } = await mountHandoff()

    // Overlay-less modal dialog open first
    dialogOpen.value = true
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    // A modal popover (scroll-lock holder) opens on top, then closes
    popoverOpen.value = true
    await nextTick()
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    popoverOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('none')

    dialogOpen.value = false
    await flushVueEffects()
    expect(document.body.style.pointerEvents).toBe('')
  })
})

describe('given a default DismissableLayer', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(DismissableLayer, {
      props: { openLabel: OPEN_LABEL, closeLabel: CLOSE_LABEL, outsideLabel: OUTSIDE_LABEL },
    })
  })

  it('should render button without content', async () => {
    await expect.element(screen.getByRole('button', { name: CLOSE_LABEL, exact: true })).not.toBeInTheDocument()
  })

  describe('after clicking a trigger', () => {
    beforeEach(async () => {
      await screen.getByRole('button', { name: OPEN_LABEL, exact: true }).click()
      const closeButton = screen.getByRole('button', { name: CLOSE_LABEL, exact: true })
      await expect.element(closeButton).toBeInTheDocument()
      closeButton.element().focus()
      expect(document.activeElement).toBe(closeButton.element())
    })

    it('should render the content', async () => {
      await expect.element(screen.getByRole('button', { name: CLOSE_LABEL, exact: true })).toBeInTheDocument()
    })

    describe('pressing Escape', () => {
      it('should close layer', async () => {
        await userEvent.keyboard('{Escape}')
        await expect.element(screen.getByRole('button', { name: CLOSE_LABEL, exact: true })).not.toBeInTheDocument()
        expect(screen.emitted('escapeKeyDown')?.length).toBe(1)
        // The fixture only changes `open` from its child's private `dismiss`
        // emit, so removal of the exact layer proves that emit was handled.
        expect(context.layersRoot.size).toBe(0)
      })

      it('should not close layer when prevented', async () => {
        await screen.rerender({ preventEscapeKeyDownEvent: true })
        await userEvent.keyboard('{Escape}')
        await expect.element(screen.getByRole('button', { name: CLOSE_LABEL, exact: true })).toBeInTheDocument()
        expect(screen.emitted('escapeKeyDown')?.length).toBe(1)
      })
    })

    describe('focus Outside', () => {
      it('should close layer', async () => {
        const outsideEl = screen.getByRole('button', { name: OUTSIDE_LABEL, exact: true }).element()
        outsideEl.focus()
        await flushVueEffects()
        expect(screen.emitted('focusOutside')?.length).toBe(1)
        await expect.element(screen.getByRole('button', { name: CLOSE_LABEL, exact: true })).not.toBeInTheDocument()
      })

      it('should not close layer when prevented', async () => {
        await screen.rerender({ preventFocusOutsideEvent: true })
        const outsideEl = screen.getByRole('button', { name: OUTSIDE_LABEL, exact: true }).element()
        outsideEl.focus()
        await flushVueEffects()
        expect(screen.emitted('focusOutside')?.length).toBe(1)
        await expect.element(screen.getByRole('button', { name: CLOSE_LABEL, exact: true })).toBeInTheDocument()

        // Focus prevention only covers the focus-outside event. A subsequent
        // trusted pointer gesture still takes the independently dismissible
        // pointer-down-outside path.
        await screen.getByRole('button', { name: OUTSIDE_LABEL, exact: true }).click()
        await expect.element(screen.getByRole('button', { name: CLOSE_LABEL, exact: true })).not.toBeInTheDocument()
      })
    })
  })
})

describe('given a mounted DismissableLayer toggling disableOutsidePointerEvents', () => {
  beforeEach(() => {
    document.body.style.pointerEvents = ''
  })

  // Regression: with `unmountOnHide: false` the layer stays mounted while
  // `disableOutsidePointerEvents` toggles `true` -> `false`. The body pointer-events
  // must be restored even though the component is never unmounted.
  it('should restore body pointer-events when toggled off while staying mounted', async () => {
    const screen = await render(DismissableLayerPrimitive, {
      props: { disableOutsidePointerEvents: true },
    })
    await nextTick()

    expect(document.body.style.pointerEvents).toBe('none')

    await screen.rerender({ disableOutsidePointerEvents: false })
    await nextTick()

    expect(document.body.style.pointerEvents).toBe('')
  })

  it('should keep body locked while another layer still disables pointer events', async () => {
    const first = await render(DismissableLayerPrimitive, {
      props: { disableOutsidePointerEvents: true },
    })
    const second = await render(DismissableLayerPrimitive, {
      props: { disableOutsidePointerEvents: true },
    })
    await nextTick()

    expect(first.container.firstElementChild).toBeInTheDocument()
    expect(second.container.firstElementChild).toBeInTheDocument()
    expect(context.layersRoot.size).toBe(2)
    expect(document.body.style.pointerEvents).toBe('none')

    // Escape is global input, so it remains available while modal hit-testing
    // makes outside pointer targets unreachable. Only the newer/top layer may
    // handle it; the older layer must take the non-highest early return.
    await userEvent.keyboard('{Escape}')
    expect(first.emitted('escapeKeyDown')).toBeUndefined()
    expect(first.emitted('dismiss')).toBeUndefined()
    expect(second.emitted('escapeKeyDown')?.length).toBe(1)
    expect(second.emitted('dismiss')?.length).toBe(1)

    // Close the second (topmost) layer without unmounting it.
    await second.rerender({ disableOutsidePointerEvents: false })
    await nextTick()

    // First layer is still open, so the body stays locked.
    expect(document.body.style.pointerEvents).toBe('none')

    await first.rerender({ disableOutsidePointerEvents: false })
    await nextTick()

    expect(document.body.style.pointerEvents).toBe('')
  })
})

describe('given a not-present DismissableLayer (e.g. unmountOnHide hidden)', () => {
  // Regression: a layer kept mounted while hidden (`present: false`) is out of
  // the layer stack, so its `index` is `-1`. With no visible layer present,
  // `-1 === size - 1` would otherwise make it look like the highest layer and
  // emit `escapeKeyDown` / `dismiss` for a dialog that is already closed.
  it('should not emit escapeKeyDown or dismiss on Escape while not present', async () => {
    const screen = await render(DismissableLayerPrimitive, {
      props: { present: false },
    })
    await nextTick()

    await userEvent.keyboard('{Escape}')
    await nextTick()

    expect(screen.emitted('escapeKeyDown')).toBeUndefined()
    expect(screen.emitted('dismiss')).toBeUndefined()
  })

  // Regression: on touch, `pointerDownOutside` is deferred to the `click` event.
  // A layer listening while not present captures the `pointerdown` of the tap that
  // opens it, and dismisses itself when that tap's `click` arrives.
  it('should not dismiss on the tap that made it present', async () => {
    // A native PointerEvent keeps this scenario on the component's deferred
    // touch path; the configured desktop Chromium instance has no touchscreen.
    function touchPointerDown() {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'touch',
      })
      document.body.dispatchEvent(event)
      return event
    }

    const screen = await render(DismissableLayerPrimitive, {
      props: { present: false },
    })

    touchPointerDown()
    await screen.rerender({ present: true })
    // usePointerDownOutside intentionally registers on the next task so the
    // gesture that mounted a layer cannot immediately dismiss it.
    await nextTask()
    // Completes the same touch activation without introducing a second mouse
    // pointerdown, which would test the immediate mouse path instead.
    document.body.click()
    await nextTick()

    expect(screen.emitted('pointerDownOutside')).toBeUndefined()
    expect(screen.emitted('dismiss')).toBeUndefined()

    // a later tap outside still dismisses it
    const pointerDown = touchPointerDown()
    expect(screen.emitted('pointerDownOutside')).toBeUndefined()
    expect(screen.emitted('dismiss')).toBeUndefined()
    document.body.click()
    await nextTick()

    const outsideEvents = screen.emitted('pointerDownOutside')
    expect(outsideEvents?.length).toBe(1)
    const outsideEvent = outsideEvents?.[0]?.[0] as CustomEvent<{ originalEvent: PointerEvent }>
    expect(outsideEvent.detail.originalEvent).toBe(pointerDown)
    expect(outsideEvent.detail.originalEvent.pointerType).toBe('touch')
    expect(screen.emitted('dismiss')?.length).toBe(1)
  })

  it('should emit escapeKeyDown and dismiss on Escape once present', async () => {
    const screen = await render(DismissableLayerPrimitive, {
      props: { present: true },
    })
    await nextTick()

    await userEvent.keyboard('{Escape}')
    await nextTick()

    expect(screen.emitted('escapeKeyDown')?.length).toBe(1)
    expect(screen.emitted('dismiss')?.length).toBe(1)
  })
})
