import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, h, markRaw, ref } from 'vue'
import { Primitive } from '.'

// Browser-mode port of `Primitive.test.ts`. The T2 control of its batch: the
// original installs no stubs, touches no geometry, runs no axe, and is pure
// `@vue/test-utils` — so there is nothing to delete and the port is mechanical.
// Four translation notes, all of them about VTU query semantics rather than
// about the browser:
//
//  1. `wrapper.find(sel)` / `wrapper.findAll(sel)` on a *VueWrapper* go through
//     `findAllDOMElements`, which matches the component's ROOT nodes as well as
//     their descendants (`vue-test-utils.esm-bundler.mjs:7046-7056`). That is
//     why `mount(Primitive).find('div')` resolves to the root div at all.
//     `vitest-browser-vue` unwraps VTU's own mount div (`pure-epEwB8Ps.js:29`,
//     `unwrapNode(wrapper.parentElement)`), so every root ends up a direct child
//     of `screen.container` and `container.querySelector(sel)` is the exact
//     equivalent — roots included.
//  2. `DOMWrapper.findAll(sel)` is plain `element.querySelectorAll` (L7247) and
//     therefore does NOT include the wrapped element. `element.querySelectorAll`
//     is the equivalent. The two differ, so they are translated differently:
//     see `should renders multiple child elements` (root excluded) against
//     `should not throw error when multiple child elements exists` (roots
//     included).
//  3. No locator can address a bare `<div>` or a href-less `<a>` — both are
//     role `generic` — so those queries stay on `container.querySelector`, per
//     the translation table. The two cases that DO have a role
//     (`as: 'button'`, `asChild` over a `<button>`) use `getByRole`.
//  4. There is no `.html()` on a render result. `wrapper.html()` becomes
//     `screen.container.firstElementChild.outerHTML`, and `element.html()`
//     becomes `element.outerHTML`. Both originals are single-line elements, so
//     VTU's pretty-printing does not change the string.
//
// Deviations from the original body, both recorded in `FINDINGS.tsv`:
//
//  - `should merge child's class after update` re-queries the element after
//     each click instead of holding one `DOMWrapper`, and asserts the toggle
//     actually happened (`data-active`) before reading the class back. The
//     re-query is strictly stronger than the original, which holds one
//     `DOMWrapper` and would silently read a detached node if Vue ever replaced
//     the element. The `data-active` settle is a guard, NOT a fix for a race
//     that exists: measured, `await locator.click()` already returns after
//     Vue's flush — a synchronous `getAttribute('data-active')` immediately
//     after it reads the NEW value, 4 runs out of 4. That is structural rather
//     than lucky (the click round-trips to the Playwright server, many
//     macrotasks after the microtask Vue flushes on), but it only holds for
//     synchronous state updates. See
//     `Primitive/Primitive.test.ts#click-already-flushed`.
//  - `should not throw error when multiple child elements exists` calls
//     `render` twice in one test, exactly as the original calls `mount` twice.
//     Both containers coexist for the rest of the test, which is why every
//     query here is `container`-scoped rather than document-scoped. See
//     `Primitive/Primitive.test.ts#not-throw-vacuous`.

describe('test Primitive functionalities', () => {
  it('should render div element correctly', async () => {
    const screen = await render(Primitive)

    expect(screen.container.querySelector('div')).not.toBeNull()
  })

  it('should render button element correctly', async () => {
    const screen = await render(Primitive, {
      props: {
        as: 'button',
      },
    })

    // The TAG is the assertion, and it has to be — the original is
    // `wrapper.find('button')`, and on a component whose entire job is choosing
    // which element to render, a role query is NOT an equivalent translation.
    // Measured: making `as: 'button'` emit `h('div', { role: 'button' })`
    // instead of a real <button> leaves a role-only port 15/15 green while the
    // jsdom original goes red. See
    // `Primitive/Primitive.test.ts#tag-not-role`.
    expect(screen.container.querySelector('button')).not.toBeNull()
    // Kept as a strengthening on top, not as the translation: a real <button>
    // is also exposed as one in the accessibility tree.
    await expect.element(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should by pass the comment tag', async () => {
    const screen = await render(Primitive, {
      props: {
        as: 'template',
      },
      attrs: {
        'data-parent-attr': '',
      },
      slots: {
        default: `
        <!-- this is a comment -->
        <div data-child-attr>Child class</div>
        `,
      },
    })

    const element = screen.container.querySelector('div')!
    await expect.element(element).toHaveAttribute('data-parent-attr', '')
    await expect.element(element).toHaveAttribute('data-child-attr', '')
  })

  it('should renders div element with custom attribute', async () => {
    const screen = await render(Primitive, {
      attrs: {
        type: 'button',
      },
    })

    const element = screen.container.querySelector('div')!

    // `'type' in HTMLDivElement.prototype` is false in both environments, so
    // Vue's `shouldSetAsProp` takes the `setAttribute` path and this is a real
    // content attribute in Chromium — not the `nonce` hazard from
    // `Viewport/Viewport.test.ts#nonce-attribute`.
    await expect.element(element).toHaveAttribute('type', 'button')
  })

  it('should renders multiple child elements', async () => {
    const screen = await render(Primitive, {
      slots: {
        default: '<div>1</div><div>2</div><div>3</div>',
      },
    })

    // The original's `element` is the root div and `element.findAll('div')` is
    // a DOMWrapper findAll, i.e. descendants only — hence querySelectorAll on
    // the root rather than on the container.
    const element = screen.container.querySelector('div')!
    expect(element.querySelectorAll('div').length).toBe(3)
  })

  // ref: https://vitest.dev/api/expect.html#tothrowerror
  describe('render as template (asChild)', () => {
    it('should not throw error when multiple child elements exists', async () => {
      const renderPrimitive = () => render(Primitive, {
        props: {
          as: 'template',
        },
        slots: {
          default: '<div>1</div><div>2</div><div>3</div>',
        },
      })

      const screen = await renderPrimitive()
      // Three fragment roots, all direct children of the container.
      expect(screen.container.querySelectorAll('div').length).toBe(3)
      // `render` mounts synchronously (`pure-epEwB8Ps.js:25`), so a synchronous
      // throw from `Slot` is caught here exactly as it is by the original.
      // Ported verbatim, but this assertion is unfalsifiable in both
      // environments and is kept only because rule 4 forbids changing it — see
      // `Primitive/Primitive.test.ts#not-throw-vacuous`.
      expect(() => renderPrimitive()).not.toThrowError(/invalid children/)
    })

    it('should pass custom attribute to first element', async () => {
      const screen = await render(Primitive, {
        props: {
          as: 'template',
          type: 'button',
        },
        slots: {
          default: '<div>1</div><div>2</div><div>3</div>',
        },
      })

      const element = screen.container.querySelectorAll('div')
      await expect.element(element[0] as HTMLElement).toHaveAttribute('type', 'button')
      await expect.element(element[1] as HTMLElement).not.toHaveAttribute('type')
      await expect.element(element[2] as HTMLElement).not.toHaveAttribute('type')
    })

    it('should merge child\'s class together', async () => {
      const screen = await render(Primitive, {
        props: {
          as: 'template',
        },
        attrs: {
          class: 'parent-class',
        },
        slots: {
          default:
            '<div class="child-class more-child-class">Child class</div>',
        },
      })

      const element = screen.container.querySelector('div')!
      await expect.element(element).toHaveAttribute(
        'class',
        'parent-class child-class more-child-class',
      )
    })

    it('should merge child\'s class after update', async () => {
      const Container = defineComponent({
        components: { Primitive },
        template: `
          <Primitive as="template" class="parent-class">
            <slot />
          </Primitive>
        `,
      })
      const TestComponent = defineComponent({
        components: { Container },
        setup() {
          const isActive = ref(true)
          const toggleActive = () => isActive.value = !isActive.value
          return { isActive, toggleActive }
        },
        template: `
          <section :data-active="isActive" @click="toggleActive">
            <Container>
              <div class="child-class more-child-class">
                <slot>Slot Fallback</slot>
              </div>
            </Container>
          </section>
        `,
      })

      const screen = await render(TestComponent)
      const section = screen.container.querySelector('section')!
      const classOf = () => screen.container.querySelector('div')!.getAttribute('class')

      expect(classOf()).toBe('parent-class child-class more-child-class')

      // A real click on the merged element. The div carries the text "Slot
      // Fallback", so it has a box and is clickable — unlike the contentless
      // primitives in `Toggle`/`Switch`.
      await page.elementLocator(screen.container.querySelector('div') as HTMLElement).click()
      // Settle: prove the re-render the test is named for actually happened
      // before reading the class back. Without this the synchronous read can
      // beat Vue's flush and the test passes without exercising the patch.
      await expect.element(section).toHaveAttribute('data-active', 'false')
      expect(classOf()).toBe('parent-class child-class more-child-class')

      await page.elementLocator(screen.container.querySelector('div') as HTMLElement).click()
      await expect.element(section).toHaveAttribute('data-active', 'true')
      expect(classOf()).toBe('parent-class child-class more-child-class')
    })

    it('should render the Component that passed in as', async () => {
      const Button = markRaw(defineComponent({
        setup(props, { slots }) {
          return () => h('button', { id: 'custom-button' }, slots)
        },
      }))

      const screen = await render(Primitive, {
        props: {
          as: Button,
        },
        attrs: {
          class: 'parent-class',
        },
      })

      expect(screen.container.firstElementChild!.outerHTML).toBe(
        '<button id="custom-button" class="parent-class"></button>',
      )
    })

    it('should render the child class element tag', async () => {
      const screen = await render(Primitive, {
        props: {
          as: 'template',
        },

        slots: {
          default: '<a>Child class</a>',
        },
      })

      // A href-less `<a>` has no role, so there is no locator for it.
      const element = screen.container.querySelector('a')
      expect(element).toBeTruthy()
    })

    it('should render the child component', async () => {
      const ChildComponent = {
        template: '<div id="child">Hello world</div>',
      }
      const RootComponent = {
        components: { ChildComponent, Primitive },
        template: '<Primitive><ChildComponent /></Primitive>',
      }

      const screen = await render(RootComponent, {
        props: {
          as: 'template',
        },
      })

      const element = screen.container.querySelector('div')!
      expect(element.outerHTML).toBe('<div id="child">Hello world</div>')
    })

    it('should inherit parent attributes and the child attributes', async () => {
      const screen = await render(Primitive, {
        props: {
          as: 'template',
        },
        attrs: {
          'data-parent-attr': '',
        },
        slots: {
          default: '<div data-child-attr>Child class</div>',
        },
      })

      const element = screen.container.querySelector('div')!
      await expect.element(element).toHaveAttribute('data-parent-attr', '')
      await expect.element(element).toHaveAttribute('data-child-attr', '')
    })

    it('should replace parent attributes with child\'s attributes', async () => {
      const screen = await render(Primitive, {
        props: {
          as: 'template',
        },
        attrs: {
          'id': 'parent',
          'data-type': 'button',
        },
        slots: {
          default: '<div id="child" data-type="primary">Child class</div>',
        },
      })

      const element = screen.container.querySelector('div')!
      await expect.element(element).toHaveAttribute('data-type', 'primary')
      // `'id' in el` is true in both environments and Chromium's IDL setter
      // reflects, so this reads identically on both sides.
      await expect.element(element).toHaveAttribute('id', 'child')
    })

    it('\'asChild=true\' should work the same as \'as=template\'', async () => {
      const screen = await render(Primitive, {
        props: {
          asChild: true,
        },
        attrs: {
          class: 'parent-class',
        },
        slots: {
          default: '<button class="child-class">Child element</button>',
        },
      })

      const element = screen.getByRole('button')
      await expect.element(element).toBeInTheDocument()
      await expect.element(element).toHaveAttribute('class', 'parent-class child-class')
    })
  })
})
