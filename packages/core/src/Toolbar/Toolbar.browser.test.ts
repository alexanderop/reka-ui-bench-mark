import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref } from 'vue'
import Toolbar from './story/_Toolbar.vue'
import ToolbarRoot from './ToolbarRoot.vue'
import ToolbarToggleGroup from './ToolbarToggleGroup.vue'
import ToolbarToggleItem from './ToolbarToggleItem.vue'

// Browser-mode port of `Toolbar.test.ts`. A T2 file: the original installs no
// stubs, so there is nothing to delete. Three mechanical differences:
//
//  - `mount(Toolbar, { attachTo: document.body })` → `await render(Toolbar)`.
//    `render` attaches its own container and unmounts it afterwards, so the
//    two explicit `wrapper.unmount()` calls in the second describe are gone.
//  - `wrapper.findAll('button')` → `screen.getByRole('button').elements()`.
//    Verified equivalent for this fixture: both return the same 7 elements in
//    the same DOM order (6 `ToolbarToggleItem`s + the `Share` `ToolbarButton`;
//    `ToolbarLink` is an `<a>` and is role `link`, not `button`).
//  - `wrapper.find('[role="toolbar"]').attributes('tabindex')` →
//    `expect.element(screen.getByRole('toolbar')).toHaveAttribute(...)`, which
//    retries rather than reading synchronously. The original's `nextTick()` is
//    deliberately absent: the assertion owns the wait for its DOM outcome.

describe('given default Toolbar', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Toolbar>>>
  let triggers: HTMLElement[]

  beforeEach(async () => {
    screen = await render(Toolbar)
    triggers = screen.getByRole('button').elements() as HTMLElement[]
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container)).toHaveNoViolations()
  })

  it('should have default selected value', () => {
    const selected = triggers.filter(i => i.getAttribute('data-state') === 'on')
    expect(selected.includes(triggers[4])).toBeTruthy()
  })

  // Since Toolbar is just a collection of ToggleGroup, so would exclude the test here
})

describe('given Toolbar with all ToolbarToggleItem disabled', () => {
  it('should not be tabbable when all toggle items are disabled', async () => {
    const TestComponent = defineComponent({
      components: {
        ToolbarRoot,
        ToolbarToggleGroup,
        ToolbarToggleItem,
      },
      setup() {
        const model = ref([])
        return { model }
      },
      template: `
        <ToolbarRoot aria-label="Test toolbar">
          <ToolbarToggleGroup v-model="model" type="multiple" aria-label="Formatting">
            <ToolbarToggleItem value="bold" disabled>Bold</ToolbarToggleItem>
            <ToolbarToggleItem value="italic" disabled>Italic</ToolbarToggleItem>
            <ToolbarToggleItem value="underline" disabled>Underline</ToolbarToggleItem>
          </ToolbarToggleGroup>
        </ToolbarRoot>
      `,
    })

    const screen = await render(TestComponent)

    // The ToolbarRoot should have tabindex="-1" since all items are disabled
    await expect.element(screen.getByRole('toolbar')).toHaveAttribute('tabindex', '-1')
  })

  it('should be tabbable when at least one toggle item is not disabled', async () => {
    const TestComponent = defineComponent({
      components: {
        ToolbarRoot,
        ToolbarToggleGroup,
        ToolbarToggleItem,
      },
      setup() {
        const model = ref([])
        return { model }
      },
      template: `
        <ToolbarRoot aria-label="Test toolbar">
          <ToolbarToggleGroup v-model="model" type="multiple" aria-label="Formatting">
            <ToolbarToggleItem value="bold">Bold</ToolbarToggleItem>
            <ToolbarToggleItem value="italic" disabled>Italic</ToolbarToggleItem>
            <ToolbarToggleItem value="underline" disabled>Underline</ToolbarToggleItem>
          </ToolbarToggleGroup>
        </ToolbarRoot>
      `,
    })

    const screen = await render(TestComponent)

    // The ToolbarRoot should have tabindex="0" since there are focusable items
    await expect.element(screen.getByRole('toolbar')).toHaveAttribute('tabindex', '0')
  })
})
