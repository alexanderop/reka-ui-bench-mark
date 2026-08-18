import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, nextTick } from 'vue'
import { FocusScope } from '.'
import { ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport } from '../Combobox'
import { DialogContent, DialogRoot, DialogTitle, DialogTrigger } from '../Dialog'
import { SelectContent, SelectItem, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from '../Select'

const INNER_NAME_INPUT_LABEL = 'Name'
const INNER_EMAIL_INPUT_LABEL = 'Email'
const INNER_SUBMIT_LABEL = 'Submit'

const TestField = ({
  props: { label: String },
  template: `<label><span>{{ label }}</span><input type="text" :name="label.toLowerCase()" v-bind="$attrs" /></label>`,
})

describe('focusScope', () => {
  describe('given a default FocusScope', () => {
    let screen: Awaited<ReturnType<typeof render>>
    let focusContainer: HTMLElement
    let tabbableFirst: HTMLInputElement
    let tabbableSecond: HTMLInputElement
    let tabbableLast: HTMLButtonElement

    beforeEach(async () => {
      screen = await render(defineComponent({
        components: { TestField, FocusScope },
        template: `<div><FocusScope asChild loop trapped><form data-testid="focus-scope">
          <TestField label=${INNER_NAME_INPUT_LABEL} /><TestField label=${INNER_EMAIL_INPUT_LABEL} /><button>${INNER_SUBMIT_LABEL}</button>
        </form></FocusScope><TestField label="other" /><button>some outer button</button></div>`,
      }))
      focusContainer = screen.getByTestId('focus-scope').element()
      tabbableFirst = screen.getByLabelText(INNER_NAME_INPUT_LABEL).element() as HTMLInputElement
      tabbableSecond = screen.getByLabelText(INNER_EMAIL_INPUT_LABEL).element() as HTMLInputElement
      tabbableLast = screen.getByText(INNER_SUBMIT_LABEL, { exact: true }).element() as HTMLButtonElement
    })

    it('should focus the next element in the scope on tab', async () => {
      tabbableFirst.focus()
      await userEvent.tab()
      expect(tabbableSecond).toBe(document.activeElement)
    })

    it('should focus the last element in the scope on shift+tab from the first element in scope', async () => {
      tabbableFirst.focus()
      await userEvent.tab({ shift: true })
      expect(tabbableLast).toHaveFocus()
    })

    it('should focus the first element in scope on tab from the last element in scope', async () => {
      tabbableLast.focus()
      await userEvent.tab()
      expect(tabbableFirst).toHaveFocus()
    })

    it('should focus container when focused element is removed from the DOM', async () => {
      tabbableFirst.focus()
      tabbableFirst.remove()
      await nextTick()
      expect(focusContainer).toHaveFocus()
    })
  })

  describe('given a FocusScope where the first focusable has a negative tabindex', () => {
    let tabbableSecond: HTMLInputElement
    let tabbableLast: HTMLButtonElement

    beforeEach(async () => {
      const screen = await render(defineComponent({
        components: { TestField, FocusScope },
        template: `<div><FocusScope asChild loop trapped><form>
          <TestField label=${INNER_NAME_INPUT_LABEL} tabIndex="-1" /><TestField label=${INNER_EMAIL_INPUT_LABEL} /><button>${INNER_SUBMIT_LABEL}</button>
        </form></FocusScope><TestField label="other" /><button>some outer button</button></div>`,
      }))
      tabbableSecond = screen.getByLabelText(INNER_EMAIL_INPUT_LABEL).element() as HTMLInputElement
      tabbableLast = screen.getByText(INNER_SUBMIT_LABEL, { exact: true }).element() as HTMLButtonElement
    })

    it('should skip the element with a negative tabindex on tab', async () => {
      tabbableLast.focus()
      await userEvent.tab()
      expect(tabbableSecond).toHaveFocus()
    })

    it('should skip the element with a negative tabindex on shift+tab', async () => {
      tabbableSecond.focus()
      await userEvent.tab({ shift: true })
      expect(tabbableLast).toHaveFocus()
    })
  })

  describe('given a FocusScope with internal focus handlers', () => {
    const handleLastFocusableElementBlur = vi.fn()
    let tabbableFirst: HTMLInputElement

    beforeEach(async () => {
      const screen = await render(defineComponent({
        components: { TestField, FocusScope },
        setup: () => ({ handleLastFocusableElementBlur }),
        template: `<div><FocusScope asChild loop trapped><form>
          <TestField label=${INNER_NAME_INPUT_LABEL} /><button @blur="handleLastFocusableElementBlur">${INNER_SUBMIT_LABEL}</button>
        </form></FocusScope></div>`,
      }))
      tabbableFirst = screen.getByLabelText(INNER_NAME_INPUT_LABEL).element() as HTMLInputElement
    })

    it('should properly blur the last element in the scope before cycling back', async () => {
      tabbableFirst.focus()
      await userEvent.tab({ shift: true })
      await userEvent.tab()
      expect(handleLastFocusableElementBlur).toHaveBeenCalledTimes(1)
    })
  })

  describe('given a FocusScope with SelectTrigger inside Dialog (#2550)', () => {
    const DialogWithSelect = defineComponent({
      components: { DialogRoot, DialogTrigger, DialogContent, DialogTitle, SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem },
      template: `<DialogRoot><DialogTrigger>Open</DialogTrigger><DialogContent><DialogTitle>Test Dialog</DialogTitle>
        <input data-testid="email-input" type="text" placeholder="you@example.com" /><SelectRoot><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent><SelectItem value="a">Option A</SelectItem><SelectItem value="b">Option B</SelectItem></SelectContent></SelectRoot>
      </DialogContent></DialogRoot>`,
    })

    it('should auto-focus the first tabbable element when SelectTrigger is present', async () => {
      const screen = await render(DialogWithSelect)
      const trigger = screen.getByRole('button', { name: 'Open' })
      await trigger.click()
      await expect.element(screen.getByTestId('email-input')).toHaveFocus()
      await userEvent.keyboard('{Escape}')
      await trigger.click()
      await expect.element(screen.getByTestId('email-input')).toHaveFocus()
      await userEvent.keyboard('{Escape}')
    })
  })

  describe('given a FocusScope with Combobox input inside Dialog (#2749)', () => {
    const DialogWithCombobox = defineComponent({
      components: { DialogRoot, DialogTrigger, DialogContent, DialogTitle, ComboboxRoot, ComboboxAnchor, ComboboxTrigger, ComboboxPortal, ComboboxContent, ComboboxViewport, ComboboxInput, ComboboxItem },
      template: `<DialogRoot><DialogTrigger>Open</DialogTrigger><DialogContent><DialogTitle>Test Dialog</DialogTitle>
        <ComboboxRoot><ComboboxAnchor as-child><ComboboxTrigger>Open combobox</ComboboxTrigger></ComboboxAnchor><ComboboxPortal>
          <ComboboxContent position="popper"><ComboboxViewport><ComboboxInput data-testid="combobox-input" />
            <ComboboxItem value="a">Option A</ComboboxItem><ComboboxItem value="b">Option B</ComboboxItem>
          </ComboboxViewport></ComboboxContent>
        </ComboboxPortal></ComboboxRoot></DialogContent></DialogRoot>`,
    })

    it('should let the Combobox input keep focus inside a Dialog', async () => {
      const screen = await render(DialogWithCombobox)
      await screen.getByRole('button', { name: 'Open' }).click()
      await screen.getByText('Open combobox', { exact: true }).click()
      const input = screen.getByTestId('combobox-input').element() as HTMLInputElement
      await expect.element(input).toHaveFocus()
      input.focus()
      await nextTick()
      expect(input).toHaveFocus()
    })
  })

  describe('given a FocusScope with portaled Select content inside Dialog (#2749)', () => {
    const DialogWithSelect = defineComponent({
      components: { DialogRoot, DialogTrigger, DialogContent, DialogTitle, SelectRoot, SelectPortal, SelectTrigger, SelectValue, SelectContent, SelectViewport, SelectItem },
      template: `<DialogRoot><DialogTrigger>Open</DialogTrigger><DialogContent><DialogTitle>Test Dialog</DialogTitle>
        <SelectRoot><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectPortal>
          <SelectContent data-testid="select-content" position="popper"><SelectViewport><SelectItem value="a">Option A</SelectItem><SelectItem value="b">Option B</SelectItem></SelectViewport></SelectContent>
        </SelectPortal></SelectRoot></DialogContent></DialogRoot>`,
    })

    it('should move focus into the Select content, not trap it back to the Dialog', async () => {
      const screen = await render(DialogWithSelect)
      await screen.getByRole('button', { name: 'Open' }).click()
      await userEvent.click(screen.getByRole('combobox').element())
      const content = screen.getByTestId('select-content').element()
      await expect.poll(() => content.contains(document.activeElement)).toBe(true)
      await userEvent.keyboard('{Escape}')
    })
  })
})
