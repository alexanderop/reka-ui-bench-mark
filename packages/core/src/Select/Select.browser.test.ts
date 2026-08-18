import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { handleSubmit } from '@/test'
import SelectUnmountCleanup from './__test__/SelectUnmountCleanup.vue'
import Select from './story/_SelectTest.vue'

// Browser-mode port of `Select.test.ts`. First T4 file, and the first port to
// run `vi.useFakeTimers()` in the browser. The jsdom original's whole opening
// ritual collapses here, because a real click IS the compatibility sequence
// the original had to hand-assemble:
//
//  1. The original opens with `trigger('pointerdown')` alone, which leaves
//     `triggerPointerDownPosRef` set — so `SelectContentImpl.vue:151`'s
//     document-capture pointerup guard swallows the *next* pointerup, and every
//     selection needs the famous second `fireEvent.pointerUp`. A real trigger
//     click delivers its own pointerup at the unchanged pointer position
//     (delta 0 ≤ 10px), which is exactly the "accidental pointerup" the guard
//     exists for: the guard consumes it and disarms. The option click that
//     follows is then a fresh pointerdown+pointerup pair and selects on the
//     first try. The two-pointerup hack does not port because the thing it
//     worked around does not happen to a real pointer.
//     See `Select/Select.test.ts#pointerup-guard-consumed-by-real-click`.
//  2. Opening also makes the select modal: `DismissableLayer` sets
//     `document.body.style.pointerEvents = 'none'` (DismissableLayer.vue:173),
//     and Chromium's hit-testing honours it, so every element outside the
//     content — the trigger included — is unclickable while the modal is open.
//     jsdom has no hit-testing, so the original could keep "clicking" through
//     the modal. Two hooks are affected; see the notes at those sites and
//     `Select/Select.test.ts#modal-blocks-outside-clicks` /
//     `Select/Select.test.ts#reopen-gesture-inert`.
//  3. `attachTo: document.body` is dropped (render throws on it) and the
//     `document.body.innerHTML = ''` resets with it: `_SelectTest.vue` portals
//     into its own `#here` div, so all content stays inside `screen.container`,
//     and `SelectUnmountCleanup`'s body-portalled content is removed by
//     `render`'s own cleanup.
//  4. A real `<button type="submit">` replaces `form.trigger('submit')`,
//     following the `Slider/Slider.test.ts#form-submit-button` precedent.
//     See `Select/Select.test.ts#form-submit-button`.

describe('given default Select', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Select>>>
  let valueBox: HTMLElement

  const options = () => screen.container.querySelectorAll('[role=option]')

  beforeEach(async () => {
    screen = await render(Select)
    // The trigger itself — `aria-label` is on `SelectTrigger`.
    valueBox = screen.container.querySelector('[aria-label="Customise options"]') as HTMLElement
  })

  it('should pass axe accessibility tests', async () => {
    // `wrapper.element` in the original — the fixture's single root div.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should show placeholder', () => {
    expect(valueBox.textContent).toContain('Please select a fruit')
    const selectTrigger = screen.container.querySelector('[role="combobox"]') as HTMLElement
    expect(selectTrigger.getAttribute('data-placeholder')).toBe('')
  })

  describe('trigger mouse interop', () => {
    it('should not suppress window mousedown listeners when opening (#1773)', async () => {
      // The original dispatches pointerdown + a hand-built mousedown and then
      // inspects the dispatched event object. A real click delivers the real
      // compatibility mousedown; the capture listener (kept capture, as in the
      // original) grabs the event so `defaultPrevented` can be read after the
      // gesture completes — by which point `onTriggerMouseDown`'s
      // `preventDefault` (SelectTrigger.vue) has run.
      const onWindowMousedown = vi.fn()
      window.addEventListener('mousedown', onWindowMousedown, true)

      await screen.getByRole('combobox').click()

      expect(onWindowMousedown).toHaveBeenCalled()
      expect((onWindowMousedown.mock.calls[0][0] as MouseEvent).defaultPrevented).toBe(true)

      window.removeEventListener('mousedown', onWindowMousedown, true)
    })

    it('should focus the trigger on click without a preceding pointerdown', async () => {
      // The scenario is a `click` with no pointer gesture at all — Safari's
      // label-associated click. `HTMLElement.click()` is that scenario
      // verbatim: it dispatches a lone `click` event and nothing else, which
      // is exactly what the jsdom original fired.
      const trigger = screen.container.querySelector('[role="combobox"]') as HTMLElement
      const focusSpy = vi.spyOn(trigger, 'focus')

      trigger.click()

      expect(focusSpy).toHaveBeenCalled()
      focusSpy.mockRestore()
    })

    it('should not re-focus the trigger on click after opening via pointerdown', async () => {
      // One real click covers the original's two dispatches: its pointerdown
      // opens and latches `openedFromPointerDown`, and the compatibility click
      // that follows must then not re-focus.
      const trigger = screen.container.querySelector('[role="combobox"]') as HTMLElement
      const focusSpy = vi.spyOn(trigger, 'focus')

      await screen.getByRole('combobox').click()

      expect(focusSpy).not.toHaveBeenCalled()
      focusSpy.mockRestore()
    })

    it('should not leave focus on the trigger after opening via mouse click', async () => {
      const trigger = screen.container.querySelector('[role="combobox"]') as HTMLElement

      // `openSelectWithMouseClick` in the original — pointerdown, then the
      // compatibility mousedown/mouseup/click. A real click is that sequence.
      await screen.getByRole('combobox').click()

      // `exact: true` matters: role-name matching is substring by default, so
      // a bare `'Apple'` resolves to Pine**apple** as well and violates strict
      // mode. Same family as the `getByText` substring gotcha in `AGENTS.md`.
      await expect.element(screen.getByRole('option', { name: 'Apple', exact: true })).toBeInTheDocument()
      expect(document.activeElement).not.toBe(trigger)
    })
  })

  describe('opening the modal', () => {
    beforeEach(async () => {
      await screen.getByRole('combobox').click()
      // Own the wait here so the tests below can read synchronously, as the
      // original does after its `nextTick`.
      await expect.element(screen.getByRole('group')).toBeInTheDocument()
    })

    it('should pass axe accessibility tests', async () => {
      // We have hidden children such as icon, thus disabling this
      expect(await axe(screen.container.firstElementChild!, {
        rules: {
          'aria-required-children': { enabled: false },
        },
      })).toHaveNoViolations()
    })

    it('should show the modal content', () => {
      expect(screen.container.textContent).toContain('Apple')
    })

    describe('after selecting a value', () => {
      beforeEach(async () => {
        // Focus + two pointerups in the original; one real click here — see
        // note 1 at the top of the file. The click's pointerdown focuses the
        // item (SelectItem.vue:172) exactly as the original's `.focus()` did.
        await screen.getByRole('option').nth(1).click()
        // Selection closes a single-select; wait on the trigger's state so the
        // synchronous reads below happen after the same flush the original's
        // awaited trigger gave it.
        await expect.element(screen.getByRole('combobox')).toHaveAttribute('data-state', 'closed')
      })

      it('should show value correctly', () => {
        expect(valueBox.textContent).toContain('Banana')
      })

      it('should close the modal', () => {
        const group = screen.container.querySelector('[role=group]')
        expect(group).toBeFalsy()
      })

      describe('after opening the modal again', () => {
        beforeEach(async () => {
          await screen.getByRole('combobox').click()
          await expect.element(screen.getByRole('group')).toBeInTheDocument()
        })

        it('should focus on the selected value', () => {
          const selection = options()[1]
          expect(selection.getAttribute('data-state')).toBe('checked')
        })

        it('should render the icon', async () => {
          // `@iconify/vue` loads icon data asynchronously, so the `<svg>` can
          // land a beat after the indicator mounts — poll instead of a single
          // synchronous read.
          await expect.poll(() => options()[1].innerHTML).toContain('svg')
        })
      })
    })
  })
})

describe('given Select with multiple props', async () => {
  let screen: Awaited<ReturnType<typeof render<typeof Select>>>
  let valueBox: HTMLElement

  const options = () => screen.container.querySelectorAll('[role=option]')

  beforeEach(async () => {
    screen = await render(Select, { props: { multiple: true } })
    valueBox = screen.container.querySelector('[aria-label="Customise options"]') as HTMLElement
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  describe('opening the modal', () => {
    beforeEach(async () => {
      await screen.getByRole('combobox').click()
      await expect.element(screen.getByRole('group')).toBeInTheDocument()
    })

    it('should pass axe accessibility tests', async () => {
      // We have hidden children such as icon, thus disabling this
      expect(await axe(screen.container.firstElementChild!, {
        rules: {
          'aria-required-children': { enabled: false },
        },
      })).toHaveNoViolations()
    })

    it('should show the modal content', () => {
      expect(screen.container.textContent).toContain('Apple')
    })

    describe('after selecting a value', () => {
      beforeEach(async () => {
        await screen.getByRole('option').nth(1).click()
        // A multiple-select stays open; wait on the selection instead.
        await expect.element(screen.getByRole('option').nth(1)).toHaveAttribute('data-state', 'checked')
      })

      it('should show value correctly', () => {
        expect(valueBox.textContent).toContain('Banana')
      })

      it('should close the modal', () => {
        const group = screen.container.querySelector('[role=group]')
        expect(group).toBeTruthy()
      })

      describe('after opening the modal again', () => {
        beforeEach(async () => {
          // Deliberately no gesture. The original fires `pointerdown` on the
          // trigger here, but in multiple mode the modal never closed, and an
          // element outside an open modal layer cannot receive a real pointer
          // event (`document.body` is `pointer-events: none` — note 2 at the
          // top of the file). The jsdom gesture was also a state no-op:
          // `onOpenChange(true)` with `open` already true changes nothing; its
          // only real effect was re-arming the pointerup guard, which is why
          // the original's next selection needed two pointerups again. The
          // state this describe wants — modal open, Banana selected — already
          // holds. See `Select/Select.test.ts#reopen-gesture-inert`.
          await expect.element(screen.getByRole('group')).toBeInTheDocument()
        })

        it('should focus on the selected value', () => {
          const selection = options()[1]
          expect(selection.getAttribute('data-state')).toBe('checked')
        })

        it('should render the icon', async () => {
          await expect.poll(() => options()[1].innerHTML).toContain('svg')
        })

        describe('after selecting another value', () => {
          beforeEach(async () => {
            await screen.getByRole('option').nth(2).click()
            await expect.element(screen.getByRole('option').nth(2)).toHaveAttribute('data-state', 'checked')
          })

          it('should show value correctly', () => {
            expect(valueBox.textContent).toContain('Banana')
            expect(valueBox.textContent).toContain('Blueberry')
          })

          it('should not close the modal', () => {
            const group = screen.container.querySelector('[role=group]')
            expect(group).toBeTruthy()
          })
        })

        describe('after unselecting the value', () => {
          it('should have data placeholder attribute', async () => {
            await screen.getByRole('option').nth(1).click()

            await expect.element(screen.getByRole('combobox')).toHaveAttribute('data-placeholder', '')
          })
        })
      })
    })
  })
})

describe('given Select with object type', async () => {
  let screen: Awaited<ReturnType<typeof render<typeof Select>>>
  let valueBox: HTMLElement

  beforeEach(async () => {
    screen = await render(Select, { props: { options: ['Apple', 'Banana', 'Blueberry', 'Grapes', 'Pineapple'].map(i => ({ label: i, value: i.toLowerCase() })) } })
    valueBox = screen.container.querySelector('[aria-label="Customise options"]') as HTMLElement
  })

  describe('opening the modal', () => {
    beforeEach(async () => {
      await screen.getByRole('combobox').click()
      await expect.element(screen.getByRole('group')).toBeInTheDocument()
    })

    describe('after selecting a value', () => {
      beforeEach(async () => {
        await screen.getByRole('option').nth(1).click()
        await expect.element(screen.getByRole('combobox')).toHaveAttribute('data-state', 'closed')
      })

      it('should show value correctly', () => {
        // The fixture interpolates the whole option object, so the rendered
        // text carries both the label and the lowercase value.
        expect(valueBox.textContent).toContain('banana')
        expect(valueBox.textContent).toContain('Banana')
      })

      it('should close the modal', () => {
        const group = screen.container.querySelector('[role=group]')
        expect(group).toBeFalsy()
      })
    })
  })
})

describe('given SelectContent cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should clear delayed presence updates when unmounted after closing', async () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const screen = await render(SelectUnmountCleanup)

    // The fixture mounts open; the content portals to `document.body` (its
    // `SelectPortal` has no target), so this is document-scoped on purpose.
    await expect.element(screen.getByRole('listbox')).toBeInTheDocument()

    // The original clicks the fixture's Close button. Neither input can do
    // that here, and each failure is its own measurement:
    //  - a *pointer* can't reach it: the open select is modal, so the button
    //    sits under `body { pointer-events: none }` and Chromium's hit-testing
    //    never delivers the click (note 2 at the top of the file);
    //  - the *keyboard* can be sabotaged: focusing Close and pressing Enter
    //    worked only until `watch(isPositioned)` (SelectContentImpl.vue:129)
    //    ran `focusSelectedItem` and stole focus back to the first item — at
    //    which point Enter selected the item and closed *by selection*,
    //    leaving the Close handler uncovered while every assertion still
    //    passed. Under fake timers the steal is unbounded, because
    //    `vi.useFakeTimers()` fakes rAF by default and popper positioning is
    //    frozen until something lets a frame through (measured: the steal
    //    fired mid-`userEvent.keyboard` RPC).
    // So the port closes with Escape — the closing gesture a real user
    // actually has for a modal select — which drives the layer's own
    // escapeKeyDown -> dismiss path into the identical
    // `open -> false -> watch(present)` timer this test is about
    // (SelectContent.vue:64). The fixture's `@click` line is the one honest
    // coverage loss, argued in PORT-COVERAGE-ALLOW.tsv.
    // See `Select/Select.test.ts#modal-blocks-outside-clicks`.
    //
    // The focus() below is load-bearing even though Escape does not need it:
    // focus landing outside the open layer drives `useFocusOutside` ->
    // FOCUS_OUTSIDE -> the layer's focusOutside callback, which
    // SelectContentImpl declaratively prevents (`@focus-outside.prevent`) —
    // the whole path the jsdom file only ever reached through leaked zombie
    // instances (see `Select/Select.test.ts#outside-press-coverage-is-zombie`).
    const closeButton = screen.getByRole('button', { name: 'Close' })
    ;(closeButton.element() as HTMLElement).focus()
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('listbox')).not.toBeInTheDocument()

    const timerCountAfterClose = vi.getTimerCount()
    expect(timerCountAfterClose).toBeGreaterThan(0)

    // Close unmounted the layer, which synchronously restored the body's
    // pointer-events (DismissableLayer.vue:190) — the Unmount button is
    // clickable again even with the clock frozen, because Playwright's
    // actionability runs on real time outside the page.
    await screen.getByRole('button', { name: 'Unmount' }).click()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBeLessThan(timerCountAfterClose)
  })
})

describe('given Select in a form', async () => {
  let screen: Awaited<ReturnType<typeof render>>

  // Rendered per test rather than once in the describe body: `render` unmounts
  // after every test, and the selected value does not carry over, so the second
  // submit block selects its own option on a fresh instance — which is also
  // what the original did (it picked a different option each time).
  //
  // `handleSubmit` is a module-level `vi.fn()` shared across files, so it is
  // cleared per test and each block asserts its *own* single submit. The
  // original's (1, then 2) ladder made the second test pass only because a
  // sibling ran first — order-coupling that Vitest 5's `clearMocks: true`
  // default turns red (measured: 7 files). Owning the count also makes the
  // test name true.
  beforeEach(async () => {
    handleSubmit.mockClear()
    screen = await render({
      props: ['handleSubmit'],
      components: { Select },
      template: '<form @submit="handleSubmit"><Select name="test" value="true" /><button type="submit">Submit</button></form>',
    }, {
      props: { handleSubmit },
    })
  })

  it('should have hidden input field', async () => {
    expect(!!screen.container.querySelector('select')).toBe(true)
  })

  it('should use the nullableValue for the hidden select when the value is nullish', async () => {
    // A second render inside one test — the two containers coexist (measured
    // in `Separator`); the queries below are scoped to the new one.
    const second = await render({
      components: { Select },
      template: '<form><Select name="test" nullable-value="null" /></form>',
    })

    const optionEls = second.container.querySelectorAll('select option')
    expect((optionEls[0] as HTMLOptionElement).value).toBe('null')
  })

  describe('after selecting option and clicking submit button', () => {
    beforeEach(async () => {
      await screen.getByRole('combobox').click()
      await expect.element(screen.getByRole('group')).toBeInTheDocument()
      await screen.getByRole('option').nth(1).click()
      await expect.element(screen.getByRole('combobox')).toHaveAttribute('data-state', 'closed')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: 'Banana' })
    })
  })

  describe('after selecting other option and click submit button again', () => {
    beforeEach(async () => {
      await screen.getByRole('combobox').click()
      await expect.element(screen.getByRole('group')).toBeInTheDocument()
      await screen.getByRole('option').nth(4).click()
      await expect.element(screen.getByRole('combobox')).toHaveAttribute('data-state', 'closed')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: 'Pineapple' })
    })
  })
})
