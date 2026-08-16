import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, onMounted, ref } from 'vue'
import { Presence } from '.'

// Browser-mode port of `Presence.test.ts`. A T2 file by the inventory (no
// stubs, 10 tests), but it is the one file whose subject is the thing the
// browser project's CSS shim deliberately removed: `usePresence` decides
// whether to unmount instantly or suspend by *reading `animation-name` off
// computed styles*, and jsdom returns `''` for that on every element that has
// ever existed.
//
// Four things are different from the original, all measured, all in
// `FINDINGS.tsv`:
//
//  1. **Mount moved into `beforeEach`, and the nested "again" blocks got a
//     `beforeEach` of their own.** The original mounts once in the `describe`
//     body and lets state accumulate: `after clicking trigger again` has no
//     hook, so its second click comes from the *parent* hook re-running against
//     a wrapper that is still open from the previous test. `render` unmounts
//     after every test, so that trick is unavailable — each "again" block now
//     performs the second click explicitly. Same two clicks, same names, and
//     the names become true by construction rather than by test-ordering.
//     See `Presence/Presence.test.ts#state-accumulation`.
//  2. **`given a Presence with animated content` is quarantined.** In a real
//     browser its `@keyframes` actually run, so closing the content starts a
//     2s `fadeOut`, `usePresence` dispatches `ANIMATION_OUT`, and the content
//     stays mounted — which is the entire purpose of the component. jsdom
//     reports `animationName: ''` and takes the instant-unmount branch, so
//     under jsdom that `describe` is byte-for-byte the same test as
//     `given a default Presence`. See
//     `Presence/Presence.test.ts#animated-content-is-jsdom-only`.
//  3. **Every assertion is the original's bare synchronous read.** This file
//     is where the `assert twice —
//     retrying matcher, then the sync read` recipe was shown to be unsound: a
//     retrying matcher settles *the assertion*, not "the flush", so putting
//     `expect.element(X)` in front of a synchronous read of X makes the sync
//     read unfailable and leaves the pair exactly as weak as the retry budget.
//     Measured — see `Presence/Presence.test.ts#retry-presettles-its-own-condition`.
//     The retries that remain wait on a distinct precondition BEFORE the
//     interaction. There is no extra `nextTick()` after a real click: the
//     awaited Playwright command returns after the event task and Vue's
//     synchronous-update microtask flush, so the exact reads remain exact.
//  4. **A real `AnimationEvent`** replaces `new Event('animationend')` plus an
//     `Object.defineProperty` to fake `animationName`. Chromium constructs the
//     real thing; the faked one is a jsdom workaround.
//     See `Presence/Presence.test.ts#synthetic-animation-event`.
//
// Note what is NOT different: `vi.spyOn(globalThis, 'getComputedStyle')` ports
// unchanged. `getComputedStyle` is a `Window.prototype` method in both
// environments, `spyOn` shadows it with an own property on the global object,
// and `usePresence` calls it unqualified — so the spy observes the same calls.
// What it observes is *more* real in the browser: the returned
// `CSSStyleDeclaration` is live and carries a real `animationName`.

const CONTENT = 'Content'

describe('given a default Presence', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(defineComponent({
      components: { Presence },
      setup: () => {
        return { open: ref(false) }
      },
      template: `<div>
    <button @click="open = !open">
      toggle
    </button>
  </div>
  <Presence :present="open">
    <div>${CONTENT}</div>
  </Presence>`,
    }))
  })

  it('should not show content', () => {
    // `render` has no `.html()`; the component is fragment-rooted (a `<div>`
    // and the Presence), and both roots are direct children of the container,
    // so `container.innerHTML` is the closest equivalent to `wrapper.html()`.
    expect(screen.container.innerHTML).not.toContain(CONTENT)
  })

  describe('after clicking trigger', () => {
    beforeEach(async () => {
      await screen.getByRole('button').click()
    })

    it('should show content', () => {
      expect(screen.container.innerHTML).toContain(CONTENT)
    })

    describe('after clicking trigger again', () => {
      beforeEach(async () => {
        // The original gets this second click from the parent hook re-running
        // against an accumulated wrapper; see the header. This retry is
        // legitimate because it waits on the state BEFORE the interaction
        // (open), which is not the condition the test asserts (closed).
        await expect.element(screen.getByText(CONTENT, { exact: true })).toBeInTheDocument()
        await screen.getByRole('button').click()
      })

      it('should not show content', () => {
        expect(screen.container.innerHTML).not.toContain(CONTENT)
      })
    })
  })
})

describe('given a forceMounted Presence', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(defineComponent({
      components: { Presence },
      setup: () => {
        return { open: ref(false) }
      },
      template: `<section>
    <button @click="open = !open">
      toggle
    </button>
  </section>
  <Presence forceMount :present="open" v-slot="{ present }">
    <div :data-present="present">${CONTENT}</div>
  </Presence>`,
    }))
  })

  it('should show content', () => {
    expect(screen.container.innerHTML).toContain(CONTENT)
    // `wrapper.find('div')` is the first `div` in document order; the only
    // other root is a `<section>` whose sole child is a `<button>`, so
    // `querySelector('div')` resolves to the same node. No locator can express
    // "the first div" — this is the documented escape hatch. `getAttribute` +
    // `toBe` rather than the table's `expect.element(…).toHaveAttribute` for
    // the reason in the header: `toHaveAttribute` retries, and a retry on the
    // condition under test is the assertion.
    expect(screen.container.querySelector('div')!.getAttribute('data-present')).toBe('false')
  })

  describe('after clicking trigger', () => {
    beforeEach(async () => {
      await screen.getByRole('button').click()
    })

    it('should show content', () => {
      expect(screen.container.innerHTML).toContain(CONTENT)
      expect(screen.container.querySelector('div')!.getAttribute('data-present')).toBe('true')
    })

    describe('after clicking trigger again', () => {
      beforeEach(async () => {
        // Waits on the pre-interaction state ('true'), never on the 'false'
        // this block asserts.
        await expect
          .element(screen.container.querySelector('div')!)
          .toHaveAttribute('data-present', 'true')
        await screen.getByRole('button').click()
      })

      it('should always show content', () => {
        expect(screen.container.innerHTML).toContain(CONTENT)
        expect(screen.container.querySelector('div')!.getAttribute('data-present')).toBe('false')
      })
    })
  })
})

const styles = `
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

.animate[data-state=open]{
  animation: fadeIn 2s;
}
.animate[data-state=closed]{
  animation: fadeOut 2s;
}`

describe('given a Presence with animated content', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(defineComponent({
      components: { Presence },
      setup: (_props) => {
        const el = ref()

        onMounted(() => {
          const css = document.createElement('style')
          css.appendChild(document.createTextNode(styles))
          el.value.appendChild(css)
        })

        return { open: ref(false), el }
      },
      template: `<div ref="el">
    <button @click="open = !open">
      toggle
    </button>
    <Presence :present="open">
    <div class="animate" :data-state="open ? 'open' : 'closed'">${CONTENT}</div>
  </Presence>
  </div>`,
    }))
  })

  it('should not show content', () => {
    expect(screen.container.innerHTML).not.toContain(CONTENT)
  })

  describe('after clicking trigger', () => {
    beforeEach(async () => {
      await screen.getByRole('button').click()
      // Deliberately NOT a retrying matcher: every assertion in this block is
      // about *when* the content is on screen, and `expect.element` would pass
      // anywhere inside its retry budget. Awaiting the real click already
      // crosses Vue's synchronous-update microtask flush.
    })

    it('should show content', () => {
      expect(screen.container.innerHTML).toContain(CONTENT)
    })

    describe('after clicking trigger again', () => {
      beforeEach(async () => {
        await screen.getByRole('button').click()
      })

      // @finding Presence/Presence.test.ts#animated-content-is-jsdom-only
      it.fails('should not show content', () => {
        // FAILS IN A REAL BROWSER, AND IT IS RIGHT TO. The fixture's own
        // `<style>` really runs here: closing sets `data-state="closed"`,
        // which is `animation: fadeOut 2s`, so `usePresence` reads a changed
        // `animation-name`, dispatches `ANIMATION_OUT` and holds the node
        // mounted until `animationend` — the component's entire reason to
        // exist. jsdom's `getComputedStyle().animationName` is `''` for every
        // element, so it takes the instant-unmount branch and this `describe`
        // duplicates `given a default Presence`. Assertion left exactly as
        // strong as the original's.
        expect(screen.container.innerHTML).not.toContain(CONTENT)
      })
    })
  })
})

describe('given a Presence with an animated descendant', () => {
  it('should ignore bubbled animation events before reading styles', async () => {
    const getComputedStyleSpy = vi.spyOn(globalThis, 'getComputedStyle')
    // Chromium has a real `AnimationEvent` constructor, so the original's
    // `new Event(...)` + `Object.defineProperty(event, 'animationName')` is
    // not needed — see `Presence/Presence.test.ts#synthetic-animation-event`.
    const createAnimationEndEvent = () =>
      new AnimationEvent('animationend', { bubbles: true, animationName: 'child-animation' })

    try {
      const screen = await render(defineComponent({
        components: { Presence },
        template: `<Presence :present="true">
          <div data-testid="presence">
            <span data-testid="animated-child">Child</span>
          </div>
        </Presence>`,
      }))

      const presenceLocator = screen.getByTestId('presence')
      await expect.element(presenceLocator).toBeInTheDocument()
      const presenceElement = presenceLocator.element()
      const animatedChild = screen.getByTestId('animated-child').element()
      getComputedStyleSpy.mockClear()

      presenceElement.dispatchEvent(createAnimationEndEvent())
      expect(getComputedStyleSpy).toHaveBeenCalledWith(presenceElement)
      getComputedStyleSpy.mockClear()

      animatedChild.dispatchEvent(createAnimationEndEvent())
      expect(getComputedStyleSpy).not.toHaveBeenCalledWith(presenceElement)
    }
    finally {
      // No `wrapper.unmount()`: `render` registers `beforeEach(cleanup)`, and a
      // manual unmount would leave its container behind for the rest of the
      // file.
      getComputedStyleSpy.mockRestore()
    }
  })
})
