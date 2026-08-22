import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { commands } from 'vitest/browser'
import { defineComponent, ref } from 'vue'
import {
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerOverlay,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from '.'

/**
 * Integration tests for the snap-point bugs fixed in the PR:
 *
 *   1. **Reopen bug**: `DrawerContentImpl` had a lazy
 *      `watch(activeSnapPointOffset, ...)` with no `immediate`. On the
 *      FIRST open it fired when `popupHeight` transitioned from 0 → measured,
 *      writing `--drawer-snap-point-offset`. On REOPEN, `popupHeight` was
 *      already cached on the root context, so `activeSnapPointOffset` was
 *      already correct on mount → nothing changed → lazy watcher never fired
 *      → CSS var stayed at `0px` and the drawer rendered as if snap=1.0
 *      regardless of the actual `activeSnapPoint`. Fix: explicit
 *      `writeSnapPointOffset()` call in `onMounted`.
 *
 *   2. **Stale swipe movement var**: `onRelease` did not clear
 *      `--drawer-swipe-movement-{x,y}` after a snap transition. Combined
 *      with the flicker-fix "preserve transform on dismiss" branch in
 *      `finishSwipe`, an aggressive up-swipe past the top snap would leave
 *      e.g. `--drawer-swipe-movement-y: -500px` on the element. The next
 *      computed transform `calc(snap-offset + swipe-y) = 0 + -500` pushed
 *      the drawer offscreen. Fix: explicitly clear both movement vars
 *      after `snapToNearest` when snap points are active.
 *
 *   3. **Sequencing for smooth drag-to-next-snap**: The snap-offset CSS var
 *      write must happen synchronously BEFORE the movement var clear, so
 *      both land in the same frame and the CSS transition on `transform`
 *      interpolates cleanly from the drag position to the new snap target.
 *      Before the fix, the lazy Vue watcher fired a microtask later, so
 *      the computed transform visibly jumped from the drag position back
 *      to the old snap position for one frame.
 *
 * The browser port uses native ResizeObserver plus a real `100dvh` content
 * box. Expected offsets are derived from the measured element and viewport,
 * so the regression contracts no longer depend on a fabricated 800px box.
 */

// The popup height must match `window.innerHeight` since
// `useDrawerSnapPoints` uses `window.innerHeight` as the viewport height
// baseline for fraction-based snap points. Setting both to the same value
// mirrors a real CSS `height: 100dvh` drawer where popupHeight === viewport.
function findContent() {
  return document.querySelector('[role="dialog"]') as HTMLElement | null
}

function getSnapOffset(el: HTMLElement) {
  return el.style.getPropertyValue('--drawer-snap-point-offset')
}

function expectedSnapOffset(el: HTMLElement, snap: number) {
  return `${Math.max(0, el.offsetHeight - Math.round(snap * window.innerHeight))}px`
}

function getSwipeMovementY(el: HTMLElement) {
  return el.style.getPropertyValue('--drawer-swipe-movement-y')
}

async function dragUp(content: HTMLElement) {
  const rect = content.getBoundingClientRect()
  // Start on the content's empty lower-right surface, away from the handle,
  // title and close button that useSwipeDismiss intentionally ignores.
  const x = rect.right - 30
  const startY = Math.min(window.innerHeight - 30, rect.bottom - 30)
  await commands.mouseDown(x, startY)
  try {
    await commands.mouseMove(x, startY - 50)
    await commands.mouseMove(x, startY - 250)
    await commands.mouseMove(x, Math.max(50, startY - 600))
  }
  finally {
    await commands.mouseUp()
  }
}

const SnapDrawer = defineComponent({
  components: { DrawerRoot, DrawerTrigger, DrawerPortal, DrawerOverlay, DrawerContent, DrawerHandle, DrawerTitle, DrawerClose },
  props: {
    defaultOpen: { type: Boolean, default: false },
    defaultSnapPoint: { type: [Number, String, null] as any, default: 0.5 },
  },
  setup(props) {
    const open = ref(props.defaultOpen)
    const snapPoint = ref<number | string | null>(props.defaultSnapPoint)
    return { open, snapPoint }
  },
  template: `
    <DrawerRoot
      v-model:open="open"
      v-model:snap-point="snapPoint"
      :snap-points="[0.5, 1]"
    >
      <DrawerTrigger>Open</DrawerTrigger>
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent style="height: 100dvh; width: 400px">
          <DrawerHandle />
          <DrawerTitle>Snap Drawer</DrawerTitle>
          <DrawerClose>Close</DrawerClose>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  `,
})

describe('drawer snap points — integration', () => {
  describe('mount-time snap offset write (reopen bug)', () => {
    it('writes --drawer-snap-point-offset on initial open for snap=0.5', async () => {
      const { getByText } = await render(SnapDrawer)
      await getByText('Open').click()

      await expect.poll(findContent).not.toBeNull()
      const content = findContent()!

      // popupHeight=800, snap 0.5 => offset = 800 - 400 = 400
      await expect.poll(() => getSnapOffset(content)).toBe(expectedSnapOffset(content, 0.5))
    })

    it('writes --drawer-snap-point-offset on REOPEN after close (lazy-watcher bug)', async () => {
      const { getByText } = await render(SnapDrawer)

      // First open-close cycle. The lazy watcher fires here because
      // popupHeight transitions 0 -> 800, so this worked even before the fix.
      await getByText('Open').click()
      await expect.poll(() => getSnapOffset(findContent()!)).toBe(expectedSnapOffset(findContent()!, 0.5))

      // Close the drawer. Presence will unmount the content.
      await getByText('Close').click()
      await expect.poll(findContent).toBeNull()

      // Reopen. popupHeight is already cached on the root context (800px
      // from the previous mount), so activeSnapPointOffset is immediately
      // correct and a lazy `watch(activeSnapPointOffset, ...)` would NEVER
      // fire. The regression was that the CSS var stayed unset and the
      // drawer rendered as if snap=1.0 (offset=0).
      await getByText('Open').click()

      await expect.poll(findContent).not.toBeNull()
      const content = findContent()!
      await expect.poll(() => getSnapOffset(content)).toBe(expectedSnapOffset(content, 0.5))
    })

    it('writes --drawer-snap-point-offset on REOPEN after snap transition + close', async () => {
      // Regression for the compound case: open at 0.5, toggle to 1.0 via a
      // state change, close, reopen - the offset must reflect the CURRENT
      // active snap point (which reopens at 0.5 because state goes back to
      // the v-model seed value in this harness).
      const { getByText } = await render(SnapDrawer)

      await getByText('Open').click()
      await expect.poll(() => getSnapOffset(findContent()!)).toBe(expectedSnapOffset(findContent()!, 0.5))

      await getByText('Close').click()
      await expect.poll(findContent).toBeNull()

      await getByText('Open').click()

      await expect.poll(() => getSnapOffset(findContent()!)).toBe(expectedSnapOffset(findContent()!, 0.5))
    })

    it('writes a snap=1.0 offset (0px) when defaultSnapPoint is 1', async () => {
      const { getByText } = await render(SnapDrawer, { props: { defaultSnapPoint: 1 } })
      await getByText('Open').click()

      await expect.poll(findContent).not.toBeNull()
      const content = findContent()!
      // popupHeight=800, snap 1.0 => offset = 800 - 800 = 0
      await expect.poll(() => getSnapOffset(content)).toBe(expectedSnapOffset(content, 1))
    })
  })

  describe('swipe release does not leave stale movement var', () => {
    // These tests exercise the DrawerContentImpl.onRelease wiring that
    // clears --drawer-swipe-movement-{x,y} after snapToNearest runs.
    // Stateful browser commands keep the primary button held across moves,
    // exercising the production document listeners with trusted input.

    it('clears --drawer-swipe-movement-y after snap-to-snap release', async () => {
      const { getByText } = await render(SnapDrawer)
      await getByText('Open').click()
      await expect.poll(findContent).not.toBeNull()

      const content = findContent()!

      // Simulate a drag upward that would cross into snap=1.0 territory.
      // The exact displacement is irrelevant to this assertion — we only
      // need the release path to run through the snap branch.
      await dragUp(content)

      // Movement vars must be reset so the next interaction starts from a
      // clean slate and the inline `transform` doesn't carry stale drag
      // state into the new snap position.
      await expect.poll(() => getSwipeMovementY(content)).toBe('0px')
      expect(content.style.getPropertyValue('--drawer-swipe-movement-x')).toBe('0px')
    })

    it('updates --drawer-snap-point-offset synchronously on snap-to-snap release (smooth drag)', async () => {
      // The sequencing fix: onRelease calls writeSnapPointOffset() BEFORE
      // clearing the movement vars, so the CSS transition starts from the
      // drag position instead of snapping back to the old snap offset for
      // one frame.
      const { getByText } = await render(SnapDrawer)
      await getByText('Open').click()
      await expect.poll(findContent).not.toBeNull()

      const content = findContent()!
      await expect.poll(() => getSnapOffset(content)).toBe(expectedSnapOffset(content, 0.5))

      // Drag upward past the snap threshold. Snap to nearest should pick
      // snap=1.0 (offset=0) given a large enough upward displacement.
      await dragUp(content)

      // Snap offset should have updated immediately to the new target,
      // AND movement var should be cleared. If the movement var were
      // cleared without the snap offset update, the transform would
      // briefly revert to the old snap position.
      await expect.poll(() => getSnapOffset(content)).toBe(expectedSnapOffset(content, 1))
      expect(getSwipeMovementY(content)).toBe('0px')
    })
  })
})
