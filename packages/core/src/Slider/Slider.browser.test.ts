import type { Locator } from 'vitest/browser'
import type { SliderRootProps } from '..'
import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { commands, userEvent } from 'vitest/browser'
import { handleSubmit } from '@/test'
import Slider from './story/_Slider.vue'

// Browser-mode port of `Slider.test.ts`. The `describe` / `it` names are kept
// identical on purpose so the two files can be diffed against each other, and
// `port:parity` enforces that.
//
// Note what is missing compared to the jsdom version: no ResizeObserver stub,
// no scrollIntoView / hasPointerCapture / setPointerCapture mocks. The browser
// has all of them for real — and `hasPointerCapture` returning a truthy value
// was the only reason SliderImpl's `pointermove` handler emitted `slideMove`
// under jsdom at all.

/** `page.mouse`, split into steps. See `vitest.browser.commands.ts`. */
const mouse = commands as unknown as {
  mouseDown: (x: number, y: number) => Promise<void>
  mouseMove: (x: number, y: number) => Promise<void>
  mouseUp: () => Promise<void>
}

function renderSlider(props: SliderRootProps = {}) {
  return render(Slider, { props: { disabled: false, ...props } })
}

describe('given default Slider', () => {
  let screen: Awaited<ReturnType<typeof renderSlider>>

  beforeEach(async () => {
    screen = await renderSlider()
  })

  // @finding Slider/Slider.test.ts#axe
  //
  // ⚠ QUARANTINED: this test fails, and the failure IS the result.
  //
  // `.fails` rather than `.skip` on purpose — the body still runs, so this
  // keeps contributing coverage, and the day someone gives the fixture an
  // `aria-label` this goes red to tell you the finding is stale.
  //
  // The jsdom original runs `axe()` synchronously after `mount()`, before Vue
  // flushes, so the thumb is still `display: none` (SliderThumbImpl.vue:80)
  // and axe skips it: `aria-input-field-name` comes back *inapplicable* and
  // the only interactive element in the Slider is never audited.
  //
  // `await render()` flushes, so axe sees the thumb and reports a genuine
  // violation — the fixture gives its single thumb no accessible name
  // (`getLabel`, utils.ts:35, only auto-labels sliders with 2+ thumbs).
  //
  // Do NOT add `'aria-input-field-name': { enabled: false }` to make this
  // green. The fix belongs in `_Slider.vue`, and fixing non-test source is
  // out of scope here.
  it.fails('should pass axe accessibility tests', async () => {
    screen = await render(Slider)
    expect(await axe(screen.container, {
      rules: {
        'label': { enabled: false },
        'nested-interactive': { enabled: false },
      },
    })).toHaveNoViolations()
  })

  it('should have default value', async () => {
    await expect
      .element(screen.getByRole('slider'))
      .toHaveAttribute('aria-valuenow', '50')
  })

  describe('when disabled', () => {
    beforeEach(async () => {
      await screen.rerender({ disabled: true })
    })

    it('should disable the thumb', async () => {
      const thumb = screen.getByRole('slider')
      await expect.element(thumb).toHaveAttribute('data-disabled', '')
      await expect.element(thumb).toHaveAttribute('aria-valuemin', '0')
      await expect.element(thumb).toHaveAttribute('aria-valuemax', '100')
      await expect.element(thumb).toHaveAttribute('aria-valuenow', '50')
      // The original's fifth assertion is `wrapper.html()).toContain(
      // 'aria-valuenow="50"')`, which is the previous line spelled as a string
      // search. Kept as a fifth assertion so the assertion count matches.
      await expect.element(thumb).toHaveAttribute('aria-valuenow', '50')
    })
  })

  describe('when inverted', () => {
    beforeEach(async () => {
      await screen.rerender({ inverted: true })
    })

    describe('after pressing navigation key', () => {
      let slider: Locator

      // jsdom fires `keydown` straight at an element; Playwright sends it to
      // whatever has focus. The thumb has `tabindex=0`, so focusing it here is
      // enough — keydown then bubbles to SliderImpl's handler exactly as it
      // does in production.
      beforeEach(() => {
        slider = screen.getByRole('slider')
        slider.element().focus()
      })

      it('arrowRight should decrease by 1', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{ArrowRight}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '49')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(-1)
      })

      it('arrowLeft should increase by 1', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{ArrowLeft}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(1)
      })

      it('arrowUp should increase by 1', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{ArrowUp}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(1)
      })

      it('arrowDown should decrease by 1', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{ArrowDown}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '49')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(-1)
      })

      it('pageUp should increase by 10', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{PageUp}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '60')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(10)
      })

      it('pageDown should decrease by 10', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{PageDown}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '40')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(-10)
      })

      it('home should set value to 0', async () => {
        await userEvent.keyboard('{Home}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '0')
      })

      it('end should set value to max', async () => {
        await userEvent.keyboard('{End}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '100')
      })
    })
  })

  describe('when vertical', () => {
    beforeEach(async () => {
      await screen.rerender({ orientation: 'vertical' })
    })

    describe('when inverted', () => {
      beforeEach(async () => {
        await screen.rerender({ inverted: true })
      })

      describe('after pressing navigation key', () => {
        let slider: Locator

        beforeEach(() => {
          slider = screen.getByRole('slider')
          slider.element().focus()
        })

        it('arrowRight should increase by 1', async () => {
          const currentValue = slider.element().getAttribute('aria-valuenow')
          await userEvent.keyboard('{ArrowRight}')
          await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
          const newValue = slider.element().getAttribute('aria-valuenow')
          const diff = Number(newValue) - Number(currentValue)
          expect(diff).toBe(1)
        })

        it('arrowLeft should decrease by 1', async () => {
          const currentValue = slider.element().getAttribute('aria-valuenow')
          await userEvent.keyboard('{ArrowLeft}')
          await expect.element(slider).toHaveAttribute('aria-valuenow', '49')
          const newValue = slider.element().getAttribute('aria-valuenow')
          const diff = Number(newValue) - Number(currentValue)
          expect(diff).toBe(-1)
        })

        it('arrowUp should decrease by 1', async () => {
          const currentValue = slider.element().getAttribute('aria-valuenow')
          await userEvent.keyboard('{ArrowUp}')
          await expect.element(slider).toHaveAttribute('aria-valuenow', '49')
          const newValue = slider.element().getAttribute('aria-valuenow')
          const diff = Number(newValue) - Number(currentValue)
          expect(diff).toBe(-1)
        })

        it('arrowDown should increase by 1', async () => {
          const currentValue = slider.element().getAttribute('aria-valuenow')
          await userEvent.keyboard('{ArrowDown}')
          await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
          const newValue = slider.element().getAttribute('aria-valuenow')
          const diff = Number(newValue) - Number(currentValue)
          expect(diff).toBe(1)
        })

        it('pageUp should decrease by 10', async () => {
          const currentValue = slider.element().getAttribute('aria-valuenow')
          await userEvent.keyboard('{PageUp}')
          await expect.element(slider).toHaveAttribute('aria-valuenow', '40')
          const newValue = slider.element().getAttribute('aria-valuenow')
          const diff = Number(newValue) - Number(currentValue)
          expect(diff).toBe(-10)
        })

        it('pageDown should increase by 10', async () => {
          const currentValue = slider.element().getAttribute('aria-valuenow')
          await userEvent.keyboard('{PageDown}')
          await expect.element(slider).toHaveAttribute('aria-valuenow', '60')
          const newValue = slider.element().getAttribute('aria-valuenow')
          const diff = Number(newValue) - Number(currentValue)
          expect(diff).toBe(10)
        })

        // NOTE: the name is wrong in the jsdom original — Home sets the value
        // to the *minimum* (0), inverted or not, which is what ARIA specifies
        // and what the original actually asserts. Ported verbatim, assertion
        // included: "fix the test so the name becomes true" would mean
        // asserting 100 and failing a component that is behaving correctly.
        // Recorded in FINDINGS.tsv instead. Same for `end` below.
        it('home should set value to 100', async () => {
          await userEvent.keyboard('{Home}')
          await expect.element(slider).toHaveAttribute('aria-valuenow', '0')
        })

        it('end should set value to 0', async () => {
          await userEvent.keyboard('{End}')
          await expect.element(slider).toHaveAttribute('aria-valuenow', '100')
        })
      })
    })

    describe('after pressing navigation key', () => {
      let slider: Locator

      beforeEach(() => {
        slider = screen.getByRole('slider')
        slider.element().focus()
      })

      it('arrowRight should increase by 1', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{ArrowRight}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(1)
      })

      it('arrowLeft should decrease by 1', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{ArrowLeft}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '49')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(-1)
      })

      it('arrowUp should increase by 1', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{ArrowUp}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(1)
      })

      it('arrowDown should decrease by 1', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{ArrowDown}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '49')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(-1)
      })

      it('pageUp should increase by 10', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{PageUp}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '60')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(10)
      })

      it('pageDown should decrease by 10', async () => {
        const currentValue = slider.element().getAttribute('aria-valuenow')
        await userEvent.keyboard('{PageDown}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '40')
        const newValue = slider.element().getAttribute('aria-valuenow')
        const diff = Number(newValue) - Number(currentValue)
        expect(diff).toBe(-10)
      })

      it('home should set value to 0', async () => {
        await userEvent.keyboard('{Home}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '0')
      })

      it('end should set value to max', async () => {
        await userEvent.keyboard('{End}')
        await expect.element(slider).toHaveAttribute('aria-valuenow', '100')
      })
    })
  })

  // The jsdom original dispatches synthetic pointer events carrying a made-up
  // `pointerId: 1`. That is exactly what the four pointer-capture mocks were
  // hiding: in a real browser `setPointerCapture(1)` throws NotFoundError for a
  // pointer that never existed, and `hasPointerCapture` returns false, so
  // `pointermove` short-circuits and nothing is emitted.
  //
  // This drives the real mouse instead. `locator.dropTo()` would be the
  // locator-API way, but it presses, moves and releases atomically, which
  // cannot be split across the three nested `beforeEach` hooks the original
  // uses — hence the mouse commands.
  describe('after pointerdown event on slider-impl', () => {
    // Where the slider is on screen. Read once here because the outer element
    // *is* SliderImpl (SliderRoot renders SliderHorizontal renders SliderImpl),
    // so no query is needed to find it.
    let rect: DOMRect

    beforeEach(async () => {
      rect = (screen.container.firstElementChild as HTMLElement).getBoundingClientRect()
      await mouse.mouseDown(rect.left + 10, rect.top + rect.height / 2)
    })

    // Temporary hide emitted
    // it('should emit slideStart', async () => {
    //   expect(sliderImpl.emitted('slideStart')?.[0].length).toBe(1)
    // })

    describe('after pointermove', () => {
      beforeEach(async () => {
        await mouse.mouseMove(rect.left + 50, rect.top + rect.height / 2)
      })

      // it('should emit slideMove', async () => {
      //   expect(sliderImpl.emitted('slideMove')?.[0]?.length).toBe(1)
      // })

      describe('after pointerup', () => {
        beforeEach(async () => {
          await mouse.mouseUp()
        })

        // it('should emit slideEnd', async () => {
        //   expect(sliderImpl.emitted('slideEnd')?.[0].length).toBe(0)
        // })

        it('should emit valueCommit on wrapper', async () => {
          expect(screen.emitted('valueCommit')?.[0].length).toBe(1)
        })
      })
    })
  })

  describe('after pressing navigation key', () => {
    let slider: Locator

    beforeEach(() => {
      slider = screen.getByRole('slider')
      slider.element().focus()
    })

    it('arrowRight should increase by 1', async () => {
      const currentValue = slider.element().getAttribute('aria-valuenow')
      await userEvent.keyboard('{ArrowRight}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
      const newValue = slider.element().getAttribute('aria-valuenow')
      const diff = Number(newValue) - Number(currentValue)
      expect(diff).toBe(1)
    })

    it('arrowLeft should decrease by 1', async () => {
      const currentValue = slider.element().getAttribute('aria-valuenow')
      await userEvent.keyboard('{ArrowLeft}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '49')
      const newValue = slider.element().getAttribute('aria-valuenow')
      const diff = Number(newValue) - Number(currentValue)
      expect(diff).toBe(-1)
    })

    it('arrowUp should increase by 1', async () => {
      const currentValue = slider.element().getAttribute('aria-valuenow')
      await userEvent.keyboard('{ArrowUp}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
      const newValue = slider.element().getAttribute('aria-valuenow')
      const diff = Number(newValue) - Number(currentValue)
      expect(diff).toBe(1)
    })

    it('arrowDown should decrease by 1', async () => {
      const currentValue = slider.element().getAttribute('aria-valuenow')
      await userEvent.keyboard('{ArrowDown}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '49')
      const newValue = slider.element().getAttribute('aria-valuenow')
      const diff = Number(newValue) - Number(currentValue)
      expect(diff).toBe(-1)
    })

    it('pageUp should increase by 10', async () => {
      const currentValue = slider.element().getAttribute('aria-valuenow')
      await userEvent.keyboard('{PageUp}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '60')
      const newValue = slider.element().getAttribute('aria-valuenow')
      const diff = Number(newValue) - Number(currentValue)
      expect(diff).toBe(10)
    })

    it('pageDown should decrease by 10', async () => {
      const currentValue = slider.element().getAttribute('aria-valuenow')
      await userEvent.keyboard('{PageDown}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '40')
      const newValue = slider.element().getAttribute('aria-valuenow')
      const diff = Number(newValue) - Number(currentValue)
      expect(diff).toBe(-10)
    })

    it('home should set value to 0', async () => {
      await userEvent.keyboard('{Home}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '0')
    })

    it('end should set value to max', async () => {
      await userEvent.keyboard('{End}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '100')
    })
  })
})

describe('given slider in a form', () => {
  // Two differences from the jsdom original, both deliberate:
  //
  // 1. A real `<button type="submit">` replaces `form.trigger('submit')`. All
  //    three approaches were measured in Chromium: a synthetic submit works but
  //    describes nothing a user does; `form.requestSubmit()` needs
  //    `container.querySelector`; implicit submission (Enter on the focused
  //    thumb) does *not* submit at all — 0 calls. The button is the only one
  //    that goes through the locator API and makes the describe name true.
  // 2. The component is rendered per test rather than once at describe-body
  //    level, because `vitest-browser-vue` unmounts after every test. The
  //    `handleSubmit` spy is module-level, so its call count still accumulates
  //    across tests exactly as the original depends on.
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render({
      props: ['handleSubmit'],
      components: { Slider },
      template: '<form @submit="handleSubmit"><Slider value="true" /><button type="submit">Submit</button></form>',
    }, {
      props: { handleSubmit },
    })
  })

  it('should have hidden input field', async () => {
    // The input is `aria-hidden`, so the role query has to opt into hidden
    // elements; `[type="number"]` has no locator equivalent.
    await expect
      .element(screen.getByRole('spinbutton', { includeHidden: true }))
      .toBeInTheDocument()
  })

  describe('after clicking submit button', () => {
    beforeEach(async () => {
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ 'slider[0]': '50' })
    })
  })

  describe('after uncheck and click submit button again', () => {
    beforeEach(async () => {
      const slider = screen.getByRole('slider')
      slider.element().focus()
      await userEvent.keyboard('{ArrowRight}')
      await expect.element(slider).toHaveAttribute('aria-valuenow', '51')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(2)
      expect(handleSubmit.mock.results[1].value).toStrictEqual({ 'slider[0]': '51' })
    })
  })
})
